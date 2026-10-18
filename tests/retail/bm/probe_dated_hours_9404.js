// Claude 2026-10-17, Retail 9.4.0.4 TEST. Run ONLY after tests/retail/bm/setup.js (clock 2026-10-31, stubbed Supabase).
// The past never changes (Roman 17-10): an advisor full time until 15 Nov, 21 h from 16 Nov. October keeps 37.5 h;
// November weeks before the change keep 5 days; weeks after follow 21 h. The sheet records a change from next Monday (saved on Saturday 31 Oct: from Monday 2 Nov).
(async () => {
  const keep = { agents: agents.map(a => ({ ...a })), from: sb.from, save: savePlanSnapshot };
  try {
    savePlanSnapshot = async () => true; switchPlanningView('monthly');
    const a = agents.find(x => poolOf(x) === 'sales' && !agentLeaves.some(l => l.agent_id === x.id) && !Object.keys(availability[x.id] || {}).length && !(agentPrefs[x.id] || {}).fixed_schedule);
    a.status = 'PART_TIME'; a.weekly_hours = 21; a.weekly_hours_history = [{ from: '2000-01-01', hours: 37.5 }, { from: '2026-11-16', hours: 21 }];
    monthlyRef = new Date(2026, 10, 1);
    planSnapshot = { storeId: currentStoreId, month: '2026-11-01', ok: true, plan: null, prevPlan: null, nextPlan: null, history: [] };
    const r = pickMonthlyPlan();
    const week = wk => { let d = 0, m = 0; for (let i = 0; i < 7; i++) { const x = new Date(wk + 'T12:00:00'); x.setDate(x.getDate() + i); const ds = toDateStr(x), c = r.cells[ds] && r.cells[ds][a.id]; const h = c && !c.special && ruleHours(a, ds, c); if (h) { d++; m += h.paid; } } return { days: d, hours: m / 60 }; };
    const out = {
      octoberReference: Math.round(monthReferenceMin(a, monthDsList('2026-10')) / 6) / 10,
      novemberReference: Math.round(r.hours[a.id].reference / 6) / 10,
      weeks: { '2026-11-02': week('2026-11-02'), '2026-11-09': week('2026-11-09'), '2026-11-16': week('2026-11-16'), '2026-11-23': week('2026-11-23') },
      hoursIssues: Object.keys(r.issues).filter(k => k.startsWith('hours|' + a.id)), mandatory: r.diagnostics.mandatoryIssues.length };
    // Sheet: 37.5 h -> 30 h on Saturday 31 Oct: one entry from Monday 2 Nov, the days before keep 37.5 h
    const b = agents.find(x => x.id !== a.id && poolOf(x) === 'sales'); b.weekly_hours = 37.5; b.weekly_hours_history = null;
    openAgentEditor(b.id); document.getElementById('ae-hours').value = '30'; await saveAgentEditor();
    // The saved values are copied onto the advisor after a successful write
    out.sheetChange = { weekly_hours: b.weekly_hours, history: b.weekly_hours_history };
    out.pastUnchanged = { sunday1Nov: contractHours(b, '2026-11-01'), monday2Nov: contractHours(b, '2026-11-02') };
    const histBefore = JSON.stringify(b.weekly_hours_history); openAgentEditor(b.id); await saveAgentEditor();
    out.noChangeSameHistory = JSON.stringify(b.weekly_hours_history) === histBefore;
    document.getElementById('agent-editor').classList.remove('open'); agentEditorId = null;
    return JSON.stringify(out);
  } finally { agents = keep.agents; sb.from = keep.from; savePlanSnapshot = keep.save; }
})()
