-- CAST Retail accounts, part 1 of 2 (18 Oct 2026). Additive only: the live app ignores all of it.
-- Profiles, store links, access functions, and two admin tools for Roman (run from the Supabase SQL editor).
-- Part 2 (2026-10-18_retail_accounts_part2.sql) closes public access. Apply it only after the 9.5.0.0 page is live.

-- 1. Who is who
create table if not exists public.retail_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  role       text not null check (role in ('manager', 'director', 'admin')),
  region_id  uuid references public.retail_regions(id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint retail_profiles_director_region check (role <> 'director' or region_id is not null)
);
create table if not exists public.retail_profile_stores (
  user_id  uuid not null references public.retail_profiles(user_id) on delete cascade,
  store_id uuid not null references public.retail_stores(id) on delete cascade,
  primary key (user_id, store_id)
);
alter table public.retail_profiles enable row level security;
alter table public.retail_profile_stores enable row level security;
revoke all on public.retail_profiles, public.retail_profile_stores from anon, authenticated;
grant select on public.retail_profiles, public.retail_profile_stores to authenticated;

-- 2. Access functions (one place to audit). They read the profile tables as their owner, so no policy recursion.
create or replace function public.retail_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.retail_profiles p
                 where p.user_id = auth.uid() and p.active and p.role = 'admin');
$$;
create or replace function public.retail_can_access_store(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.retail_profiles p
    where p.user_id = auth.uid() and p.active and p_store is not null and (
      p.role = 'admin'
      or (p.role = 'director' and exists (
            select 1 from public.retail_stores s join public.retail_countries c on c.id = s.country_id
            where s.id = p_store and c.region_id = p.region_id))
      or (p.role = 'manager' and exists (
            select 1 from public.retail_profile_stores ps where ps.user_id = p.user_id and ps.store_id = p_store))));
$$;
create or replace function public.retail_can_access_agent(p_agent uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.retail_can_access_store((select a.store_id from public.retail_agents a where a.id = p_agent));
$$;
create or replace function public.retail_can_access_corner(p_corner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.retail_can_access_store((select c.store_id from public.retail_corners c where c.id = p_corner));
$$;
create or replace function public.retail_can_access_country(p_country uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.retail_is_admin()
      or exists (select 1 from public.retail_stores s where s.country_id = p_country and public.retail_can_access_store(s.id));
$$;
create or replace function public.retail_can_access_region(p_region uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.retail_is_admin()
      or exists (select 1 from public.retail_profiles p where p.user_id = auth.uid() and p.active and p.role = 'director' and p.region_id = p_region)
      or exists (select 1 from public.retail_countries c where c.region_id = p_region and public.retail_can_access_country(c.id));
$$;
-- The agent (or corner) belongs to the same store as the row: a row can never point into another store
create or replace function public.retail_agent_in_store(p_agent uuid, p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.retail_agents a where a.id = p_agent and a.store_id = p_store);
$$;
create or replace function public.retail_corner_in_store(p_corner uuid, p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.retail_corners c where c.id = p_corner and c.store_id = p_store);
$$;
create or replace function public.retail_corner_of_agent_store(p_corner uuid, p_agent uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.retail_corners c join public.retail_agents a on a.store_id = c.store_id
                 where c.id = p_corner and a.id = p_agent);
$$;
revoke all on function public.retail_is_admin(), public.retail_can_access_store(uuid), public.retail_can_access_agent(uuid),
  public.retail_can_access_corner(uuid), public.retail_can_access_country(uuid), public.retail_can_access_region(uuid),
  public.retail_agent_in_store(uuid, uuid), public.retail_corner_in_store(uuid, uuid), public.retail_corner_of_agent_store(uuid, uuid)
  from public, anon;
grant execute on function public.retail_is_admin(), public.retail_can_access_store(uuid), public.retail_can_access_agent(uuid),
  public.retail_can_access_corner(uuid), public.retail_can_access_country(uuid), public.retail_can_access_region(uuid),
  public.retail_agent_in_store(uuid, uuid), public.retail_corner_in_store(uuid, uuid), public.retail_corner_of_agent_store(uuid, uuid)
  to authenticated;

-- 3. Profiles: everyone reads their own, the admin reads all. Nobody writes from the app (Roman only, in SQL).
drop policy if exists retail_profiles_read on public.retail_profiles;
create policy retail_profiles_read on public.retail_profiles for select to authenticated
  using (user_id = auth.uid() or public.retail_is_admin());
drop policy if exists retail_profile_stores_read on public.retail_profile_stores;
create policy retail_profile_stores_read on public.retail_profile_stores for select to authenticated
  using (user_id = auth.uid() or public.retail_is_admin());

-- 4. Who changed a planning square (filled by the server from the signed-in account)
alter table public.retail_planning_edits add column if not exists actor_id uuid default auth.uid();

-- 5. Admin tools, for the Supabase SQL editor only (nobody can call them from the app)
-- Create:  select public.retail_admin_create_account('name@celine.fr', 'password', 'manager', 'First Last', null, array['Paris Montaigne']);
--          role: 'manager' (stores), 'director' (region name, e.g. 'EMEA'), 'admin' (everything)
-- Delete:  select public.retail_admin_delete_account('name@celine.fr');
create or replace function public.retail_admin_create_account(p_email text, p_password text, p_role text,
  p_full_name text default '', p_region text default null, p_stores text[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid(); v_email text := lower(trim(p_email)); v_region uuid; v_count int;
begin
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'An account already exists for %', v_email;
  end if;
  if p_region is not null then
    select r.id into v_region from public.retail_regions r where r.name = p_region;
    if v_region is null then raise exception 'Unknown region: %', p_region; end if;
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());
  insert into public.retail_profiles (user_id, email, full_name, role, region_id)
  values (v_id, v_email, coalesce(p_full_name, ''), p_role, v_region);
  insert into public.retail_profile_stores (user_id, store_id)
  select v_id, s.id from public.retail_stores s where s.name = any (coalesce(p_stores, '{}'));
  get diagnostics v_count = row_count;
  if v_count <> coalesce(cardinality(p_stores), 0) then
    raise exception 'Unknown store in %', p_stores;
  end if;
  return v_id;
end $$;
create or replace function public.retail_admin_delete_account(p_email text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.users u where lower(u.email) = lower(trim(p_email));
  return found;
end $$;
revoke all on function public.retail_admin_create_account(text, text, text, text, text, text[]),
  public.retail_admin_delete_account(text) from public, anon, authenticated;

-- Check: two tables, nine access functions, two admin tools
-- select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('retail_profiles', 'retail_profile_stores');
