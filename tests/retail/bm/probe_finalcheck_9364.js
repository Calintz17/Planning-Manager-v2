// Claude 2026-10-17, Retail 9.3.64 TEST. Run ONLY after tests/retail/bm/setup.js in an isolated page (clock 2026-10-31, stubbed Supabase).
// finalCheck states: 'incomplete' when the months around are not known; with them known only training (OUT) weeks stay incomplete
// (their hours are unknown); 'violation' when a mandatory rule is broken. Then a multi-cell change is written in one request.
(async () => {
  const keep = { planSnapshot, planningOverrides, savePlanSnapshot, renderDashboard, from: sb.from };
  const out = {};
  try {
    savePlanSnapshot = async () => true; renderDashboard = () => {};
    switchPlanningView('monthly'); monthlyRef = new Date(2026, 10, 1);
    const base = { storeId: currentStoreId, month: '2026-11-01', ok: true, plan: null, history: [] };
    planSnapshot = { ...base, prevPlan: null, nextPlan: null };
    const r1 = pickMonthlyPlan();
    out.unknownMonths = { status: r1.diagnostics.status, unknown: r1.diagnostics.unknown.length };
    // The months around, all days off except what the plan already shows: everything needed is known
    const offAll = (from, n) => { const p = {}; for (let i = 0; i < n; i++) { const d = new Date(from + 'T12:00:00'); d.setDate(d.getDate() + i); const ds = toDateStr(d); p[ds] = {}; agents.forEach(a => p[ds][a.id] = { code: 'OFF', special: 'off' }); } return p; };
    planSnapshot = { ...base, prevPlan: offAll('2026-09-25', 37), nextPlan: offAll('2026-12-01', 14) };
    const r2 = pickMonthlyPlan();
    out.knownMonths = { status: r2.diagnostics.status, unknown: r2.diagnostics.unknown.length, mandatory: r2.diagnostics.mandatoryIssues.length };
    // A known 23:00 end on Nov 30 and a 9:30 start on Dec 1 (rest 10 h 30, minimum 11 h)
    const a = agents.find(x => poolOf(x) === 'sales');
    RETAIL_SHIFTS.sales.push({ code: 'X', startMin: 720, endMin: 1380, tone: 'close' });
    planningOverrides = { [a.id]: { '2026-11-30': 'X', '2026-12-01': 'O' } };
    const r3 = pickMonthlyPlan();
    out.restAcross = { status: r3.diagnostics.status, issue: r3.issues['rest|' + a.id + '|2026-12-01'] || 0 };
    RETAIL_SHIFTS.sales.pop(); planningOverrides = {};
    // Three cells changed at once: one write request
    let writes = 0; sb.from = function(t) { if (t === 'retail_planning_overrides') writes++; return keep.from.apply(this, arguments); };
    renderMonthlyPlanning();
    const ids = agents.filter(x => poolOf(x) === 'sales').slice(0, 3).map(x => x.id);
    multiSelect = ids.map(id => ({ agentId: id, ds: '2026-11-17' })); cellEditorState = { agentId: ids[0], ds: '2026-11-17' };
    await applyCellOverride('A');
    out.multiCell = { cells: ids.length, writeRequests: writes, saved: ids.every(id => (planningOverrides[id] || {})['2026-11-17'] === 'A') };
    return JSON.stringify(out);
  } finally {
    sb.from = keep.from; planSnapshot = keep.planSnapshot; planningOverrides = keep.planningOverrides;
    savePlanSnapshot = keep.savePlanSnapshot; renderDashboard = keep.renderDashboard;
  }
})()
