// Claude 2026-10-17, Retail 9.4.0.2 TEST. Run ONLY after tests/retail/bm/setup.js (clock 2026-10-31, stubbed Supabase).
// Astra 9.4.0.1 P1: the screen (column H), the advisor sheet and Excel show the same hours of the month, computed once
// with the days around the month. Case: leave known 26-30 Oct, OFF 31 Oct, leave 1 Nov, contract 37.5 h.
(() => {
  const keep = { agentLeaves: agentLeaves.slice(), XLSX: window.XLSX, overrides: JSON.parse(JSON.stringify(planningOverrides)) };
  try {
    switchPlanningView('monthly'); monthlyRef = new Date(2026, 10, 1);
    const a = agents.find(x => poolOf(x) === 'sales' && !agentLeaves.some(l => l.agent_id === x.id));
    a.weekly_hours = 37.5;
    agentLeaves = agentLeaves.concat([{ agent_id: a.id, start_date: '2026-10-26', end_date: '2026-10-30', type: 'absence' },
      { agent_id: a.id, start_date: '2026-11-01', end_date: '2026-11-01', type: 'absence' }]);
    (planningOverrides[a.id] = planningOverrides[a.id] || {})['2026-10-31'] = 'OFF';
    renderMonthlyPlanning();
    const td = document.querySelector('td[data-agent="' + a.id + '"]').parentElement.lastElementChild;
    const screen = td.textContent;
    openAgentEditor(a.id);
    const sheet = document.getElementById('ae-month-hours').value;
    document.getElementById('agent-editor').classList.remove('open'); agentEditorId = null;
    let rows = null;
    window.XLSX = { utils: { aoa_to_sheet: r => { rows = r; return {}; }, book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {}, write: () => '' };
    try { exportMonthly(); } catch (e) {}
    const nm = ((a.first_name || '') + ' ' + (a.last_name || '')).trim();
    const xr = rows && rows.find(r => r[0] && r[0].v === nm);
    const excel = xr ? xr[xr.length - 1].v : null;
    const nov1 = accountDay(a, '2026-11-01', { code: 'A', special: 'leave' });
    return JSON.stringify({ screen, sheet, excel, same: String(excel) === screen && sheet.indexOf(' ' + screen + ' h') !== -1, nov1CreditAlone: nov1.credit / 60 });
  } finally { agentLeaves = keep.agentLeaves; window.XLSX = keep.XLSX; planningOverrides = keep.overrides; }
})()
