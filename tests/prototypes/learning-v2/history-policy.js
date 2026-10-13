/* Experimental reference selection. Does not edit or delete historical records. */
function selectLearningHistory(records, roster, cutoff, options = {}) {
  const months = options.months ?? 6;
  const halfLifeDays = options.halfLifeDays ?? 90;
  if (!Number.isInteger(months) || months < 1 || !(halfLifeDays > 0)) throw new Error('Invalid history window');
  const end = Date.parse(cutoff + 'T00:00:00Z');
  if (!Number.isFinite(end)) throw new Error('Invalid cutoff');
  const start = new Date(end); start.setUTCMonth(start.getUTCMonth() - months, 1);
  const available = new Map(roster.map(a => [a.id, a]));
  const selected = [], reasons = {}, seen = new Set();
  function reject(reason) { reasons[reason] = (reasons[reason] || 0) + 1; }
  for (const r of records) {
    const date = Date.parse(r.date + 'T00:00:00Z');
    const a = available.get(r.agentId);
    if (!Number.isFinite(date)) { reject('invalid_date'); continue; }
    if (date >= end) { reject('target_or_future'); continue; }
    if (date < start.getTime()) { reject('too_old'); continue; }
    if (r.validated !== true || !['official', 'manager_validated'].includes(r.source)) { reject('not_reference'); continue; }
    if (!a || (a.joined && a.joined >= cutoff) || (a.left && a.left < cutoff)) { reject('not_in_target_roster'); continue; }
    if ((a.joined && r.date < a.joined) || (a.left && r.date > a.left)) { reject('outside_employment'); continue; }
    if (r.storeId !== a.storeId || r.pool !== a.pool || r.contextVersion !== a.contextVersion) { reject('changed_context'); continue; }
    if (r.state === 'off' && (r.closed || r.requestedOff)) { reject('exceptional_off'); continue; }
    if (!['work', 'off'].includes(r.state)) { reject('absence_or_unknown'); continue; }
    if (r.state === 'work' && !a.catalogue.includes(r.shift)) { reject('obsolete_shift'); continue; }
    const key = JSON.stringify([r.agentId, r.date]);
    if (seen.has(key)) throw new Error('Duplicate reference agent/date');
    seen.add(key);
    selected.push({...r, weight: 2 ** (-(end-date)/86400000/halfLifeDays)});
  }
  const sum = selected.reduce((s,r) => s+r.weight,0);
  const sumSquares = selected.reduce((s,r) => s+r.weight*r.weight,0);
  return {records:selected, reasons, effectiveSampleSize:sumSquares ? sum*sum/sumSquares : 0};
}
if (typeof module !== 'undefined') module.exports = {selectLearningHistory};
