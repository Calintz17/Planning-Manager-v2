// Run in the synthetic browser bench AFTER setup.js (clock 2026-10-31 12:00), not on production.
// Final-check probes (Astra 9.3.1 audit, P1/P2): manual cells force a plan that breaks one rule across a limit,
// then one dry render of November returns the final check's findings for that agent. No Supabase write.
// Expected with 9.3.2: twoWeeks 1 (9 days for a cap of 8), row 2, week 2 and hours 900 min (7 days in a row from Oct 26, cap 5),
// day 30 (a D day is 10 h - 1 h lunch = 9 h paid, cap 8.5 h).
(() => {
  const a = agents.find(x => poolOf(x) === 'sales');
  const keep = { planningOverrides, calHolidays, calOverrides, monthlyRef, planSnapshot, regs: JSON.parse(JSON.stringify(regulations)) };
  function days(from, n) { const r = []; for (let i = 0; i < n; i++) { const d = new Date(from + 'T12:00:00'); d.setDate(d.getDate() + i); r.push(toDateStr(d)); } return r; }
  function probe(cells, setup) {
    planningOverrides = { [a.id]: {} };
    days('2026-10-19', 56).forEach(ds => planningOverrides[a.id][ds] = 'OFF');
    Object.assign(planningOverrides[a.id], cells);
    if (setup) setup();
    switchPlanningView('monthly'); monthlyRef = new Date(2026, 10, 1);
    planSnapshot = { storeId: currentStoreId, month: '2026-11-01', ok: false, plan: null, prevPlan: null, history: [] };
    habitsGate.dry = true; habitsGate.issues = null;
    try { renderMonthlyPlanning(); } finally { habitsGate.dry = false; }
    const mine = {}; Object.keys(habitsGate.issues || {}).forEach(k => { if (k.split('|')[1] === a.id) mine[k] = habitsGate.issues[k]; });
    Object.assign(regulations, JSON.parse(JSON.stringify(keep.regs))); calHolidays = keep.calHolidays; calOverrides = keep.calOverrides;
    return mine;
  }
  const out = {};
  try {
    const O = ds => ({ [ds]: 'O' });
    out.nineDaysOverTwoWeeks = probe(Object.assign({}, ...days('2026-11-02', 5).map(O), ...days('2026-11-09', 4).map(O)),
      () => { regulations.max_days_2weeks = 8; });
    out.runFromOctober = probe(Object.assign({}, ...days('2026-10-26', 7).map(O)),
      () => { regulations.max_consecutive_days = 5; calHolidays = {}; calOverrides = {}; });
    out.longDay = probe({ '2026-11-03': 'D' }, () => { regulations.max_daily_hours = 8.5; });
    return JSON.stringify(out);
  } finally {
    planningOverrides = keep.planningOverrides; calHolidays = keep.calHolidays; calOverrides = keep.calOverrides;
    monthlyRef = keep.monthlyRef; planSnapshot = keep.planSnapshot; Object.assign(regulations, keep.regs);
  }
})()
