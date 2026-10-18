// Functional test of the Monthly engine, old build against new build (Astra's method: several months, a full generation
// and a recalculation with the past kept, a saved planning kept or recalculated, short staff, odd data).
// Each case: same cells, same broken rules, same status in both builds; in the new build: no error, a cell for every
// advisor on every day. Also counts the weeks with exactly two days off (full-time sellers, no absence, whole weeks).
// Usage: node functional.cjs <old build> <new build>. Writes results/functional.json. Exit 1 on any difference.
const fs = require('fs'), vm = require('vm');
const {context} = require('./runner.cjs');
const OLD = process.argv[2], NEW = process.argv[3];
if (!NEW) { console.error('Usage: node functional.cjs <old build> <new build>'); process.exit(2); }
const CLOCKS = { gen: '2026-08-01T12:00:00', live: '2026-10-18T12:00:00' };
const MODS = {
  base: '',
  sellers3: "var k=0;agents=agents.filter(a=>poolOf(a)!=='sales'||++k<=3);",
  sellers1: "var k=0;agents=agents.filter(a=>poolOf(a)!=='sales'||++k<=1);",
  noManagers: "agents=agents.filter(a=>poolOf(a)!=='mgmt');",
  oneAdvisor: "agents=agents.slice(0,1);",
  noAdvisor: "agents=[];",
  allAbsentWeek: "agents.filter(a=>poolOf(a)==='sales').forEach((a,i)=>agentLeaves.push({id:'x'+i,agent_id:a.id,start_date:'2026-11-09',end_date:'2026-11-15',type:'absence'}));",
  fairnessOff: "storeSettings.fairness_rotation=false;",
  noCornerTraffic: "cornerTrafficMonthly={};",
  oneCorner: "storeCorners=storeCorners.slice(0,1);agents.forEach(a=>{if(a.home_corner_id)a.home_corner_id=storeCorners[0].id;});",
  closedDays: "calOverrides['2026-11-03']=false;calOverrides['2026-11-17']=false;",
  holidaysOpen: "calHolidays['2026-11-20']='Test day';calOverrides['2026-11-20']=true;",
  manualMix: "agents.forEach((a,i)=>{planningOverrides[a.id]={};for(let d=1;d<=30;d+=3)planningOverrides[a.id]['2026-11-'+String(d).padStart(2,'0')]=['O','OFF','C','A','OUT'][(i+d)%5];});",
  sixDaysManual: "var s=agents.find(a=>poolOf(a)==='sales');planningOverrides[s.id]={};['02','03','04','05','06','07'].forEach(d=>planningOverrides[s.id]['2026-11-'+d]='O');",
  shortHours: "regulations.weekly_hours=30;regulations.max_days=4;",
  strictRest: "regulations.rest_gap_hours=13;regulations.max_consecutive_days=4;",
  savedKept: "planSnapshot={storeId:currentStoreId,month:snapshotMonthKey(),ok:true,plan:{}};savePlanSnapshot=()=>Promise.resolve();computeMonthlyPlan({habits:true}).paint();manualMode=true;",
  savedRecalc: "planSnapshot={storeId:currentStoreId,month:snapshotMonthKey(),ok:true,plan:{}};savePlanSnapshot=()=>Promise.resolve();computeMonthlyPlan({habits:true}).paint();manualMode=false;forceRecalc=true;"
};
const RUN = `JSON.stringify((()=>{
  const r = pickMonthlyPlan(), ym = toDateStr(monthlyRef).slice(0, 7), days = monthDsList(ym);
  let missing = 0; days.forEach(ds => agents.forEach(a => { if (!(r.cells[ds] || {})[a.id]) missing++; }));
  // Weeks with exactly two days off: full-time sellers, no absence or leave that week, Monday to Sunday inside the month
  const weeks = {}; days.forEach(ds => { const x = new Date(ds + 'T12:00:00'); x.setDate(x.getDate() - (x.getDay() + 6) % 7); const k = toDateStr(x); (weeks[k] = weeks[k] || []).push(ds); });
  let full = 0, two = 0;
  agents.filter(a => poolOf(a) === 'sales' && retailStatusOf(a) !== 'PART_TIME' && !((agentPrefs[a.id] || {}).fixed_schedule || {}).enabled).forEach(a => Object.values(weeks).forEach(w => {
    if (w.length !== 7 || w.some(ds => getDayClosureType(ds) || agentOnLeave(a.id, ds) || (planningOverrides[a.id] || {})[ds])) return;
    full++; if (w.filter(ds => { const c = r.cells[ds][a.id]; return c && c.special === 'off'; }).length === 2) two++;
  }));
  return { cells: r.cells, issues: r.issues, status: r.diagnostics.status, missing, twoOff: [two, full] };
})())`;
function run(file, kind, month, clock, mod) {
  const c = context(file, kind);
  vm.runInContext(`Date=class extends Date{constructor(...a){super(...(a.length?a:['${CLOCKS[clock]}']));}static now(){return new Date().getTime();}};monthlyRef=new Date(2026,${month - 1},1);` + MODS[mod], c, {timeout: 180000});
  try { return JSON.parse(vm.runInContext(RUN, c, {timeout: 300000})); }
  catch (e) { return { error: String(e.message || e).slice(0, 200) }; }
}
const cases = [];
for (const kind of ['bm', 'jpA', 'jpB']) for (const month of [9, 10, 11, 12]) for (const clock of ['gen', 'live']) cases.push([kind, month, clock, 'base']);
for (const mod of Object.keys(MODS)) if (mod !== 'base') cases.push(['bm', 11, 'live', mod]);
for (const mod of ['sellers3', 'manualMix', 'savedKept', 'savedRecalc']) cases.push(['jpA', 11, 'live', mod]);
const out = []; let failed = 0;
for (const [kind, month, clock, mod] of cases) {
  const a = run(OLD, kind, month, clock, mod), b = run(NEW, kind, month, clock, mod);
  const row = { kind, month, clock, mod,
    sameCells: !a.error && !b.error && JSON.stringify(a.cells) === JSON.stringify(b.cells),
    sameIssues: !a.error && !b.error && JSON.stringify(a.issues) === JSON.stringify(b.issues),
    sameStatus: a.status === b.status, status: b.status, error: b.error || null, oldError: a.error || null,
    missing: b.missing, twoOff: b.twoOff, mandatory: b.issues ? Object.keys(b.issues).filter(k => /^(data|cell|openNone|closeNone|week|hours|twoWeeks|row|day|rest)\|/.test(k)).length : null };
  row.pass = row.sameCells && row.sameIssues && row.sameStatus && !row.error && row.missing === 0 && JSON.stringify(a.twoOff) === JSON.stringify(b.twoOff);
  if (!row.pass) failed++;
  out.push(row); console.log(JSON.stringify(row));
}
fs.writeFileSync(__dirname + '/results/functional.json', JSON.stringify(out, null, 1));
console.log(out.length, 'cases,', failed, 'failures');
if (failed) process.exitCode = 1;
