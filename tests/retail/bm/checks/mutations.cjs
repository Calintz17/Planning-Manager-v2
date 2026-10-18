// Mutation test of the final check (Astra, 9.5.0.3 audit, point 7). Start from a computed plan, break it on purpose
// one way at a time, and check that the final check names exactly that broken rule. A comparison with an older build
// cannot see an error both builds share; this test can.
// Usage: node checks/mutations.cjs [build]. Writes results/mutations.json. Exit 1 when a mutation is not detected.
const fs = require('fs'), vm = require('vm');
const {context} = require('./runner.cjs');
const file = process.argv[2] || 'CAST_RETAIL_TEST.html';
const out = [];
for (const kind of ['bm', 'jpA']) {
  const c = context(file, kind);
  // Clock before the month: every day of November is checked
  vm.runInContext(`Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-08-01T12:00:00']));}static now(){return new Date().getTime();}};monthlyRef=new Date(2026,10,1);`, c);
  const rows = JSON.parse(vm.runInContext(`JSON.stringify((()=>{
    const ctx = buildMonthlyContext(), p = pickMonthlyPlan(ctx), base = validatePlan(p.cells, ctx);
    const res = [], copy = () => JSON.parse(JSON.stringify(p.cells));
    const days = Object.keys(p.cells).sort(), open = days.filter(ds => !getDayClosureType(ds));
    const works = r => r && !r.special;
    const team = a => poolOf(a) !== 'stock';
    function test(name, cells, key, where) {
      const chk = validatePlan(cells, ctx), list = where === 'unknown' ? chk.unknown : chk.mandatory;
      res.push({ name, key, detected: list.indexOf(key) !== -1, wasBefore: (where === 'unknown' ? base.unknown : base.mandatory).indexOf(key) !== -1,
        status: chk.status, newMandatory: chk.mandatory.filter(k => base.mandatory.indexOf(k) === -1).length });
    }
    const D = open[10];
    // 1 nobody closes: every advisor who closes that day gets a day off
    let x = copy(); agents.forEach(a => { const r = x[D][a.id]; if (team(a) && works(r) && coverOf(a, D, r).close) x[D][a.id] = { code: 'OFF', special: 'off' }; });
    test('nobody closes', x, 'closeNone|' + D);
    // 2 nobody opens
    x = copy(); agents.forEach(a => { const r = x[D][a.id]; if (team(a) && works(r) && coverOf(a, D, r).open) x[D][a.id] = { code: 'OFF', special: 'off' }; });
    test('nobody opens', x, 'openNone|' + D);
    // 3 a sixth day in a week: a full-time seller with a full week (as many days as allowed) works one of his days off
    const wk = weekKey('2026-11-09T12:00:00'), wDays = [0,1,2,3,4,5,6].map(i => shiftDay(wk, i));
    const seller = agents.find(a => poolOf(a) === 'sales' && retailStatusOf(a) !== 'PART_TIME' && !((agentPrefs[a.id] || {}).fixed_schedule || {}).enabled &&
      wDays.filter(ds => works(p.cells[ds][a.id])).length === dayLimits().week);
    const offDay = wDays.find(ds => (p.cells[ds][seller.id] || {}).special === 'off' && !getDayClosureType(ds));
    const workDay = wDays.find(ds => works(p.cells[ds][seller.id]));
    x = copy(); x[offDay][seller.id] = JSON.parse(JSON.stringify(p.cells[workDay][seller.id]));
    test('sixth day in a week', x, 'week|' + seller.id + '|' + wk);
    // 4 a code that is not in the shift list
    x = copy(); x[workDay][seller.id] = { code: 'ZZ' };
    test('unknown code', x, 'data|' + seller.id + '|' + workDay);
    // 5 a corner the store does not have (only a store with several corners uses them)
    if (storeCorners.length > 1) {
      x = copy(); x[workDay][seller.id] = Object.assign({}, p.cells[workDay][seller.id], { corner: 'NOPE' });
      test('unknown corner', x, 'data|' + seller.id + '|' + workDay);
    }
    // 6 a missing cell: unknown, never read as a day off
    x = copy(); delete x[workDay][seller.id];
    test('missing cell', x, 'cell|' + seller.id + '|' + workDay, 'unknown');
    // 7 too many days in a row: the seller works every day of two weeks
    x = copy(); const two = [...Array(14).keys()].map(i => shiftDay(wk, i)).filter(ds => x[ds]);
    two.forEach(ds => { if (!getDayClosureType(ds)) x[ds][seller.id] = JSON.parse(JSON.stringify(p.cells[workDay][seller.id])); });
    test('days in a row', x, 'row|' + seller.id + '|' + shiftDay(wk, lim0().row));
    test('two weeks', x, 'twoWeeks|' + seller.id + '|' + wk);
    test('weekly hours', x, 'hours|' + seller.id + '|' + wk);
    function lim0() { return dayLimits(); }
    return { base: { status: base.status, mandatory: base.mandatory.length }, res };
  })())`, c, {timeout: 600000}));
  rows.res.forEach(r => { r.kind = kind; r.pass = r.detected && !r.wasBefore; out.push(r); console.log(JSON.stringify(r)); });
  console.log(kind, 'plan before mutation:', JSON.stringify(rows.base));
}
fs.writeFileSync(__dirname + '/results/mutations.json', JSON.stringify(out, null, 1));
const failed = out.filter(r => !r.pass);
console.log(out.length, 'mutations,', failed.length, 'not detected');
if (failed.length) process.exitCode = 1;
