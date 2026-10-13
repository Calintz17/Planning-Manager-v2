-- CAST Retail 9.3.0 (optional): trace of every change made by a manager on the planning.
-- Without this table, 9.3.0 works the same and simply logs nothing.
create table if not exists retail_planning_edits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  agent_id uuid not null,
  date date not null,
  field text not null,            -- 'shift' or 'corner'
  old_value text,
  new_value text,
  actor_source text not null default 'manager_edit',  -- manager_edit, manager_import
  changed_at timestamptz not null default now()
);
create index if not exists retail_planning_edits_store_date on retail_planning_edits (store_id, date);
alter table retail_planning_edits enable row level security;
create policy "edits read" on retail_planning_edits for select using (true);
create policy "edits insert" on retail_planning_edits for insert with check (true);
