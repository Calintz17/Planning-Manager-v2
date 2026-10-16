// Claude 2026-10-16, Retail 9.3.4. Run ONLY after tests/retail/bm/setup.js, in an isolated candidate page (stubbed Supabase).
// Real Monthly save path (applyCellOverride): a change that breaks a rule the planning kept is refused before any write.
// 1) two sellers, one O and one C a day: the closer set to O. CAST is not frozen here (no saved planning), so the other seller
//    may take the closing: then the change is valid and saved. 2) an absence is always saved. 3) three sellers, C (8 h paid)
//    asked five times in one week with a 37.5 h limit: the change that would break the limit is refused.
(async () => {
  const saved = { agents, agentPrefs, agentLeaves, storeCorners, storeSettings, regulations, RETAIL_SHIFTS, planningOverrides,
    cornerOverrides, availability, calHolidays, calOverrides, monthlyRef, planSnapshot, savePlanSnapshot, attachCrossHighlight, renderDashboard };
  const out = {}, from = sb.from; let writes = 0;
  sb.from = function(t) { if (t === 'retail_planning_overrides') writes++; return from.apply(this, arguments); };
  let N = 2;
  function base() {
    agents = saved.agents.slice(0, N).map((a, i) => ({ ...a, id: 'probe' + i, first_name: 'Agent', last_name: String(i + 1), status: 'SA', home_corner_id: null }));
    agentPrefs = {}; agentLeaves = []; storeCorners = [];
    storeSettings = { ...saved.storeSettings, min_opening: 1, min_closing: 1, sunday_single_shift: false, fairness_rotation: false, closing_ratio: 0.5 };
    regulations = { ...saved.regulations, weekly_hours: 37.5, max_daily_hours: 8.5, max_days: 5, max_consecutive_days: 5, public_holidays: [], closed_dates: [],
      breaks: [{ name: 'Lunch', duration: 60, window_start: 12, window_end: 15 }],
      day_hours: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(k => [k, { open: 9, close: 21 }])) };
    RETAIL_SHIFTS = { sales: [{ code: 'O', startMin: 540, endMin: 1050, tone: 'open' }, { code: 'C', startMin: 720, endMin: 1260, tone: 'close' }], stock: [] };
    planningOverrides = {}; cornerOverrides = {}; availability = {}; calHolidays = {}; calOverrides = {};
    monthlyRef = new Date(2026, 10, 1); planSnapshot = null; savePlanSnapshot = async () => {}; attachCrossHighlight = () => {}; renderDashboard = () => {};
    switchPlanningView('monthly'); renderMonthlyPlanning();
  }
  async function edit(id, ds, value) {
    writes = 0; cellEditorState = { agentId: id, ds: ds }; multiSelect = [];
    await applyCellOverride(value);
    return { value, saved: (planningOverrides[id] || {})[ds] === value, writes, toast: document.getElementById('toast').textContent };
  }
  try {
    base();
    const ds = '2026-11-14', closer = agents.find(a => coverOf(a, ds, monthlyResult[ds][a.id]).close);
    out.lastCloserToO = await edit(closer.id, ds, 'O');
    out.absenceAlwaysSaved = await edit(closer.id, ds, 'A');
    N = 3; base();
    const a = agents[0];
    out.week = [];
    for (const d of [2, 3, 4, 5, 6]) out.week.push(await edit(a.id, '2026-11-0' + d, 'C'));
    return JSON.stringify(out);
  } finally {
    sb.from = from;
    Object.keys(saved).forEach(k => { try { eval(k + ' = saved[k]'); } catch (e) {} });
  }
})()
