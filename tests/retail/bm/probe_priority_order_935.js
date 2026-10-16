// Claude 2026-10-16, Retail 9.3.5. Run ONLY after tests/retail/bm/setup.js, in an isolated candidate page (clock 2026-10-31).
// Order of priority (Roman, 16-10): 1 law, 2 manager (current changes and what CAST learned from them), 3 calculations.
// A seller whose manager put O on every Monday of September and October, with a late target of 100%:
// on the Mondays of November the learned O must win over the late target; the others follow the target.
(() => {
  const keep = { planningOverrides, regulations: JSON.parse(JSON.stringify(regulations)), storeSettings: JSON.parse(JSON.stringify(storeSettings)), monthlyRef, planSnapshot, savePlanSnapshot };
  try {
    savePlanSnapshot = async () => {};
    const a = agents.find(x => poolOf(x) === 'sales' && !((agentPrefs[x.id] || {}).fixed_schedule || {}).enabled && !agentLeaves.some(l => l.agent_id === x.id));
    planningOverrides = { [a.id]: {} };
    for (let d = new Date('2026-09-01T12:00:00'); toDateStr(d) <= '2026-10-31'; d.setDate(d.getDate() + 1)) if (d.getDay() === 1) planningOverrides[a.id][toDateStr(d)] = 'O';
    storeSettings.closing_ratio = 1;
    switchPlanningView('monthly'); monthlyRef = new Date(2026, 10, 1);
    planSnapshot = { storeId: currentStoreId, month: '2026-11-01', ok: false, plan: null, prevPlan: null, history: [] };
    renderMonthlyPlanning();
    const mondays = Object.keys(monthlyResult).filter(ds => new Date(ds + 'T12:00:00').getDay() === 1);
    const mine = mondays.map(ds => (monthlyResult[ds][a.id] || {}).code);
    const late = lateCodes(RETAIL_SHIFTS.sales), others = { late: 0, other: 0 };
    mondays.forEach(ds => agents.forEach(b => { if (b === a || poolOf(b) !== 'sales') return; const c = (monthlyResult[ds][b.id] || {}).code; if (findShiftDef(c)) others[late[c] ? 'late' : 'other']++; }));
    return JSON.stringify({ seller: a.id, mondays: mine, othersOnMondays: others, habitsKept: habitsGate.last });
  } finally {
    planningOverrides = keep.planningOverrides; Object.assign(regulations, keep.regulations); Object.assign(storeSettings, keep.storeSettings);
    monthlyRef = keep.monthlyRef; planSnapshot = keep.planSnapshot; savePlanSnapshot = keep.savePlanSnapshot;
  }
})()
