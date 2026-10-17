// Claude 2026-10-17, Retail 9.4.0.0 TEST. Run ONLY after tests/retail/bm/setup.js in an isolated page (clock 2026-10-31, stubbed Supabase).
// Weekly hours per advisor (Roman 17-10): days and paid hours per week follow each advisor's hours; the agent sheet saves
// weekly_hours (no more work percentage); a fixed part-time is checked against its own hours; the month counter of a
// whole month of leave equals the month reference (weekly hours x days / 7).
(async () => {
  const keep = { agents: agents.map(a => ({ ...a })), agentPrefs: JSON.parse(JSON.stringify(agentPrefs)), agentLeaves: agentLeaves.slice(), from: sb.from, savePlanSnapshot };
  const out = {};
  try {
    savePlanSnapshot = async () => true;
    switchPlanningView('monthly'); monthlyRef = new Date(2026, 10, 1);
    planSnapshot = { storeId: currentStoreId, month: '2026-11-01', ok: true, plan: null, prevPlan: null, nextPlan: null, history: [] };
    const sales = agents.filter(a => poolOf(a) === 'sales' && !(agentPrefs[a.id] || {}).fixed_schedule && !agentLeaves.some(l => l.agent_id === a.id) && !Object.keys(availability[a.id] || {}).length);
    const ft = sales[0], h30 = sales[1], pt = sales[2];
    h30.weekly_hours = 30; pt.status = 'PART_TIME'; pt.weekly_hours = 21;
    const r = pickMonthlyPlan(), ds = Object.keys(r.cells).sort();
    const weeks = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'];
    function perWeek(a) {
      return weeks.map(wk => { let d = 0, m = 0, half = 0; for (let i = 0; i < 7; i++) { const x = new Date(wk + 'T12:00:00'); x.setDate(x.getDate() + i); const c = r.cells[toDateStr(x)][a.id]; const h = c && !c.special && ruleHours(a, toDateStr(x), c); if (h) { d++; m += h.paid; if (c.half) half++; } } return { days: d, half, hours: m / 60 }; });
    }
    const hoursIssues = a => Object.keys(r.issues).filter(k => k.startsWith('hours|' + a.id + '|'));
    out.fullTime = { weeklyHours: contractHours(ft), weeks: perWeek(ft), hoursIssues: hoursIssues(ft) };
    out.thirtyHours = { weeklyHours: contractHours(h30), weeks: perWeek(h30), hoursIssues: hoursIssues(h30) };
    out.flexiblePartTime21 = { weeklyHours: contractHours(pt), weeks: perWeek(pt), hoursIssues: hoursIssues(pt) };
    out.mandatory = r.diagnostics.mandatoryIssues.length;
    // A whole month of leave: the counter equals the reference
    const leaver = sales[3];
    agentLeaves = agentLeaves.concat([{ agent_id: leaver.id, start_date: '2026-11-01', end_date: '2026-11-30', type: 'absence' }]);
    const r2 = pickMonthlyPlan(), ds2 = Object.keys(r2.cells).sort();
    out.monthOfLeave = { counted: Math.round(monthHoursUsed(leaver, r2.cells, ds2) / 6) / 10, reference: Math.round(monthCapMin(leaver, ds2.length) / 6) / 10 };
    // Agent sheet: weekly hours saved, no percentage; a fixed part-time is checked against its own hours
    const updates = []; sb.from = function(t) { const q = keep.from.apply(this, arguments); if (t === 'retail_agents' && q && q.update) { const u = q.update; q.update = function(v) { updates.push(v); return u.apply(q, arguments); }; } return q; };
    renderMonthlyPlanning();
    renderAgents(); openAgentEditor(pt.id);
    document.getElementById('ae-hours').value = '24';
    const saved = await saveAgentEditor();
    out.agentSheet = { saved, update: updates[0] && { weekly_hours: updates[0].weekly_hours, work_pct: updates[0].work_pct }, hoursShown: pt.weekly_hours,
      counterField: document.getElementById('ae-month-hours').value, noPercentField: !document.getElementById('ae-pct-vol'), noPreferredShift: !document.getElementById('ae-pref-shift') };
    out.fixedCheck = { at30h: fixedScheduleIssue({ enabled: true, days: [1, 2, 3, 4, 5], start: 540, end: 1020 }, 'PART_TIME', 30),
      at45h: fixedScheduleIssue({ enabled: true, days: [1, 2, 3, 4], start: 600, end: 1080 }, 'PART_TIME', 45) };
    document.getElementById('agent-editor').classList.remove('open'); agentEditorId = null;
    return JSON.stringify(out);
  } finally {
    sb.from = keep.from; agents = keep.agents; agentPrefs = keep.agentPrefs; agentLeaves = keep.agentLeaves; savePlanSnapshot = keep.savePlanSnapshot;
  }
})()
