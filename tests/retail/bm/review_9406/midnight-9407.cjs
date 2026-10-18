// One reference date per calculation (Astra 9.4.0.6, 4.A). A context built on 18/10 at 23:59 and computed at 00:01 on 19/10
// must give the same cells as a calculation done entirely on 18/10. Exit 1 on 9.4.0.7 if it does not.
const vm=require('vm'),{context}=require('../review_9362/runner.cjs');
const clock=t=>`Date=class extends Date{constructor(...a){super(...(a.length?a:['${t}']));}static now(){return new Date('${t}').getTime();}};`;
function run(file,later){
 const c=context(file);
 vm.runInContext(clock('2026-10-18T23:59:00')+`monthlyRef=new Date(2026,9,1);manualMode=true;forceRecalc=true;
  var off={code:'OFF',cls:'sh-off',special:'off'},plan={};
  for(var d=1;d<=31;d++){var ds='2026-10-'+String(d).padStart(2,'0');plan[ds]={};agents.forEach(function(a){plan[ds][a.id]=off;});}
  planSnapshot={storeId:currentStoreId,month:'2026-10-01',ok:true,plan:plan,confirmed:plan};
  var __ctx=buildMonthlyContext();`,c);
 if(later)vm.runInContext(clock('2026-10-19T00:01:00'),c);
 return JSON.parse(vm.runInContext(`JSON.stringify(computeMonthlyPlan({habits:true},__ctx).cells)`,c,{timeout:180000}));
}
const out={};
for(const f of ['CAST_v9_4_0_6_RETAIL_TEST.html','CAST_v9_4_0_7_RETAIL_TEST.html']){
 const a=run(f,false),b=run(f,true);
 const diff=Object.keys(a).flatMap(id=>Object.keys(a[id]||{}).filter(ds=>JSON.stringify(a[id][ds])!==JSON.stringify((b[id]||{})[ds])).map(ds=>id+'|'+ds));
 out[f]={changedCells:diff.length,sample:diff.slice(0,4)};console.log(f,JSON.stringify(out[f]));
}
require('fs').writeFileSync(__dirname+'/midnight-9407-results.json',JSON.stringify(out,null,2));
if(out['CAST_v9_4_0_7_RETAIL_TEST.html'].changedCells)process.exitCode=1;
