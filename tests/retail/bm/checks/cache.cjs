// The last Monthly result is kept while the month's inputs stay the same (10.0.0.5, Astra's conditions of 19-10).
// Counts the calculations and the saves for each action. Synthetic data, no network. Usage: node cache.cjs [build]
const vm = require('vm'), {context} = require('./runner.cjs');
const file = process.argv[2] || 'CAST_RETAIL_TEST.html', out = [];
const run = (c, s) => vm.runInContext(s, c, {timeout: 300000});
const c = context(file);
run(c, `Date=class extends Date{constructor(...a){super(...(a.length?a:[window.NOW||'2026-10-19T12:00:00']));}static now(){return new Date().getTime();}};
monthlyRef=new Date(2026,10,1);manualMode=true;planSnapshot={storeId:currentStoreId,month:snapshotMonthKey(),ok:true,plan:{}};
window.n={calc:0,save:0};var cm=computeMonthlyPlan;computeMonthlyPlan=function(){window.n.calc++;return cm.apply(this,arguments);};
savePlanSnapshot=function(s,m,p){window.n.save++;planSnapshot.confirmed=p;return Promise.resolve(true);};
function act(f){window.n={calc:0,save:0};f();return JSON.stringify(window.n);}`);
// want: { calc: true } = at least one calculation, { calc: 0 } = none; save: 0 = no save, 1 = one save, absent = not checked
const step = (name, code, want) => { const got = JSON.parse(run(c, `act(function(){${code}})`));
  const ok = (want.calc === true ? got.calc > 0 : got.calc === want.calc) && (want.save == null || got.save === want.save); out.push([name, ok, JSON.stringify(got)]); };
step('first showing: one calculation, one save', 'renderMonthlyPlanning()', {calc: true, save: 1});
step('show again, nothing changed: no calculation, no save', 'renderMonthlyPlanning()', {calc: 0, save: 0});
step('change language: no calculation', "CURRENT_LANG='jp';renderMonthlyPlanning();CURRENT_LANG='en';renderMonthlyPlanning();", {calc: 0, save: 0});
step('change corner shown: no calculation', "currentCornerView=storeCorners[1].id;renderMonthlyPlanning();currentCornerView=null;renderMonthlyPlanning();", {calc: 0, save: 0});
out.push(['the kept result is the full calculation (cells and checks)', run(c, `(()=>{var a=pickMonthlyPlan(),b=pickMonthlyPlan(buildMonthlyContext());return JSON.stringify(a.cells)===JSON.stringify(b.cells)&&JSON.stringify(a.issues)===JSON.stringify(b.issues)&&a===lastMonthlyRun.run})()`), '']);
out.push(['the kept result cannot be changed by the screen', run(c, `(()=>{var r=pickMonthlyPlan(),ds=Object.keys(r.cells)[3],id=Object.keys(r.cells[ds])[0],was=r.cells[ds][id].code;try{r.cells[ds][id].code='XX';}catch(e){}return r.cells[ds][id].code===was&&Object.isFrozen(r.cells[ds][id])})()`), '']);
step('a change of data: a new calculation', "var a=agents.find(x=>poolOf(x)==='sales');planningOverrides[a.id]=Object.assign({},planningOverrides[a.id],{'2026-11-20':'OFF'});renderMonthlyPlanning();", {calc: true});
step('Recalculate from today: always calculated', "forceRecalc=true;try{renderMonthlyPlanning();}finally{forceRecalc=false;}", {calc: true});
step('midnight: yesterday becomes past, a new calculation', "window.NOW='2026-10-20T00:05:00';renderMonthlyPlanning();", {calc: true});
step('a new engine version: a new calculation', "CAST_VERSION='test-next';renderMonthlyPlanning();", {calc: true});
out.push(['another store: the old result is never applied', run(c, `(()=>{var r=pickMonthlyPlan();currentStoreId='other-store';var applied=r.paint();currentStoreId='bm';return applied===false})()`), '']);
// What is seen (Astra 10.0.0.6): a kept result is really drawn again, with the language and the corner shown
const d = context(file);
run(d, `Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-19T12:00:00']));}static now(){return new Date().getTime();}};
monthlyRef=new Date(2026,10,1);manualMode=true;planSnapshot={storeId:currentStoreId,month:snapshotMonthKey(),ok:true,plan:{}};
var saveOk=true;savePlanSnapshot=function(s,m,p){if(saveOk)planSnapshot.confirmed=p;return Promise.resolve(saveOk);};
var box=document.getElementById('planning-monthly-body');var rows=function(){return (box.innerHTML.match(/<tr/g)||[]).length;};
var show=function(){box.innerHTML='';var r=renderMonthlyPlanning();return {r:r,html:box.innerHTML,rows:rows()};};`);
out.push(['after the save, shown again from the kept result: drawn', run(d, `(()=>{var a=show(),b=show();return a.rows>0&&b.r===a.r&&b.html===a.html})()`), '']);
out.push(['corner shown: the table is drawn again with that corner only', run(d, `(()=>{var all=show();currentCornerView=storeCorners[0].id;var one=show();currentCornerView=null;var back=show();return one.r===all.r&&one.rows>0&&one.rows<all.rows&&back.html===all.html})()`), '']);
out.push(['language: the kept result is drawn in the new language', run(d, `(()=>{var en=show();CURRENT_LANG='fr';var fr=show();CURRENT_LANG='en';var back=show();return fr.r===en.r&&fr.rows===en.rows&&fr.html!==en.html&&back.html===en.html})()`), '']);
out.push(['a refused save: the result is not kept for the new data, nothing stale is drawn', run(d, `(()=>{saveOk=false;var a=pickMonthlyPlan(),ds=Object.keys(a.cells)[5],ag=agents.find(x=>poolOf(x)==='sales');planningOverrides[ag.id]=Object.assign({},planningOverrides[ag.id],{[ds]:'OFF'});
  var stale=a.paint(),b=show();saveOk=true;return stale===false&&b.r!==a&&b.rows>0})()`), '']);
out.push(['another store: a kept result is never drawn', run(d, `(()=>{var r=pickMonthlyPlan();box.innerHTML='kept';currentStoreId='other-store';var applied=r.paint();currentStoreId='bm';return applied===false&&box.innerHTML==='kept'})()`), '']);
console.log(out.map(x => (x[1] ? 'OK   ' : 'FAIL ') + x[0] + (x[1] ? '' : ' ' + x[2])).join('\n'));
process.exitCode = out.every(x => x[1]) ? 0 : 1;
