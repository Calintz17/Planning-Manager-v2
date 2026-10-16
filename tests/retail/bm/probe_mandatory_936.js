// Claude 2026-10-16, Retail 9.3.6. Run ONLY after tests/retail/bm/setup.js, in an isolated candidate page (stubbed Supabase).
// Astra's minimal example (contract 9.3.5): M1 and M2 prefer O, A can close.
// 1) A works: M1=O, M2=O, A=C. 2) A absent: one manager closes (preferences give way). 3) M1 and M2 both set to O by hand,
// nobody else can close: the second change is refused (nothing written), the planning is not saved as valid.
(async () => {
  const saved = { agents, agentPrefs, agentLeaves, storeCorners, storeSettings, regulations, RETAIL_SHIFTS, planningOverrides, cornerOverrides,
    availability, calHolidays, calOverrides, monthlyRef, planSnapshot, savePlanSnapshot, attachCrossHighlight, renderDashboard };
  const from = sb.from, out = {}, ds = '2026-11-14';
  try {
    savePlanSnapshot = async () => {}; attachCrossHighlight = () => {}; renderDashboard = () => {};
    function base(withA) {
      agents = [{ id: 'm1', first_name: 'Agent', last_name: 'M1', status: 'MANAGER', work_pct: 100, home_corner_id: null },
                { id: 'm2', first_name: 'Agent', last_name: 'M2', status: 'MANAGER', work_pct: 100, home_corner_id: null }]
        .concat(withA ? [{ id: 'sa', first_name: 'Agent', last_name: 'A', status: 'SA', work_pct: 100, home_corner_id: null }] : []);
      agentPrefs = { m1: { preferred_shift: 'O' }, m2: { preferred_shift: 'O' } }; agentLeaves = []; storeCorners = [];
      storeSettings = { ...saved.storeSettings, min_opening: 1, min_closing: 1, sunday_single_shift: false, fairness_rotation: false, closing_ratio: 0.5 };
      regulations = { ...saved.regulations, weekly_hours: 0, max_days: 7, max_consecutive_days: 7, max_days_2weeks: 14, public_holidays: [], closed_dates: [],
        breaks: [], day_hours: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(k => [k, { open: 10, close: 20 }])) };
      RETAIL_SHIFTS = { sales: [{ code: 'O', startMin: 570, endMin: 1080, tone: 'open' }, { code: 'C', startMin: 720, endMin: 1230, tone: 'close' }], stock: [] };
      planningOverrides = {}; cornerOverrides = {}; availability = {}; calHolidays = {}; calOverrides = {};
      monthlyRef = new Date(2026, 10, 1); planSnapshot = null; switchPlanningView('monthly'); renderMonthlyPlanning();
    }
    const cells = () => Object.fromEntries(agents.map(a => [a.id, (monthlyResult[ds][a.id] || {}).code]));
    base(true); out.withSeller = cells();
    base(true); availability = { sa: { [ds]: 'absent' } }; renderMonthlyPlanning(); out.sellerAbsent = cells();
    base(false); agentPrefs = {};
    let writes = 0; sb.from = function(t) { if (t === 'retail_planning_overrides') writes++; return from.apply(this, arguments); };
    for (const id of ['m1', 'm2']) { cellEditorState = { agentId: id, ds }; multiSelect = []; await applyCellOverride('O'); }
    out.bothLockedO = { overrides: { m1: (planningOverrides.m1 || {})[ds], m2: (planningOverrides.m2 || {})[ds] }, writes, toast: document.getElementById('toast').textContent };
    return JSON.stringify(out);
  } finally {
    sb.from = from; Object.keys(saved).forEach(k => { try { eval(k + ' = saved[k]'); } catch (e) {} });
  }
})()
