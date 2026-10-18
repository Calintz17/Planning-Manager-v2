-- Isolated copy for the account tests: Supabase roles, auth schema, and the 29 retail_* tables (schema only, read on 18 Oct 2026).
-- No data from the real base. Used by test_accounts.py on a local PostgreSQL 16.
do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; create role authenticated nologin; end if; end $$;
create schema extensions; create extension pgcrypto schema extensions;
create schema auth;
grant usage on schema auth, extensions to anon, authenticated;
create table auth.users (instance_id uuid, id uuid primary key, aud varchar, role varchar, email varchar, encrypted_password varchar,
  email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
  confirmation_token varchar, recovery_token varchar, email_change_token_new varchar, email_change varchar);
create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null, provider text not null, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
grant usage on schema public to anon, authenticated;

create table public.retail_agent_availability (id uuid not null default gen_random_uuid(), agent_id uuid not null, week_date date not null, day_status text not null default 'working'::text, is_present boolean not null default true, UNIQUE (agent_id, week_date), PRIMARY KEY (id));
create table public.retail_agent_leave (id uuid not null default gen_random_uuid(), agent_id uuid not null, start_date date not null, end_date date not null, type text not null, store_id uuid, PRIMARY KEY (id));
create table public.retail_agent_prefs (agent_id uuid not null, shift_pref text not null default 'none'::text, weekend_ok boolean not null default true, avoid_days integer[] not null default '{}'::integer[], notes text, updated_at timestamp with time zone not null default now(), fixed_schedule jsonb, rotates boolean not null default true, preferred_shift text, PRIMARY KEY (agent_id));
create table public.retail_agent_tags (agent_id uuid not null, tag text not null, PRIMARY KEY (agent_id, tag));
create table public.retail_agents (id uuid not null default gen_random_uuid(), first_name text not null, last_name text not null, is_active boolean not null default true, work_pct integer not null default 100, status text not null default 'SA'::text, store_id uuid, home_corner_id uuid, corner_skills text[] not null default '{}'::text[], weekly_hours numeric, weekly_hours_history jsonb, PRIMARY KEY (id));
create table public.retail_calendar_overrides (id uuid not null default gen_random_uuid(), date date not null, is_open boolean not null, store_id uuid, open_time integer, close_time integer, PRIMARY KEY (id), UNIQUE (store_id, date));
create table public.retail_corner_overrides (id uuid not null default gen_random_uuid(), agent_id uuid not null, date date not null, corner_id uuid, created_at timestamp with time zone not null default now(), UNIQUE (agent_id, date), PRIMARY KEY (id));
create table public.retail_corner_traffic_monthly (id uuid not null default gen_random_uuid(), corner_id uuid not null, year integer not null, month integer not null, n_2 integer not null default 0, last_year integer not null default 0, current_year integer, source text not null default 'empty'::text, updated_at timestamp with time zone not null default now(), UNIQUE (corner_id, year, month), PRIMARY KEY (id));
create table public.retail_corners (id uuid not null default gen_random_uuid(), store_id uuid not null, code text not null, full_name text not null, sort_order integer not null default 0, created_at timestamp with time zone not null default now(), PRIMARY KEY (id), UNIQUE (store_id, code));
create table public.retail_countries (id uuid not null default gen_random_uuid(), region_id uuid not null, name text not null, iso_code text not null, sort_order integer not null default 0, created_at timestamp with time zone not null default now(), PRIMARY KEY (id), UNIQUE (region_id, name));
create table public.retail_forecasts (id uuid not null default gen_random_uuid(), region_id uuid not null, forecast_date date not null, contact_volume integer not null default 0, aht_minutes numeric not null default 0, PRIMARY KEY (id), UNIQUE (region_id, forecast_date));
create table public.retail_highlights (id uuid not null default gen_random_uuid(), store_id uuid not null, start_date date not null, end_date date not null, text text not null, created_at timestamp with time zone default now(), PRIMARY KEY (id));
create table public.retail_historical_volume (id uuid not null default gen_random_uuid(), region_id uuid, date date not null, hour integer not null, task text not null, volume integer not null default 0, PRIMARY KEY (id), UNIQUE (region_id, date, hour, task));
create table public.retail_intraday_missions (id uuid not null default gen_random_uuid(), store_id uuid not null, date date not null, agent_id uuid not null, mission_type text not null, start_min integer not null, created_at timestamp with time zone default now(), duration_min integer, PRIMARY KEY (id));
create table public.retail_intraday_overrides (id uuid not null default gen_random_uuid(), store_id uuid not null, date date not null, agent_id uuid not null, block_type text not null, start_min integer not null, created_at timestamp with time zone default now(), PRIMARY KEY (id), UNIQUE (store_id, date, agent_id, block_type));
create table public.retail_monthly_bo_targets (id uuid not null default gen_random_uuid(), region_id uuid not null, year integer not null, month integer not null, task text not null, volume integer not null default 0, PRIMARY KEY (id), UNIQUE (region_id, year, month, task));
create table public.retail_planning_edits (id uuid not null default gen_random_uuid(), store_id uuid not null, agent_id uuid not null, date date not null, field text not null, old_value text, new_value text, actor_source text not null default 'manager_edit'::text, changed_at timestamp with time zone not null default now(), PRIMARY KEY (id));
create table public.retail_planning_events (id uuid not null default gen_random_uuid(), store_id uuid not null, category text not null, start_date date not null, end_date date not null, label text not null default ''::text, created_at timestamp with time zone not null default now(), PRIMARY KEY (id));
create table public.retail_planning_overrides (id uuid not null default gen_random_uuid(), agent_id uuid not null, date date not null, value text not null, created_at timestamp with time zone not null default now(), corner_id uuid, UNIQUE (agent_id, date), PRIMARY KEY (id));
create table public.retail_planning_snapshot (store_id uuid not null, month date not null, plan jsonb not null, updated_at timestamp with time zone not null default now(), PRIMARY KEY (store_id, month));
create table public.retail_regions (id uuid not null default gen_random_uuid(), name text not null, city text not null, timezone text not null, PRIMARY KEY (id));
create table public.retail_regulations (id uuid not null default gen_random_uuid(), rule_key text not null, rule_value text not null, store_id uuid, PRIMARY KEY (id), UNIQUE (store_id, rule_key));
create table public.retail_schedule_overrides (id uuid not null default gen_random_uuid(), region_id uuid not null, agent_id uuid not null, date date not null, override_type text not null, slot_key text not null, value text, UNIQUE (agent_id, date, override_type, slot_key), PRIMARY KEY (id));
create table public.retail_shift_config (id uuid not null default gen_random_uuid(), store_id uuid not null, code text not null, label text not null, grid text not null default 'sales'::text, start_min integer not null, end_min integer not null, sort_order integer not null default 0, is_active boolean not null default true, tone text not null default 'close'::text, is_opening boolean not null default false, is_closing boolean not null default false, PRIMARY KEY (id), UNIQUE (store_id, code));
create table public.retail_store_settings (store_id uuid not null, saturday_open boolean not null default true, sunday_open boolean not null default false, day_hours jsonb not null default '{}'::jsonb, updated_at timestamp with time zone not null default now(), hourly_curve jsonb, min_opening integer not null default 1, min_closing integer not null default 1, closing_ratio numeric not null default 0.5, fairness_rotation boolean not null default false, sunday_single_shift boolean not null default true, intraday_reinforcement boolean not null default false, PRIMARY KEY (store_id));
create table public.retail_stores (id uuid not null default gen_random_uuid(), country_id uuid not null, name text not null, city text, is_active boolean not null default true, sort_order integer not null default 0, created_at timestamp with time zone not null default now(), UNIQUE (country_id, name), PRIMARY KEY (id));
create table public.retail_tasks (id uuid not null default gen_random_uuid(), region_id uuid not null, name text not null, priority integer not null default 1, is_filler boolean not null default false, color_bg text, color_text text, aht_minutes numeric not null default 0, PRIMARY KEY (id), UNIQUE (region_id, name));
create table public.retail_traffic_daily (id uuid not null default gen_random_uuid(), store_id uuid not null, date date not null, traffic integer not null default 0, is_manual boolean not null default false, updated_at timestamp with time zone not null default now(), PRIMARY KEY (id), UNIQUE (store_id, date));
create table public.retail_traffic_monthly (id uuid not null default gen_random_uuid(), store_id uuid not null, year integer not null, month integer not null, last_year integer not null default 0, current_year integer, source text not null default 'empty'::text, updated_at timestamp with time zone not null default now(), n_2 integer not null default 0, PRIMARY KEY (id), UNIQUE (store_id, year, month));
alter table public.retail_agent_tags add FOREIGN KEY (agent_id) REFERENCES retail_agents(id) ON DELETE CASCADE;
alter table public.retail_agent_availability add FOREIGN KEY (agent_id) REFERENCES retail_agents(id) ON DELETE CASCADE;
alter table public.retail_agents add FOREIGN KEY (home_corner_id) REFERENCES retail_corners(id) ON DELETE SET NULL;
alter table public.retail_agents add FOREIGN KEY (store_id) REFERENCES retail_stores(id);
alter table public.retail_tasks add FOREIGN KEY (region_id) REFERENCES retail_regions(id) ON DELETE CASCADE;
alter table public.retail_forecasts add FOREIGN KEY (region_id) REFERENCES retail_regions(id) ON DELETE CASCADE;
alter table public.retail_monthly_bo_targets add FOREIGN KEY (region_id) REFERENCES retail_regions(id) ON DELETE CASCADE;
alter table public.retail_regulations add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_schedule_overrides add FOREIGN KEY (agent_id) REFERENCES retail_agents(id) ON DELETE CASCADE;
alter table public.retail_schedule_overrides add FOREIGN KEY (region_id) REFERENCES retail_regions(id) ON DELETE CASCADE;
alter table public.retail_agent_leave add FOREIGN KEY (agent_id) REFERENCES retail_agents(id) ON DELETE CASCADE;
alter table public.retail_agent_leave add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_calendar_overrides add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_historical_volume add FOREIGN KEY (region_id) REFERENCES retail_regions(id) ON DELETE CASCADE;
alter table public.retail_stores add FOREIGN KEY (country_id) REFERENCES retail_countries(id) ON DELETE CASCADE;
alter table public.retail_countries add FOREIGN KEY (region_id) REFERENCES retail_regions(id) ON DELETE CASCADE;
alter table public.retail_traffic_daily add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_shift_config add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_agent_prefs add FOREIGN KEY (agent_id) REFERENCES retail_agents(id) ON DELETE CASCADE;
alter table public.retail_planning_overrides add FOREIGN KEY (agent_id) REFERENCES retail_agents(id) ON DELETE CASCADE;
alter table public.retail_planning_overrides add FOREIGN KEY (corner_id) REFERENCES retail_corners(id) ON DELETE SET NULL;
alter table public.retail_traffic_monthly add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_intraday_overrides add FOREIGN KEY (agent_id) REFERENCES retail_agents(id) ON DELETE CASCADE;
alter table public.retail_intraday_overrides add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_highlights add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_intraday_missions add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_corners add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_corner_traffic_monthly add FOREIGN KEY (corner_id) REFERENCES retail_corners(id) ON DELETE CASCADE;
alter table public.retail_corner_overrides add FOREIGN KEY (agent_id) REFERENCES retail_agents(id) ON DELETE CASCADE;
alter table public.retail_corner_overrides add FOREIGN KEY (corner_id) REFERENCES retail_corners(id) ON DELETE SET NULL;
alter table public.retail_store_settings add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_planning_events add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_planning_snapshot add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;
alter table public.retail_planning_edits add FOREIGN KEY (agent_id) REFERENCES retail_agents(id) ON DELETE CASCADE;
alter table public.retail_planning_edits add FOREIGN KEY (store_id) REFERENCES retail_stores(id) ON DELETE CASCADE;

-- Today's state: RLS on, one "public: ALL: true" policy per table, full grants to anon and authenticated
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'retail\_%'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant all on public.%I to anon, authenticated', t);
    if t <> 'retail_planning_edits' then
      execute format('create policy %I on public.%I for all to public using (true) with check (true)', 'open ' || t, t);
    else
      execute 'create policy "edits insert only" on public.retail_planning_edits for insert to anon, authenticated with check (true)';
    end if;
  end loop;
end $$;
create function public.seed_defaults_for_current_user(p_region text) returns void language sql security definer as $$ select $$;
create function public.add_agent_for_current_user(p_full_name text, p_region text) returns void language sql security definer as $$ select $$;
