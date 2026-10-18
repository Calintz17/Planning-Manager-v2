-- CAST Retail 9.5.0.2, run BEFORE pushing 9.5.0.2 (18 Oct 2026).
-- 9.5.0.2 no longer reads the old work percentage: the contract is the weekly hours typed in the advisor sheet,
-- else the store's default weekly hours. The advisors still on a percentage get their hours written once.
-- On 18-10 this is one advisor (part-time, 50 % of 40 h = 20 h).
update public.retail_agents a
set weekly_hours = round(r.rule_value::numeric * a.work_pct / 100, 1)
from public.retail_regulations r
where r.store_id = a.store_id and r.rule_key = 'weekly_hours'
  and a.weekly_hours is null and a.work_pct <> 100;
-- Check: must return 0
select count(*) as still_on_a_percentage from public.retail_agents where weekly_hours is null and work_pct <> 100;
