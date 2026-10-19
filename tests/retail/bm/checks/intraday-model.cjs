// The Intraday model keeps its own copies (Astra 10.0.0.6): once built, a change of settings or store does not change
// what it exports; added missions are resolved once (duration, labels, look). Synthetic data. Usage: node intraday-model.cjs [build]
const vm = require('vm'), {context} = require('./runner.cjs');
const c = context(process.argv[2] || 'CAST_RETAIL_TEST.html'), out = [];
const run = s => vm.runInContext(s, c, {timeout: 300000});
run(`Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-19T12:00:00']));}};monthlyRef=new Date(2026,10,1);
monthlyResult=pickMonthlyPlan().cells;var ds=Object.keys(monthlyResult).find(d=>Object.values(monthlyResult[d]).some(x=>x&&!x.special&&x.code));
var who=Object.keys(monthlyResult[ds]).find(id=>monthlyResult[ds][id]&&!monthlyResult[ds][id].special);
var brk=(regulations.breaks||[])[0];addedMissions={};addedMissions[who]=[{id:'m1',type:'train',start:14},{id:'m2',type:'brk:'+brk.name,start:16}];
var model=buildIntradayModel(ds);var row=model.groups.flatMap(g=>g.rows).find(r=>r.a.id===who);
var before=JSON.stringify(toIntradayExport(model));`);
out.push(['added missions resolved in the model (duration, label, look)', run(`(()=>{var t=row.added[0],b=row.added[1];return t.dur===1&&t.label==='Training'&&t.cls==='b-train'&&b.dur===brk.duration/60&&b.label===brk.name&&!!b.color})()`)]);
out.push(['the model has its store', run(`model.storeId===currentStoreId`)]);
out.push(['settings and store changed after: the export of the model is the same', run(`(()=>{var keep=brk.duration;brk.duration=keep+30;var s=currentStoreId;currentStoreId='other';shiftInfo={};
  var after=JSON.stringify(toIntradayExport(model));brk.duration=keep;currentStoreId=s;return after===before})()`)]);
out.push(['the export reads the model only (same as a new model with the same data)', run(`JSON.stringify(toIntradayExport(buildIntradayModel(ds)))===before`)]);
console.log(out.map(x => (x[1] ? 'OK   ' : 'FAIL ') + x[0]).join('\n'));
process.exitCode = out.every(x => x[1]) ? 0 : 1;
