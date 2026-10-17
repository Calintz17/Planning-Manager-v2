-- Retail 9.4.0.3: dated weekly hours (Roman 17-10, "le passé ne doit jamais changer"). Idempotent.
-- weekly_hours_history = [{"from":"YYYY-MM-DD","hours":37.5}, ...], oldest first. Null: no change recorded yet,
-- weekly_hours (or the store default) applies to every date. No existing row is changed.
alter table public.retail_agents add column if not exists weekly_hours_history jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'retail_agents_weekly_hours_history_check'
                   and conrelid = 'public.retail_agents'::regclass) then
    alter table public.retail_agents add constraint retail_agents_weekly_hours_history_check
      check (weekly_hours_history is null or jsonb_typeof(weekly_hours_history) = 'array');
  end if;
end $$;
comment on column public.retail_agents.weekly_hours_history is
  'Dated weekly hours: [{from, hours}], oldest first. A day keeps the hours valid on that day.';
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'retail_agents' and column_name = 'weekly_hours_history';
