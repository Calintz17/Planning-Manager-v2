// 10.0.0.8 (Roman 20-10): special shift, corner headcount, manual move to another corner, who changed a square.
// Synthetic data, no network. Usage: node v10008.cjs [build]
const vm = require('vm'), {context} = require('./runner.cjs');
const file = process.argv[2] || 'CAST_RETAIL_TEST.html', out = [];
const fresh = () => { const c = context(file); vm.runInContext(`Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-19T12:00:00']));}static now(){return new Date().getTime();}};monthlyRef=new Date(2026,10,1);`, c); return c; };
const run = (c, s) => vm.runInContext(s, c, {timeout: 300000});
const ok = (name, v) => out.push([name, !!v, v]);
// 1. Special shift
let c = fresh();
run(c, `var base=pickMonthlyPlan();var ds='2026-11-12';var a=agents.find(x=>poolOf(x)==='sales'&&base.cells[ds][x.id]&&!base.cells[ds][x.id].special);
planningOverrides[a.id]=Object.assign({},planningOverrides[a.id],{[ds]:specialCode(480,1290)});var sp=pickMonthlyPlan(buildMonthlyContext());`);
ok('special shift: the square keeps it, shows SP', run(c, `sp.cells[ds][a.id].code==='SP 480-1290'&&codeLabel(sp.cells[ds][a.id].code)==='SP'&&shiftCls('SP 480-1290')==='sh-sp'`));
ok('special shift: its hours are the ones set (8:00-21:30)', run(c, `JSON.stringify(workHoursOf(a,ds,sp.cells[ds][a.id]))==='{"start":480,"end":1290}'`));
ok('special shift: the month hours of the advisor change', run(c, `sp.hours[a.id].used!==base.hours[a.id].used`));
ok('special shift: a valid square for the final check', run(c, `validCell(sp.cells[ds][a.id],ds)`));
ok('special shift: never learned as a habit', run(c, `(()=>{var b=agents.find(x=>poolOf(x)==='sales');var n0=buildHabits('2026-11-01').days;var keep=JSON.stringify(planningOverrides[b.id]||{});planningOverrides[b.id]=Object.assign({},planningOverrides[b.id],{'2026-10-06':specialCode(480,1290),'2026-10-07':specialCode(480,1290)});var n1=buildHabits('2026-11-01').days;planningOverrides[b.id]=JSON.parse(keep);return n0===n1})()`));
ok('special shift: wrong hours are refused', run(c, `specialShift('SP 900-800')===null&&specialShift('SP x')===null&&specialShift('O')===null`));
run(c, `monthlyResult=sp.cells;var m=buildIntradayModel(ds);var row=m.groups.flatMap(g=>g.rows).find(r=>r.a.id===a.id);`);
ok('special shift: the Intraday shows SP from 8:00 to 21:30', run(c, `row&&row.sh.code==='SP'&&row.sh.startMin===480&&row.sh.endMin===1290`));
// frozen month: only that square changes
c = fresh();
run(c, `manualMode=true;var p0=pickMonthlyPlan();planSnapshot={storeId:currentStoreId,month:snapshotMonthKey(),ok:true,plan:JSON.parse(JSON.stringify(p0.cells))};
var ds='2026-11-12';var a=agents.find(x=>poolOf(x)==='sales'&&p0.cells[ds][x.id]&&!p0.cells[ds][x.id].special);var p1=pickMonthlyPlan(buildMonthlyContext());
planningOverrides[a.id]=Object.assign({},planningOverrides[a.id],{[ds]:specialCode(480,1290)});var p2=pickMonthlyPlan(buildMonthlyContext());
var diff=[];Object.keys(p2.cells).forEach(d=>Object.keys(p2.cells[d]).forEach(id=>{if(cellSig(p2.cells[d][id])!==cellSig(p1.cells[d][id]))diff.push(d+'|'+id);}));`);
ok('saved month: only the special square changes', run(c, `diff.length===1&&diff[0]===ds+'|'+a.id`));
// 2. Corner headcount
c = fresh();
run(c, `planSnapshot={storeId:currentStoreId,month:snapshotMonthKey(),ok:true,plan:{}};savePlanSnapshot=async()=>true;var r=pickMonthlyPlan();r.paint();var cv=lastCoverage;var ds='2026-11-12';
function expect(c){return agents.filter(a=>{var x=r.cells[ds][a.id];return poolOf(a)==='sales'&&x&&!x.special&&workHoursOf(a,ds,x)&&(x.corner||(storeCorners.find(q=>q.id===a.home_corner_id)||{}).code)===c.code;}).length;}`);
ok('one headcount line per corner of the store', run(c, `cv.corners.length===storeCorners.length&&storeCorners.length>1`));
ok('each line counts the sellers on the floor in that corner', run(c, `storeCorners.every((q,i)=>cv.corners[i].map[ds]===expect(q))`));
ok('managers, off, absence and training are in no line', run(c, `(()=>{var sum=cv.corners.reduce((s,q)=>s+q.map[ds],0);var sales=agents.filter(a=>poolOf(a)==='sales'&&!r.cells[ds][a.id].special).length;return sum<=sales&&sum<cv.totPres[ds]})()`));
ok('the lines are in the Coverage & headcount table', run(c, `storeCorners.every(q=>document.getElementById('planning-coverage-body').innerHTML.indexOf('lbl-s" title="'+(q.full_name||q.code)+'">'+q.code+'<')!==-1)`));
run(c, `var mover=agents.find(a=>poolOf(a)==='sales'&&!r.cells[ds][a.id].special);var from=r.cells[ds][mover.id].corner;var to=storeCorners.find(q=>q.code!==from);
cornerOverrides[mover.id]=Object.assign({},cornerOverrides[mover.id],{[ds]:to.id});r=pickMonthlyPlan(buildMonthlyContext());r.paint();cv=lastCoverage;`);
ok('a corner changed for the day counts in the new corner', run(c, `r.cells[ds][mover.id].corner===to.code&&storeCorners.every((q,i)=>cv.corners[i].map[ds]===expect(q))`));
run(c, `storeCorners=[];r=pickMonthlyPlan(buildMonthlyContext());r.paint();`);
ok('a store without corner: no line', run(c, `lastCoverage.corners.length===0`));
// 3. Manual move to another corner in the Intraday
c = fresh();
run(c, `monthlyResult=pickMonthlyPlan().cells;var ds='2026-11-12';var a=agents.find(x=>poolOf(x)==='sales'&&monthlyResult[ds][x.id]&&!monthlyResult[ds][x.id].special);
var here=effectiveCornerId(a,monthlyResult[ds],storeCorners);var to=storeCorners.find(q=>q.id!==here);
addedMissions={};addedMissions[a.id]=[{id:'mv1',type:'reinf:'+to.id,start:15,dur:90},{id:'t1',type:'train',start:11}];
var m=buildIntradayModel(ds);var row=m.groups.flatMap(g=>g.rows).find(r=>r.a.id===a.id);var ex=toIntradayExport(m).rows.find(r=>r.agentId===a.id);`);
ok('the move is drawn like a reinforcement (arrow to the corner), not as a mission', run(c, `row.reinf.some(x=>x.id==='mv1'&&x.toCode===to.code&&x.start===15&&x.dur===1.5)&&!row.added.some(x=>x.id==='mv1')&&row.added.some(x=>x.id==='t1')`));
ok('the move is in the Excel', run(c, `ex.blocks.some(b=>b.type==='reinf'&&b.start===15&&b.dur===1.5&&b.label==='\\u2192'+to.code)`));
ok('no break is placed during the move', run(c, `row.blocks.every(b=>b[0]+b[1]<=15||b[0]>=16.5)`));
ok('the menu lists the other corners, not the own one', run(c, `(()=>{var reinfOpt=missionDef('reinf:'+to.id);return reinfOpt.free&&reinfOpt.toCode===to.code})()`));
// 4. Who and when
c = fresh();
run(c, `overrideMeta={};noteOverrideMeta({agent_id:'x',date:'2026-11-03',changed_by_name:'Julie Martin',changed_at:'2026-10-18T10:00:00Z'});noteOverrideMeta({agent_id:'x',date:'2026-11-03',changed_by_name:'Claire Dupont',changed_at:'2026-10-19T09:00:00Z'});noteOverrideMeta({agent_id:'x',date:'2026-11-04',created_at:'2026-10-01T09:00:00Z'});`);
ok('the latest change of a square is kept (shift or corner)', run(c, `overrideMeta.x['2026-11-03'].name==='Claire Dupont'`));
ok('a change made before 10.0.0.8 keeps its date, without name', run(c, `overrideMeta.x['2026-11-04'].name===''&&!!overrideMeta.x['2026-11-04'].at`));
run(c, `me={id:'u1',name:'Roman Test',role:'admin'};planningOverrides.y={'2026-11-05':'OFF'};setOverrideMeta('y','2026-11-05');var m1=overrideMeta.y['2026-11-05'];delete planningOverrides.y['2026-11-05'];setOverrideMeta('y','2026-11-05');`);
ok('a change made here shows its author at once; back to automatic: nothing', run(c, `m1.name==='Roman Test'&&!overrideMeta.y['2026-11-05']`));
console.log(out.map(x => (x[1] ? 'OK   ' : 'FAIL ') + x[0]).join('\n'));
process.exitCode = out.every(x => x[1]) ? 0 : 1;
