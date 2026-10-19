-- CAST Retail 10.0.0.2: the check of the reviewed copy is kept with the decision (19 Oct 2026). It is a record only:
-- it never blocks a decision (Roman, 18 Oct). Run after 2026-10-19_retail_reviews_cancel.sql, in the Supabase SQL
-- editor. Additive; it can be run again safely.
begin;

alter table public.retail_plan_reviews add column if not exists decision_diagnostics jsonb;

-- The decision now takes the check of the reviewed copy too (the old 5-argument version is replaced)
drop function if exists public.retail_decide_review(uuid, int, text, jsonb, text);
create or replace function public.retail_decide_review(p_id uuid, p_revision int, p_decision text, p_plan jsonb,
  p_comment text default '', p_diagnostics jsonb default null)
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
    decided_at = now(), decision_diagnostics = p_diagnostics,
    history = history || public.retail_review_step(p_decision, p_comment) where id = p_id;
  return jsonb_build_object('id', p_id, 'revision', r.revision, 'status', p_decision);
end $$;
revoke all on function public.retail_decide_review(uuid, int, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.retail_decide_review(uuid, int, text, jsonb, text, jsonb) to authenticated;

commit;
-- Check after the run (should give 1 and 1):
-- select count(*) from information_schema.columns where table_name = 'retail_plan_reviews' and column_name = 'decision_diagnostics';
-- select count(*) from pg_proc where proname = 'retail_decide_review';
