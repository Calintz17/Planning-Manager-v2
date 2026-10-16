// Astra 2026-10-16. Run ONLY on the isolated tests/retail/bm/setup.js fixture.
// No Supabase access: snapshot saves and cross-highlights are replaced during the probe.
// No names or real planning data. Reports current behavior, including known failures.
(() => {
  const saved = { agents, agentPrefs, agentLeaves, storeSettings, storeCorners, RETAIL_SHIFTS,
    regulations, planningOverrides, cornerOverrides, intradayOverrides, addedMissions,
    monthlyRef, planSnapshot, monthlyResult, savePlanSnapshot, attachCrossHighlight };
  const result = {};
  try {
    agents = saved.agents.slice(0, 2).map((a, i) => ({ ...a, id: 'probe' + i,
      first_name: 'Agent', last_name: String(i + 1), status: 'SA', home_corner_id: null }));
    agentPrefs = {}; agentLeaves = []; storeCorners = [];
    storeSettings = { ...saved.storeSettings, min_opening: 1, min_closing: 1,
      fairness_rotation: false, sunday_single_shift: false };
    regulations = { ...saved.regulations, day_hours: Object.fromEntries(
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(k => [k, { open: 10, close: 18 }])),
      public_holidays: [], closed_dates: [], saturday_rest: false, sunday_rest: false,
      weekly_hours: 50, max_daily_hours: 10,
      breaks: [{ name: 'Lunch', duration: 60, window_start: 10, window_end: 11 }] };
    RETAIL_SHIFTS = { sales: [{ code: 'X', startMin: 480, endMin: 1080, tone: 'open' }], stock: [] };
    planningOverrides = Object.fromEntries(agents.map(a => [a.id, { '2026-11-14': 'X' }]));
    cornerOverrides = {}; intradayOverrides = {}; addedMissions = {};
    monthlyRef = new Date(2026, 10, 1); planSnapshot = null;
    savePlanSnapshot = async () => {}; attachCrossHighlight = () => {};
    renderMonthlyPlanning(); renderIntraday('2026-11-14');
    result.automatic = intradayExport.rows.map(r => ({ agent: r.agentId,
      lunch: r.blocks.filter(b => b.type === 'lun').map(b => ({ start: b.start, duration: b.dur,
        withinWindow: b.start >= 10 && b.start + b.dur <= 11 })) }));

    // A manual value must not depend on the existence of an automatic candidate.
    RETAIL_SHIFTS.sales = [{ code: 'X', startMin: 720, endMin: 1230, tone: 'close' }];
    intradayOverrides[agents[0].id + ':lun'] = 795; // 13:15, in shift, outside 10-11.
    renderMonthlyPlanning(); renderIntraday('2026-11-14');
    const row = intradayExport.rows.find(r => r.agentId === agents[0].id);
    result.manualWithNoAutomaticWindow = { storedStartMin: 795,
      renderedLunch: row.blocks.find(b => b.type === 'lun') || null };
    return JSON.stringify(result);
  } finally {
    agents = saved.agents; agentPrefs = saved.agentPrefs; agentLeaves = saved.agentLeaves;
    storeSettings = saved.storeSettings; storeCorners = saved.storeCorners;
    RETAIL_SHIFTS = saved.RETAIL_SHIFTS; regulations = saved.regulations;
    planningOverrides = saved.planningOverrides; cornerOverrides = saved.cornerOverrides;
    intradayOverrides = saved.intradayOverrides; addedMissions = saved.addedMissions;
    monthlyRef = saved.monthlyRef; planSnapshot = saved.planSnapshot; monthlyResult = saved.monthlyResult;
    savePlanSnapshot = saved.savePlanSnapshot; attachCrossHighlight = saved.attachCrossHighlight;
  }
})()
