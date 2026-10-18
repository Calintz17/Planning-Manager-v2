-- CAST Retail accounts, part 2 of 2 (18 Oct 2026): the switch. Closes public access to every retail_* table.
-- Apply ONLY after the 9.5.0.0 page (with sign in) is live, otherwise the live page cannot read anything.
-- Needs part 1. CSC tables are not touched. No way back to public access: fix forward.
begin;

-- 1. Remove every old policy on retail_* tables (the "public: ALL: true" ones), except the profile ones from part 1
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename like 'retail\_%'
             and tablename not in ('retail_profiles', 'retail_profile_stores')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 2. Grants: nothing for anon; authenticated can read and write rows (policies decide which ones). No TRUNCATE.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'retail\_%'
             and c.relname not in ('retail_profiles', 'retail_profile_stores')
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- 3. Store tables: the row's store must be one of yours (old row and new row)
do $$
declare t text;
begin
  foreach t in array array['retail_calendar_overrides', 'retail_corners', 'retail_highlights', 'retail_planning_events',
    'retail_planning_snapshot', 'retail_regulations', 'retail_shift_config', 'retail_store_settings',
    'retail_traffic_daily', 'retail_traffic_monthly']
  loop
    execute format('create policy %I on public.%I for all to authenticated using (public.retail_can_access_store(store_id)) with check (public.retail_can_access_store(store_id))', t || '_scope', t);
  end loop;
end $$;

-- 4. Agents: your store, and the home corner belongs to the same store
create policy retail_agents_scope on public.retail_agents for all to authenticated
  using (public.retail_can_access_store(store_id))
  with check (public.retail_can_access_store(store_id)
              and (home_corner_id is null or public.retail_corner_in_store(home_corner_id, store_id)));

-- 5. Store + agent: both in your store, and the agent in the row's store
create policy retail_agent_leave_scope on public.retail_agent_leave for all to authenticated
  using (public.retail_can_access_store(store_id))
  with check (public.retail_can_access_store(store_id) and public.retail_agent_in_store(agent_id, store_id));
create policy retail_intraday_overrides_scope on public.retail_intraday_overrides for all to authenticated
  using (public.retail_can_access_store(store_id))
  with check (public.retail_can_access_store(store_id) and public.retail_agent_in_store(agent_id, store_id));
create policy retail_intraday_missions_scope on public.retail_intraday_missions for all to authenticated
  using (public.retail_can_access_store(store_id))
  with check (public.retail_can_access_store(store_id) and public.retail_agent_in_store(agent_id, store_id));

-- 6. Edit log: insert only (as today), in your store, signed by the server
revoke select, update, delete on public.retail_planning_edits from authenticated;
create policy retail_planning_edits_insert on public.retail_planning_edits for insert to authenticated
  with check (public.retail_can_access_store(store_id) and public.retail_agent_in_store(agent_id, store_id)
              and actor_id is not distinct from auth.uid());

-- 7. Agent tables: the agent is in your store
do $$
declare t text;
begin
  foreach t in array array['retail_agent_availability', 'retail_agent_prefs', 'retail_agent_tags']
  loop
    execute format('create policy %I on public.%I for all to authenticated using (public.retail_can_access_agent(agent_id)) with check (public.retail_can_access_agent(agent_id))', t || '_scope', t);
  end loop;
end $$;

-- 8. Agent + corner: the agent is in your store, the corner in the agent's store
create policy retail_planning_overrides_scope on public.retail_planning_overrides for all to authenticated
  using (public.retail_can_access_agent(agent_id))
  with check (public.retail_can_access_agent(agent_id)
              and (corner_id is null or public.retail_corner_of_agent_store(corner_id, agent_id)));
create policy retail_corner_overrides_scope on public.retail_corner_overrides for all to authenticated
  using (public.retail_can_access_agent(agent_id))
  with check (public.retail_can_access_agent(agent_id)
              and (corner_id is null or public.retail_corner_of_agent_store(corner_id, agent_id)));

-- 9. Corner traffic: the corner is in your store
create policy retail_corner_traffic_monthly_scope on public.retail_corner_traffic_monthly for all to authenticated
  using (public.retail_can_access_corner(corner_id)) with check (public.retail_can_access_corner(corner_id));

-- 10. Regions, countries, stores: you read what is yours; only an admin changes them
create policy retail_regions_read on public.retail_regions for select to authenticated using (public.retail_can_access_region(id));
create policy retail_regions_admin on public.retail_regions for all to authenticated using (public.retail_is_admin()) with check (public.retail_is_admin());
create policy retail_countries_read on public.retail_countries for select to authenticated using (public.retail_can_access_country(id));
create policy retail_countries_admin on public.retail_countries for all to authenticated using (public.retail_is_admin()) with check (public.retail_is_admin());
create policy retail_stores_read on public.retail_stores for select to authenticated using (public.retail_can_access_store(id));
create policy retail_stores_admin on public.retail_stores for all to authenticated using (public.retail_is_admin()) with check (public.retail_is_admin());

-- 11. Region tables the Retail page does not use: admin only
do $$
declare t text;
begin
  foreach t in array array['retail_forecasts', 'retail_historical_volume', 'retail_monthly_bo_targets',
    'retail_tasks', 'retail_schedule_overrides']
  loop
    execute format('create policy %I on public.%I for all to authenticated using (public.retail_is_admin()) with check (public.retail_is_admin())', t || '_admin', t);
  end loop;
end $$;

-- 12. Two old functions nobody calls, open to anyone: closed
revoke execute on function public.seed_defaults_for_current_user(text) from public, anon, authenticated;
revoke execute on function public.add_agent_for_current_user(text, text) from public, anon, authenticated;

-- 13. Safety: every retail_* table must have at least one policy, and anon no right left
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
