-- Retail 9.4.0.x: weekly hours per advisor (Roman, 17-10). Idempotent: safe to run twice.
-- Applied on the project on 17-10-2026 (migration "retail_agents_weekly_hours"). No existing row is changed:
-- work_pct stays readable for the advisors whose weekly hours are still empty.
alter table public.retail_agents add column if not exists weekly_hours numeric;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'retail_agents_weekly_hours_check'
                   and conrelid = 'public.retail_agents'::regclass) then
    alter table public.retail_agents add constraint retail_agents_weekly_hours_check
      check (weekly_hours is null or (weekly_hours > 0 and weekly_hours <= 80));
  end if;
end $$;
comment on column public.retail_agents.weekly_hours is
  'Paid hours per week of the contract (manager input). Null: the store default (Labor rules weekly_hours) times work_pct.';
-- Check after the migration: the column, its type and the constraint
select column_name, data_type, is_nullable from information_schema.columns
 where table_schema = 'public' and table_name = 'retail_agents' and column_name = 'weekly_hours';
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.retail_agents'::regclass and conname like '%weekly_hours%';
