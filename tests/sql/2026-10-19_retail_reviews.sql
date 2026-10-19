-- CAST Retail 10.0.0.0: sending a planning for validation (19 Oct 2026). Additive only: tables, functions, policies.
-- Needs the account parts 1 and 2 (18 Oct). Run once in the Supabase SQL editor; it can be run again safely.
--
-- Who does what (checked here, in the base, whatever the page sends):
--   send, withdraw   : admin (any store), manager (his stores)
--   validate, return : admin (any store, his own sendings included), director (stores of his region)
--   while a month is sent and waiting (pending), a manager cannot change that month of that store: he withdraws first.
--   Directors and admins keep every right, so they can correct during the review.
-- Rows of the reviews are never written directly: only the three functions below write them, with the author and the
-- date taken from the signed-in account and the server clock.
begin;

-- 1. One row per sending. The sent copy never changes; the reviewed copy is the plan when the decision was taken.
create table if not exists public.retail_plan_reviews (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.retail_stores(id) on delete cascade,
  month             text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  revision          integer not null check (revision > 0),
  status            text not null check (status in ('pending', 'withdrawn', 'returned', 'validated')),
  submitted_plan    jsonb not null,
  reviewed_plan     jsonb,
  context           jsonb,
  diagnostics       jsonb,
  comment           text not null default '',
  submitted_by      uuid,
  submitted_by_name text not null default '',
  submitted_at      timestamptz not null default now(),
  decided_by        uuid,
  decided_by_name   text not null default '',
  decided_at        timestamptz,
  unique (store_id, month, revision)
);
create unique index if not exists retail_plan_reviews_one_pending on public.retail_plan_reviews (store_id, month) where status = 'pending';
create index if not exists retail_plan_reviews_store_month on public.retail_plan_reviews (store_id, month, revision desc);
create index if not exists retail_plan_reviews_submitted_by on public.retail_plan_reviews (submitted_by, decided_at desc);
create index if not exists retail_plan_reviews_pending on public.retail_plan_reviews (status, submitted_at desc);

-- 2. "Seen" for each person (a notification read by one person stays new for the others)
create table if not exists public.retail_review_seen (
  review_id uuid not null references public.retail_plan_reviews(id) on delete cascade,
  user_id   uuid not null default auth.uid(),
  seen_at   timestamptz not null default now(),
  primary key (review_id, user_id)
);

alter table public.retail_plan_reviews enable row level security;
alter table public.retail_review_seen enable row level security;
revoke all on public.retail_plan_reviews, public.retail_review_seen from public, anon, authenticated;
grant select on public.retail_plan_reviews to authenticated;
grant select, insert on public.retail_review_seen to authenticated;
drop policy if exists retail_plan_reviews_read on public.retail_plan_reviews;
create policy retail_plan_reviews_read on public.retail_plan_reviews for select to authenticated
  using (public.retail_can_access_store(store_id));
drop policy if exists retail_review_seen_own on public.retail_review_seen;
create policy retail_review_seen_own on public.retail_review_seen for select to authenticated using (user_id = auth.uid());
drop policy if exists retail_review_seen_mark on public.retail_review_seen;
create policy retail_review_seen_mark on public.retail_review_seen for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.retail_plan_reviews r
                                               where r.id = review_id and public.retail_can_access_store(r.store_id)));

-- 3. Rights per action
create or replace function public.retail_can_submit(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.retail_profiles p
                 where p.user_id = auth.uid() and p.active and p_store is not null and (
                   p.role = 'admin'
                   or (p.role = 'manager' and exists (select 1 from public.retail_profile_stores ps
                                                      where ps.user_id = p.user_id and ps.store_id = p_store))));
$$;
create or replace function public.retail_can_review(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.retail_profiles p
                 where p.user_id = auth.uid() and p.active and p_store is not null and (
                   p.role = 'admin'
                   or (p.role = 'director' and exists (
                         select 1 from public.retail_stores s join public.retail_countries c on c.id = s.country_id
                         where s.id = p_store and c.region_id = p.region_id))));
$$;
-- A manager cannot change days of a month that is waiting for validation (first to last day, inclusive)
create or replace function public.retail_range_locked(p_store uuid, p_from date, p_to date) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_store is not null and p_from is not null
     and exists (select 1 from public.retail_profiles p where p.user_id = auth.uid() and p.role = 'manager')
     and exists (select 1 from public.retail_plan_reviews r
                 where r.store_id = p_store and r.status = 'pending'
                   and r.month between to_char(p_from, 'YYYY-MM') and to_char(coalesce(p_to, p_from), 'YYYY-MM'));
$$;
create or replace function public.retail_agent_range_locked(p_agent uuid, p_from date, p_to date) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.retail_range_locked((select a.store_id from public.retail_agents a where a.id = p_agent), p_from, p_to);
$$;
revoke all on function public.retail_can_submit(uuid), public.retail_can_review(uuid),
  public.retail_range_locked(uuid, date, date), public.retail_agent_range_locked(uuid, date, date) from public, anon;
grant execute on function public.retail_can_submit(uuid), public.retail_can_review(uuid),
  public.retail_range_locked(uuid, date, date), public.retail_agent_range_locked(uuid, date, date) to authenticated;

-- 4. The month lock on every table that changes the days of a month. Restrictive: it adds to the store rules, never
-- widens them. Reading is never locked.
do $$
declare r record;
begin
  for r in select * from (values
      ('retail_planning_overrides', 'public.retail_agent_range_locked(%1$s.agent_id, %1$s.date, %1$s.date)'),
      ('retail_corner_overrides',   'public.retail_agent_range_locked(%1$s.agent_id, %1$s.date, %1$s.date)'),
      ('retail_agent_leave',        'public.retail_range_locked(%1$s.store_id, %1$s.start_date, %1$s.end_date)'),
      ('retail_intraday_overrides', 'public.retail_range_locked(%1$s.store_id, %1$s.date, %1$s.date)'),
      ('retail_intraday_missions',  'public.retail_range_locked(%1$s.store_id, %1$s.date, %1$s.date)'),
      ('retail_planning_events',    'public.retail_range_locked(%1$s.store_id, %1$s.start_date, %1$s.end_date)'),
      ('retail_calendar_overrides', 'public.retail_range_locked(%1$s.store_id, %1$s.date, %1$s.date)'),
      ('retail_planning_snapshot',  'public.retail_range_locked(%1$s.store_id, %1$s.month, %1$s.month)')
    ) as t(tbl, expr)
  loop
    execute format('drop policy if exists %I on public.%I', r.tbl || '_lock_ins', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_lock_upd', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_lock_del', r.tbl);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not %s)',
      r.tbl || '_lock_ins', r.tbl, format(r.expr, r.tbl));
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (not %s) with check (not %s)',
      r.tbl || '_lock_upd', r.tbl, format(r.expr, r.tbl), format(r.expr, r.tbl));
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (not %s)',
      r.tbl || '_lock_del', r.tbl, format(r.expr, r.tbl));
  end loop;
end $$;

-- 5. The three steps. Each one runs in one transaction, locks its row and checks the expected revision, so two
-- decisions at the same time give one success and one clear "changed meanwhile" error, never half a write.
create or replace function public.retail_submit_review(p_store uuid, p_month text, p_plan jsonb,
  p_context jsonb default null, p_diagnostics jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rev int; v_id uuid; v_name text;
begin
  if not public.retail_can_submit(p_store) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_month is null or p_month !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'bad month'; end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then raise exception 'empty planning'; end if;
  perform pg_advisory_xact_lock(hashtext('retail_review:' || p_store::text || ':' || p_month));
  if exists (select 1 from public.retail_plan_reviews where store_id = p_store and month = p_month and status = 'pending') then
    raise exception 'already pending' using errcode = '40001';
  end if;
  select coalesce(max(revision), 0) + 1 into v_rev from public.retail_plan_reviews where store_id = p_store and month = p_month;
  select coalesce(nullif(p.full_name, ''), p.email) into v_name from public.retail_profiles p where p.user_id = auth.uid();
  insert into public.retail_plan_reviews (store_id, month, revision, status, submitted_plan, context, diagnostics,
                                          submitted_by, submitted_by_name)
  values (p_store, p_month, v_rev, 'pending', p_plan, p_context, p_diagnostics, auth.uid(), coalesce(v_name, ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'revision', v_rev, 'status', 'pending');
end $$;

create or replace function public.retail_withdraw_review(p_id uuid, p_revision int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.retail_plan_reviews%rowtype; v_name text;
begin
  select * into r from public.retail_plan_reviews where id = p_id for update;
  if not found or not public.retail_can_submit(r.store_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status <> 'pending' or r.revision <> p_revision then raise exception 'changed meanwhile' using errcode = '40001'; end if;
  select coalesce(nullif(p.full_name, ''), p.email) into v_name from public.retail_profiles p where p.user_id = auth.uid();
  update public.retail_plan_reviews set status = 'withdrawn', decided_by = auth.uid(), decided_by_name = coalesce(v_name, ''),
    decided_at = now() where id = p_id;
  return jsonb_build_object('id', p_id, 'revision', r.revision, 'status', 'withdrawn');
end $$;

-- Validate is never refused because of the rules (Roman, 18 Oct): the check result stays in diagnostics.
create or replace function public.retail_decide_review(p_id uuid, p_revision int, p_decision text, p_plan jsonb,
  p_comment text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.retail_plan_reviews%rowtype; v_name text;
begin
  if p_decision not in ('validated', 'returned') then raise exception 'bad decision'; end if;
  select * into r from public.retail_plan_reviews where id = p_id for update;
  if not found or not public.retail_can_review(r.store_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status <> 'pending' or r.revision <> p_revision then raise exception 'changed meanwhile' using errcode = '40001'; end if;
  select coalesce(nullif(p.full_name, ''), p.email) into v_name from public.retail_profiles p where p.user_id = auth.uid();
  update public.retail_plan_reviews set status = p_decision, reviewed_plan = coalesce(p_plan, r.submitted_plan),
    comment = left(coalesce(p_comment, ''), 2000), decided_by = auth.uid(), decided_by_name = coalesce(v_name, ''),
    decided_at = now() where id = p_id;
  return jsonb_build_object('id', p_id, 'revision', r.revision, 'status', p_decision);
end $$;

revoke all on function public.retail_submit_review(uuid, text, jsonb, jsonb, jsonb), public.retail_withdraw_review(uuid, int),
  public.retail_decide_review(uuid, int, text, jsonb, text) from public, anon;
grant execute on function public.retail_submit_review(uuid, text, jsonb, jsonb, jsonb), public.retail_withdraw_review(uuid, int),
  public.retail_decide_review(uuid, int, text, jsonb, text) to authenticated;

commit;
-- Check after the run (should give 2 tables, 7 functions, 24 lock rules):
-- select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('retail_plan_reviews', 'retail_review_seen');
-- select count(*) from pg_proc where proname in ('retail_can_submit','retail_can_review','retail_range_locked','retail_agent_range_locked','retail_submit_review','retail_withdraw_review','retail_decide_review');
-- select count(*) from pg_policies where policyname like '%\_lock\_%';
