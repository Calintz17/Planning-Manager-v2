// Run in the synthetic browser bench AFTER setup.js, not on production. Adapted from probe_learning_931.js (Astra).
// Pure buildHabits probes: no Supabase writes, no render, globals restored.
// 9.3.2: a day is learned as worked only inside a declared reference { from, to, agents }. Without one, only the
// manager's own cells count (OFF = rest, O/M/C = worked); requests, training and empty days stay unknown.
(() => {
  const a = agents[0], b = agents[1], saved = { agents, planningOverrides, agentLeaves, calHolidays, calOverrides };
  const fields = ['learning_references', 'public_holidays', 'closed_dates', 'saturday_rest', 'sunday_rest'];
  const values = Object.fromEntries(fields.map(k => [k, regulations[k]]));
  const sept = { from: '2026-09-01', to: '2026-09-30', agents: [a.id] };
  const fourOff = { '2026-09-27': 'OFF', '2026-09-28': 'OFF', '2026-09-29': 'OFF', '2026-09-30': 'OFF' };
  const out = {};
  function reset(refs) {
    agents = [a, b]; planningOverrides = {}; agentLeaves = []; calHolidays = {}; calOverrides = {};
    regulations.learning_references = refs || []; regulations.public_holidays = []; regulations.closed_dates = [];
    regulations.saturday_rest = false; regulations.sunday_rest = false;
  }
  const days = () => buildHabits('2026-11-01').days;
  try {
    reset(); out.empty = days();                                                          // 0
    reset(); planningOverrides[a.id] = { '2026-09-01': 'OFF', '2026-09-02': 'OFF', '2026-09-03': 'OFF' }; out.threeOff = days(); // 3
    reset(); planningOverrides[a.id] = Object.assign({}, fourOff); out.fourOffNoRef = days();             // 4, nothing invented
    reset(); agentLeaves = [{ agent_id: a.id, type: 'off_request', start_date: '2026-09-27', end_date: '2026-09-30' }]; out.requestsOnly = days(); // 0
    reset(); agentLeaves = [{ agent_id: a.id, type: 'out', start_date: '2026-09-27', end_date: '2026-09-30' }]; out.trainingOnly = days();       // 0
    reset([sept]); planningOverrides[a.id] = Object.assign({}, fourOff); out.declaredMonth = days();     // 30 (26 worked + 4 OFF)
    reset([sept]); planningOverrides[b.id] = Object.assign({}, fourOff); out.otherAgentNotDeclared = days(); // 30 for a, 4 for b
    reset([{ from: '2026-09-15', to: '2026-09-30', agents: [a.id] }]); out.declaredHalfMonth = days();     // 16
    reset([sept]); agentLeaves = [{ agent_id: a.id, type: 'off_request', start_date: '2026-09-27', end_date: '2026-09-30' }]; out.declaredWithRequests = days(); // 26
    reset([{ from: '2000-01-01', to: '2030-12-31', agents: [a.id] }]); out.wideRangeClamped = days();      // 184 (May 1 to Oct 31)
    reset([{ from: '2026-09-01' }, null, { from: '2026-09-01', to: '2026-09-30', agents: 'all' }]); out.malformed = days(); // 0
    reset(); planningOverrides[a.id] = { '2027-01-04': 'C' }; out.future = days();                         // 0
    return JSON.stringify(out);
  } finally {
    agents = saved.agents; planningOverrides = saved.planningOverrides; agentLeaves = saved.agentLeaves;
    calHolidays = saved.calHolidays; calOverrides = saved.calOverrides; Object.assign(regulations, values);
  }
})()
