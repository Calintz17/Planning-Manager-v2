-- CAST Retail 10.0.0.1: a director (or an admin) can cancel a sending or a validation (19 Oct 2026).
-- Run after 2026-10-19_retail_reviews.sql, in the Supabase SQL editor. Additive; it can be run again safely.
--
-- Cancel (like "Reopen" in a ticketing tool): the last sending of a store and month, waiting or validated, goes back to
-- the store as cancelled. The month is free again, the manager can change it and send it again (new revision).
-- Nothing is lost: every step is kept in the history of the sending (who, when, comment).
begin;

-- 1. The new state and the history of each sending
alter table public.retail_plan_reviews add column if not exists history jsonb not null default '[]'::jsonb;
alter table public.retail_plan_reviews drop constraint if exists retail_plan_reviews_status_check;
alter table public.retail_plan_reviews add constraint retail_plan_reviews_status_check
  check (status in ('pending', 'withdrawn', 'returned', 'validated', 'cancelled'));

-- One step of the history, with the signed-in account and the server clock
create or replace function public.retail_review_step(p_status text, p_comment text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status', p_status, 'by', auth.uid(),
    'name', coalesce((select coalesce(nullif(p.full_name, ''), p.email) from public.retail_profiles p where p.user_id = auth.uid()), ''),
    'at', now(), 'comment', left(coalesce(p_comment, ''), 2000));
$$;
revoke all on function public.retail_review_step(text, text) from public, anon, authenticated;

-- 2. The three steps of 10.0.0.0, the same, now writing their history
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
                                          submitted_by, submitted_by_name, history)
  values (p_store, p_month, v_rev, 'pending', p_plan, p_context, p_diagnostics, auth.uid(), coalesce(v_name, ''),
          jsonb_build_array(public.retail_review_step('pending', '')))
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
    decided_at = now(), history = history || public.retail_review_step('withdrawn', '') where id = p_id;
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
    decided_at = now(), history = history || public.retail_review_step(p_decision, p_comment) where id = p_id;
  return jsonb_build_object('id', p_id, 'revision', r.revision, 'status', p_decision);
end $$;

-- 3. Cancel: only the last sending of the store and month, while it waits or once validated. The store sees it as new
-- again in its notifications (the "seen" marks of this sending are cleared).
create or replace function public.retail_cancel_review(p_id uuid, p_revision int, p_comment text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.retail_plan_reviews%rowtype; v_name text;
begin
  select * into r from public.retail_plan_reviews where id = p_id for update;
  if not found or not public.retail_can_review(r.store_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('retail_review:' || r.store_id::text || ':' || r.month));
  if r.revision <> p_revision or r.status not in ('pending', 'validated')
     or exists (select 1 from public.retail_plan_reviews x where x.store_id = r.store_id and x.month = r.month and x.revision > r.revision) then
    raise exception 'changed meanwhile' using errcode = '40001';
  end if;
  select coalesce(nullif(p.full_name, ''), p.email) into v_name from public.retail_profiles p where p.user_id = auth.uid();
  update public.retail_plan_reviews set status = 'cancelled', comment = left(coalesce(p_comment, ''), 2000),
    decided_by = auth.uid(), decided_by_name = coalesce(v_name, ''), decided_at = now(),
    history = history || public.retail_review_step('cancelled', p_comment) where id = p_id;
  delete from public.retail_review_seen where review_id = p_id;
  return jsonb_build_object('id', p_id, 'revision', r.revision, 'status', 'cancelled');
end $$;

revoke all on function public.retail_submit_review(uuid, text, jsonb, jsonb, jsonb), public.retail_withdraw_review(uuid, int),
  public.retail_decide_review(uuid, int, text, jsonb, text), public.retail_cancel_review(uuid, int, text) from public, anon;
grant execute on function public.retail_submit_review(uuid, text, jsonb, jsonb, jsonb), public.retail_withdraw_review(uuid, int),
  public.retail_decide_review(uuid, int, text, jsonb, text), public.retail_cancel_review(uuid, int, text) to authenticated;

commit;
-- Check after the run (should give 1 column, 1 function):
-- select count(*) from information_schema.columns where table_name = 'retail_plan_reviews' and column_name = 'history';
-- select count(*) from pg_proc where proname = 'retail_cancel_review';
