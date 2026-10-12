/* Conservative gate: reject any new final violation, even on an already infeasible plan. */
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function assessLearningCandidate(baseline, candidate) {
  const regressions=[];
  for (const [rule, events] of Object.entries(candidate)) {
    if (Array.isArray(events)) {
      const before=new Set((baseline[rule] || []).map(stable));
      const added=events.filter(e=>!before.has(stable(e)));
      if (added.length) regressions.push({rule,added:added.length});
    } else if (typeof events==='number' && events > (baseline[rule] || 0)) {
      regressions.push({rule,added:events-(baseline[rule] || 0)});
    }
  }
  const hasViolations=Object.values(candidate).some(v=>Array.isArray(v)?v.length>0:typeof v==='number'&&v>0);
  return {accepted:regressions.length===0&&!hasViolations,requiresManager:hasViolations,regressions};
}
if (typeof module !== 'undefined') module.exports={assessLearningCandidate};
