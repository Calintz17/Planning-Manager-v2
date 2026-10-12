/* Experimental preference model. Only explicit validated history before cutoff. */
function buildLearningModel(records, cutoff, alpha = 8) {
  const counts = new Map();
  const key = (...parts) => JSON.stringify(parts);
  function add(parts, label, weight) {
    const k = key(...parts), row = counts.get(k) || {};
    row[label] = (row[label] || 0) + weight;
    counts.set(k, row);
  }
  const seen = new Set();
  for (const r of records) {
    if (r.validated !== true || r.date >= cutoff) continue;
    if (!['work', 'off'].includes(r.state)) continue;
    const weight = r.weight ?? 1;
    if (!(weight > 0) || !Number.isFinite(weight)) throw new Error('Invalid observation weight');
    const id = key(r.agentId, r.date);
    if (seen.has(id)) throw new Error('Duplicate historical agent/date');
    seen.add(id);
    const dow = new Date(r.date + 'T12:00:00Z').getUTCDay();
    for (const parts of [['presence', 'team', r.pool], ['presence', 'person', r.agentId], ['presence', 'day', r.agentId, dow]]) add(parts, r.state, weight);
    if (r.state === 'work' && r.shift) {
      for (const parts of [['shift', 'team', r.pool], ['shift', 'person', r.agentId], ['shift', 'day', r.agentId, dow]]) add(parts, r.shift, weight);
    }
  }
  const row = (...parts) => counts.get(key(...parts)) || {};
  const total = r => Object.values(r).reduce((a, b) => a + b, 0);
  function probability(kind, agent, pool, dow, label, fallback) {
    const team = row(kind, 'team', pool), person = row(kind, 'person', agent), day = row(kind, 'day', agent, dow);
    const base = total(team) ? (team[label] || 0) / total(team) : fallback;
    const p = ((person[label] || 0) + alpha * base) / (total(person) + alpha);
    return ((day[label] || 0) + alpha * p) / (total(day) + alpha);
  }
  return {
    presence(agent, pool, dow) { return probability('presence', agent, pool, dow, 'work', 0.5); },
    shift(agent, pool, dow, code, catalogueSize) { return probability('shift', agent, pool, dow, code, 1 / Math.max(1, catalogueSize)); },
    observations: seen.size
  };
}
if (typeof module !== 'undefined') module.exports = { buildLearningModel };
