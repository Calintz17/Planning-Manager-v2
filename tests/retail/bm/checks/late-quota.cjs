// Late target and managers (Roman 19-10), old build against new build, on the cases of functional.cjs.
// The late target counts the sellers only: round(sellers working x late target). Managers work an opening or a
// closing shift (never a middle one, unless set by hand) and do not stand in for the sellers who close.
// Each case, in the new build: no error, a cell for everyone, no more mandatory breaks than the old build, no manager
// on a middle shift, no day closed only by managers while sellers work; and the late gap is reported (target, actual).
// Usage: node late-quota.cjs <old build> <new build>. Writes results/late-quota.json. Exit 1 on failure.
const fs = require('fs'), vm = require('vm');
const {context} = require('./runner.cjs');
const OLD = process.argv[2], NEW = process.argv[3];
if (!NEW) { console.error('Usage: node late-quota.cjs <old build> <new build>'); process.exit(2); }
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
  fourPeople: "agents=agents.filter(a=>['a00','a01','a02','a09'].includes(a.id));agentLeaves=[];agentPrefs={};storeCorners=storeCorners.slice(0,1);storeSettings.closing_ratio=.7;",
  tenPlusOne: "var m=0,k=0;agents=agents.filter(a=>poolOf(a)==='mgmt'?++m<=1:poolOf(a)==='sales'?++k<=10:false);storeSettings.closing_ratio=.7;",
  savedRecalc: "planSnapshot={storeId:currentStoreId,month:snapshotMonthKey(),ok:true,plan:{}};savePlanSnapshot=()=>Promise.resolve();computeMonthlyPlan({habits:true}).paint();manualMode=false;forceRecalc=true;"
};
const RUN = `JSON.stringify((()=>{
  const r = pickMonthlyPlan(), ym = toDateStr(monthlyRef).slice(0, 7), days = monthDsList(ym), today = toDateStr(new Date());
  const grid = RETAIL_SHIFTS.sales || [], late = lateCodes(grid), ratio = storeSettings && storeSettings.closing_ratio != null ? storeSettings.closing_ratio : 0.5;
  let missing = 0, target = 0, actual = 0, shortDays = 0, leadMid = 0, leadOnlyClose = 0, sellersClose = 0, leadM = [];
  days.forEach(ds => {
    agents.forEach(a => { if (!(r.cells[ds] || {})[a.id]) missing++; });
    const d = new Date(ds + 'T12:00:00');
    if (getDayClosureType(ds) || ds < today || isSpecialDay({ date: d, ds })) return;
    const hm = dayMinutes(ds), cl = shiftClusters(grid, ds);
    const works = a => { const c = r.cells[ds][a.id]; return c && !c.special && grid.some(s => s.code === c.code) ? c : null; };
    const sellers = agents.filter(a => poolOf(a) === 'sales' && works(a)), leads = agents.filter(a => poolOf(a) === 'mgmt' && works(a));
    const t = Math.round(sellers.length * ratio), n = sellers.filter(a => late[works(a).code]).length;
    target += t; actual += n; if (n < t) shortDays++;
    leads.forEach(a => { const s = grid.find(x => x.code === works(a).code); if (cl.mid.indexOf(s) !== -1 && !(planningOverrides[a.id] || {})[ds]) { leadMid++; leadM.push(ds + ' ' + a.id); } });
    const closes = a => { const wh = workHoursOf(a, ds, works(a)); return wh && coverOfHours(wh.start, wh.end, hm).close; };
    const sc = sellers.filter(closes).length; sellersClose += sc;
    if (sellers.length && !sc && leads.some(closes)) leadOnlyClose++;
  });
  const mandatory = Object.keys(r.issues).filter(k => /^(data|cell|openNone|closeNone|week|hours|twoWeeks|row|day|rest)\\|/.test(k));
  return { missing, mandatory: mandatory.length, mandatoryKeys: mandatory.slice(0, 5), target, actual, shortDays, leadMid, leadM: leadM.slice(0, 3), leadOnlyClose, sellersClose, status: r.diagnostics.status, late: r.diagnostics.late || null };
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
  const pass = !b.error && b.missing === 0 && (a.error || b.mandatory <= a.mandatory) && b.leadMid === 0 && b.leadOnlyClose === 0;
  const row = { kind, month, clock, mod, pass, error: b.error || null,
    mandatory: [a.mandatory, b.mandatory], late: [a.actual + '/' + a.target, b.actual + '/' + b.target], shortDays: [a.shortDays, b.shortDays],
    leadMid: [a.leadMid, b.leadMid], leadOnlyClose: [a.leadOnlyClose, b.leadOnlyClose], status: [a.status, b.status], newKeys: b.mandatoryKeys, leadM: b.leadM };
  if (!pass) failed++;
  out.push(row); console.log(JSON.stringify(row));
}
const sum = k => out.reduce((t, r) => [t[0] + (+String(r[k][0]).split('/')[0] || 0), t[1] + (+String(r[k][1]).split('/')[0] || 0)], [0, 0]);
console.log('totals old/new: mandatory', JSON.stringify(sum('mandatory')), 'short days', JSON.stringify(sum('shortDays')), 'managers on a middle shift', JSON.stringify(sum('leadMid')), 'days closed by managers only', JSON.stringify(sum('leadOnlyClose')));
fs.mkdirSync(__dirname + '/results', { recursive: true });
fs.writeFileSync(__dirname + '/results/late-quota.json', JSON.stringify(out, null, 1));
console.log(cases.length + ' cases, ' + failed + ' failures');
process.exit(failed ? 1 : 0);
