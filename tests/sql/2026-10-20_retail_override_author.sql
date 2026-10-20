-- CAST Retail 10.0.0.8: who changed a planning square by hand, and when (shown when the pointer is on the square).
-- Run once in the Supabase SQL editor, BEFORE publishing the 10.0.0.8 page. Safe to run again.
-- The server writes the name and the time itself, from the signed-in account: the page cannot write them.

alter table public.retail_planning_overrides add column if not exists changed_by uuid;
alter table public.retail_planning_overrides add column if not exists changed_by_name text;
alter table public.retail_planning_overrides add column if not exists changed_at timestamptz;
alter table public.retail_corner_overrides add column if not exists changed_by uuid;
alter table public.retail_corner_overrides add column if not exists changed_by_name text;
alter table public.retail_corner_overrides add column if not exists changed_at timestamptz;

create or replace function public.retail_stamp_override() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.changed_by := auth.uid();
  new.changed_at := now();
  new.changed_by_name := coalesce((select p.full_name from public.retail_profiles p where p.user_id = auth.uid()), '');
  return new;
end $$;
revoke all on function public.retail_stamp_override() from public, anon, authenticated;

drop trigger if exists retail_planning_overrides_stamp on public.retail_planning_overrides;
create trigger retail_planning_overrides_stamp before insert or update on public.retail_planning_overrides
  for each row execute function public.retail_stamp_override();
drop trigger if exists retail_corner_overrides_stamp on public.retail_corner_overrides;
create trigger retail_corner_overrides_stamp before insert or update on public.retail_corner_overrides
  for each row execute function public.retail_stamp_override();

-- Check: 2 triggers, 6 columns
select tgname from pg_trigger where tgname in ('retail_planning_overrides_stamp', 'retail_corner_overrides_stamp');
select table_name, column_name from information_schema.columns
 where table_schema = 'public' and table_name in ('retail_planning_overrides', 'retail_corner_overrides')
   and column_name in ('changed_by', 'changed_by_name', 'changed_at') order by 1, 2;
