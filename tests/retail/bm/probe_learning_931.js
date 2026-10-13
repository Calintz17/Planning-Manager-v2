// Run in the synthetic browser bench AFTER setup.js, not on production.
// Pure buildHabits probes: no Supabase writes, no render, globals restored.
(()=> {
  const a=agents[0], saved={agents,planningOverrides,agentLeaves,calHolidays,calOverrides};
  const fields=['learning_reference_months','public_holidays','closed_dates','saturday_rest','sunday_rest'];
  const values=Object.fromEntries(fields.map(k=>[k,regulations[k]]));
  const out={};
  function reset() {
    agents=[a];planningOverrides={};agentLeaves=[];calHolidays={};calOverrides={};
    regulations.learning_reference_months=['2026-09'];regulations.public_holidays=[];regulations.closed_dates=[];
    regulations.saturday_rest=false;regulations.sunday_rest=false;
  }
  try {
    reset();out.empty={days:buildHabits('2026-11-01').days};
    reset();planningOverrides[a.id]={'2026-09-01':'OFF','2026-09-02':'OFF','2026-09-03':'OFF'};
    out.threeOff={days:buildHabits('2026-11-01').days};
    reset();planningOverrides[a.id]={'2026-09-27':'OFF','2026-09-28':'OFF','2026-09-29':'OFF','2026-09-30':'OFF'};
    out.fourOff={known:4,days:buildHabits('2026-11-01').days};
    reset();agentLeaves=[{agent_id:a.id,type:'off_request',start_date:'2026-09-27',end_date:'2026-09-30'}];
    out.requestsOnly={days:buildHabits('2026-11-01').days};
    reset();agentLeaves=[{agent_id:a.id,type:'out',start_date:'2026-09-27',end_date:'2026-09-30'}];
    out.trainingOnly={days:buildHabits('2026-11-01').days};
    reset();regulations.learning_reference_months=[];planningOverrides[a.id]={'2027-01-04':'C'};
    out.future={days:buildHabits('2026-11-01').days};
    return JSON.stringify(out);
  } finally {
    agents=saved.agents;planningOverrides=saved.planningOverrides;agentLeaves=saved.agentLeaves;
    calHolidays=saved.calHolidays;calOverrides=saved.calOverrides;Object.assign(regulations,values);
  }
})()
