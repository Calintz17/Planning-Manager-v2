-- CAST Retail cleanup (audit 9.5.0.1, Roman 18-10: "code first, then the base, after a backup").
-- Run after 9.5.0.2 is live. Nothing is lost: unused tables move to a private schema (cast_archive, not reachable from
-- the app), unused columns are copied there before being dropped. One transaction: all or nothing.
begin;
create schema if not exists cast_archive;
revoke all on schema cast_archive from public, anon, authenticated;

-- 1. Tables no screen reads or writes (availability: 66 rows of 10-16 Aug, never written by the page)
alter table public.retail_agent_availability set schema cast_archive;
alter table public.retail_forecasts set schema cast_archive;
alter table public.retail_historical_volume set schema cast_archive;
alter table public.retail_monthly_bo_targets set schema cast_archive;
alter table public.retail_schedule_overrides set schema cast_archive;
alter table public.retail_agent_tags set schema cast_archive;
alter table public.retail_tasks set schema cast_archive;

-- 2. Columns no longer read (copied first)
create table cast_archive.retail_agent_prefs_old_columns as
  select agent_id, shift_pref, weekend_ok, notes, preferred_shift from public.retail_agent_prefs;
alter table public.retail_agent_prefs drop column shift_pref, drop column weekend_ok, drop column notes, drop column preferred_shift;
create table cast_archive.retail_shift_config_old_columns as select id, is_opening, is_closing from public.retail_shift_config;
alter table public.retail_shift_config drop column is_opening, drop column is_closing;
create table cast_archive.retail_agents_work_pct as select id, work_pct from public.retail_agents;
alter table public.retail_agents drop column work_pct;

-- 3. Two old functions nobody calls (already closed in the switch)
drop function if exists public.seed_defaults_for_current_user(text);
drop function if exists public.add_agent_for_current_user(text, text);

-- 4. Supabase advisors: duplicates, missing indexes, policies
alter table public.retail_traffic_monthly drop constraint if exists retail_traffic_monthly_store_year_month_key;
drop index if exists public.idx_planning_overrides_agent_date;
create index if not exists retail_agent_leave_store_idx on public.retail_agent_leave (store_id);
create index if not exists retail_agent_leave_agent_idx on public.retail_agent_leave (agent_id);
create index if not exists retail_highlights_store_idx on public.retail_highlights (store_id);
create index if not exists retail_intraday_missions_store_idx on public.retail_intraday_missions (store_id, date);
create index if not exists retail_intraday_overrides_agent_idx on public.retail_intraday_overrides (agent_id);
create index if not exists retail_planning_events_store_idx on public.retail_planning_events (store_id);
create index if not exists retail_planning_edits_agent_idx on public.retail_planning_edits (agent_id);
create index if not exists retail_agents_home_corner_idx on public.retail_agents (home_corner_id);
create index if not exists retail_corner_overrides_corner_idx on public.retail_corner_overrides (corner_id);
create index if not exists retail_planning_overrides_corner_idx on public.retail_planning_overrides (corner_id);
create index if not exists retail_profile_stores_store_idx on public.retail_profile_stores (store_id);
create index if not exists retail_profiles_region_idx on public.retail_profiles (region_id);
-- auth.uid() read once per query, not once per row
drop policy retail_profiles_read on public.retail_profiles;
create policy retail_profiles_read on public.retail_profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.retail_is_admin());
drop policy retail_profile_stores_read on public.retail_profile_stores;
create policy retail_profile_stores_read on public.retail_profile_stores for select to authenticated
  using (user_id = (select auth.uid()) or public.retail_is_admin());
drop policy retail_planning_edits_insert on public.retail_planning_edits;
create policy retail_planning_edits_insert on public.retail_planning_edits for insert to authenticated
  with check (public.retail_can_access_store(store_id) and public.retail_agent_in_store(agent_id, store_id)
              and actor_id is not distinct from (select auth.uid()));
-- Regions, countries, stores: one read policy; the admin one only for changes
do $$
declare t text;
begin
  foreach t in array array['retail_regions', 'retail_countries', 'retail_stores'] loop
    execute format('drop policy %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.retail_is_admin())', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.retail_is_admin()) with check (public.retail_is_admin())', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.retail_is_admin())', t || '_admin_delete', t);
  end loop;
end $$;

-- 5. Same safety check as the switch: every remaining retail_* table has a policy, anon has no right
do $$
declare n int;
begin
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'retail\_%'
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname);
  if n > 0 then raise exception '% retail tables have no policy', n; end if;
  select count(*) into n from information_schema.role_table_grants
  where table_schema = 'public' and table_name like 'retail\_%' and grantee = 'anon';
  if n > 0 then raise exception 'anon still has % grants', n; end if;
end $$;
commit;
