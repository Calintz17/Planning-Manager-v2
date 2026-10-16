// Astra: run ONLY after tests/retail/bm/setup.js, in an isolated candidate page.
// No Supabase writes. Synthetic 2-person fixture; snapshot persistence disabled temporarily.
(() => {
  if (currentStoreId !== 'bm' || !agents.every(a => a.first_name === 'Agent')) {
    throw new Error('Use only the anonymised shared test fixture, never production');
  }
  const saved = { agents, agentPrefs, agentLeaves, storeCorners, storeSettings, regulations,
    RETAIL_SHIFTS, planningOverrides, cornerOverrides, availability, calHolidays, calOverrides,
    monthlyRef, monthlyResult, planSnapshot, savePlanSnapshot, attachCrossHighlight };
  const out = {};
  function base() {
    agents = saved.agents.slice(0, 2).map((a, i) => ({ ...a, id: 'probe' + i, status: 'SA', home_corner_id: null }));
    agentPrefs = {}; agentLeaves = []; storeCorners = [];
    storeSettings = { ...saved.storeSettings, min_opening: 1, min_closing: 1,
      sunday_single_shift: false, fairness_rotation: false };
    regulations = { ...saved.regulations, weekly_hours: 37.5, max_daily_hours: 8.5,
      max_days: 5, max_consecutive_days: 5, public_holidays: [], closed_dates: [],
      breaks: [{ name: 'Lunch', duration: 60, window_start: 12, window_end: 15 }],
      day_hours: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
        .map(k => [k, { open: 9, close: 21 }])) };
    RETAIL_SHIFTS = { sales: [{ code: 'O', startMin: 540, endMin: 1050, tone: 'open' },
      { code: 'C', startMin: 750, endMin: 1260, tone: 'close' }], stock: [] };
    planningOverrides = {}; cornerOverrides = {}; availability = {}; calHolidays = {}; calOverrides = {};
    monthlyRef = new Date(2026, 10, 1); planSnapshot = null;
    savePlanSnapshot = async () => {}; attachCrossHighlight = () => {};
  }
  function boundary() {
    const ds = '2026-11-14';
    return { opening: agents.filter(a => coverOf(a, ds, monthlyResult[ds][a.id]).open).length,
      closing: agents.filter(a => coverOf(a, ds, monthlyResult[ds][a.id]).close).length };
  }
  try {
    base(); agents.forEach(a => planningOverrides[a.id] = { '2026-11-14': 'O' });
    renderMonthlyPlanning(); out.allManualEarly = boundary();
    base(); RETAIL_SHIFTS.sales[1].startMin = 720;
    planningOverrides[agents[0].id] = Object.fromEntries([2, 3, 4, 5, 6].map(d => ['2026-11-' + String(d).padStart(2, '0'), 'C']));
    renderMonthlyPlanning();
    out.manualWeek = { limitHours: 37.5, paidHours: [2, 3, 4, 5, 6].reduce((n, d) => {
      const ds = '2026-11-' + String(d).padStart(2, '0'), a = agents[0];
      const wh = workHoursOf(a, ds, monthlyResult[ds][a.id]);
      return n + (wh ? paidMinOf(wh.start, wh.end) / 60 : 0);
    }, 0) };
    base(); storeSettings.min_opening = storeSettings.min_closing = 0; storeSettings.closing_ratio = 0;
    renderMonthlyPlanning(); out.zeroConfiguredMinima = boundary();
    out.firstAndLastHour = [coverOfHours(540, 600, { open: 540, close: 1260 }),
      coverOfHours(541, 1050, { open: 540, close: 1260 }),
      coverOfHours(540, 599, { open: 540, close: 1260 }),
      coverOfHours(1200, 1260, { open: 540, close: 1260 }),
      coverOfHours(1201, 1290, { open: 540, close: 1260 }),
      coverOfHours(1190, 1259, { open: 540, close: 1260 })];
    return JSON.stringify(out);
  } finally {
    agents = saved.agents; agentPrefs = saved.agentPrefs; agentLeaves = saved.agentLeaves;
    storeCorners = saved.storeCorners; storeSettings = saved.storeSettings; regulations = saved.regulations;
    RETAIL_SHIFTS = saved.RETAIL_SHIFTS; planningOverrides = saved.planningOverrides;
    cornerOverrides = saved.cornerOverrides; availability = saved.availability;
    calHolidays = saved.calHolidays; calOverrides = saved.calOverrides;
    monthlyRef = saved.monthlyRef; monthlyResult = saved.monthlyResult; planSnapshot = saved.planSnapshot;
    savePlanSnapshot = saved.savePlanSnapshot; attachCrossHighlight = saved.attachCrossHighlight;
  }
})()
