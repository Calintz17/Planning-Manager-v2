-- CAST Retail 9.3.2 (optional): trace of every change made by a manager on the planning.
-- Without this table, 9.3.2 works the same and logs nothing.
-- Safe to run on an empty database, after 9.3.0, after 9.3.1, and twice in a row.
-- The site uses the public key: clients may only ADD rows, in the expected shape, for an agent of the same store.
-- Nobody can read, change or delete them from the site; reading is done from the Supabase dashboard.

-- 1. Table (new install)
create table if not exists retail_planning_edits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  agent_id uuid not null,
  date date not null,
  field text not null,
  old_value text,
  new_value text,                -- null = back to CAST's choice
  actor_source text not null default 'manager_edit',
  changed_at timestamptz not null default now()
);
create index if not exists retail_planning_edits_store_date on retail_planning_edits (store_id, date);

-- 2. Constraints (new install and upgrade from 9.3.0, where the table had none; 9.3.1 already has them under these names)
-- Added as NOT VALID: always enforced on new rows. Old rows are then checked; if some old row breaks a rule,
-- the constraint stays enforced for new rows and a notice names it (old rows are never deleted by this script).
do $$
declare c record;
begin
  for c in select * from (values
    ('retail_planning_edits_store_id_fkey', 'foreign key (store_id) references retail_stores(id) on delete cascade'),
    ('retail_planning_edits_agent_id_fkey', 'foreign key (agent_id) references retail_agents(id) on delete cascade'),
    ('retail_planning_edits_field_check','check (field in (''shift'', ''corner''))'),
    ('retail_planning_edits_actor_source_check','check (actor_source in (''manager_edit'', ''manager_import''))')
  ) as t(name, def) loop
    if not exists (select 1 from pg_constraint where conname = c.name and conrelid = 'retail_planning_edits'::regclass) then
      execute format('alter table retail_planning_edits add constraint %I %s not valid', c.name, c.def);
    end if;
    begin
      execute format('alter table retail_planning_edits validate constraint %I', c.name);
    exception when others then
      raise notice 'Constraint % kept for new rows only: some old rows do not match (%).', c.name, sqlerrm;
    end;
  end loop;
end $$;

-- 3. Security: remove every older policy (9.3.0 "edits read" and "edits insert" allowed everything), then one insert policy
alter table retail_planning_edits enable row level security;
drop policy if exists "edits read" on retail_planning_edits;
drop policy if exists "edits insert" on retail_planning_edits;
drop policy if exists "edits insert only" on retail_planning_edits;
create policy "edits insert only" on retail_planning_edits for insert to anon, authenticated
  with check (exists (
    select 1 from retail_agents a
    where a.id = retail_planning_edits.agent_id
      and a.store_id = retail_planning_edits.store_id
  ));
