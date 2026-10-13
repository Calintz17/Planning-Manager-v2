-- CAST Retail 9.3.1 (optional): trace of every change made by a manager on the planning.
-- Without this table, 9.3.1 works the same and logs nothing. Safe to run twice.
-- The site uses the public key: clients may only ADD rows, in the expected shape. Nobody can read, change or delete
-- them from the site; reading is done from the Supabase dashboard.
create table if not exists retail_planning_edits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references retail_stores(id) on delete cascade,
  agent_id uuid not null references retail_agents(id) on delete cascade,
  date date not null,
  field text not null check (field in ('shift', 'corner')),
  old_value text,
  new_value text,                -- null = back to CAST's choice
  actor_source text not null default 'manager_edit' check (actor_source in ('manager_edit', 'manager_import')),
  changed_at timestamptz not null default now()
);
create index if not exists retail_planning_edits_store_date on retail_planning_edits (store_id, date);
alter table retail_planning_edits enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'retail_planning_edits' and policyname = 'edits insert only') then
    create policy "edits insert only" on retail_planning_edits for insert to anon, authenticated
      with check (exists (select 1 from retail_agents a where a.id = agent_id and a.store_id = store_id));
  end if;
end $$;
