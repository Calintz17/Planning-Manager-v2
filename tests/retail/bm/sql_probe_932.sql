-- Local PostgreSQL test of CAST_v9_3_2_RETAIL.sql (not Supabase). Synthetic ids only.
-- 1) run the BASE part on an empty database, 2) optionally CAST_v9_3_0 or 9_3_1 SQL, 3) CAST_v9_3_2 twice, 4) the PROBE part.
-- BASE
create role anon nologin; create role authenticated nologin;
create table retail_stores (id uuid primary key);
create table retail_agents (id uuid primary key, store_id uuid references retail_stores(id));
insert into retail_stores values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b');
insert into retail_agents values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b');
alter default privileges in schema public grant all on tables to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- PROBE
grant select on retail_agents, retail_stores to anon, authenticated;
grant all on retail_planning_edits to anon, authenticated;
set role anon;
\echo same-store insert:
insert into retail_planning_edits (store_id, agent_id, date, field, new_value) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','2026-11-02','shift','O');
\echo cross-store insert (must fail):
insert into retail_planning_edits (store_id, agent_id, date, field, new_value) values ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000a1','2026-11-02','shift','O');
\echo bad field (must fail):
insert into retail_planning_edits (store_id, agent_id, date, field, new_value) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','2026-11-02','xx','O');
\echo bad source (must fail):
insert into retail_planning_edits (store_id, agent_id, date, field, new_value, actor_source) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','2026-11-02','shift','O','engine');
\echo rows visible to anon (must be 0):
select count(*) from retail_planning_edits;
\echo update / delete by anon (must touch 0):
update retail_planning_edits set new_value='C';
delete from retail_planning_edits;
reset role;
\echo rows really stored, policies, constraints:
select count(*) from retail_planning_edits;
select policyname, cmd from pg_policies where tablename='retail_planning_edits';
select conname, convalidated from pg_constraint where conrelid='retail_planning_edits'::regclass and contype<>'p' order by 1;
