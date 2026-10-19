// Cached results must actually repaint, and still reject another store. Synthetic, no network.
// Run: node tests/retail/bm/checks/cache-render-astra.cjs [build]
const {context}=require('./runner.cjs'),vm=require('vm');
const c=context(process.argv[2]||'CAST_RETAIL_TEST.html');
const out=vm.runInContext(`(()=>{
Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-19T12:00:00']));}};
monthlyRef=new Date(2026,10,1);manualMode=true;
planSnapshot={storeId:currentStoreId,month:snapshotMonthKey(),ok:true,plan:{}};
savePlanSnapshot=async function(s,m,p){planSnapshot.confirmed=p;return true;};
var a=pickMonthlyPlan();var first=a.paint();
var before=monthlyFingerprint(monthlyInputs(),toDateStr(new Date()));
var hit=pickMonthlyPlan();CURRENT_LANG='ja';var second=hit.paint();
currentCornerView=storeCorners[0].id;var filtered=hit.paint();
var oldStore=currentStoreId;currentStoreId='other-store';var foreign=hit.paint();currentStoreId=oldStore;
return {firstPaint:first,cacheHit:hit===a,keyMatches:lastMonthlyRun.key===before,secondPaint:second,filteredPaint:filtered,foreignPaint:foreign};
})()`,c,{timeout:300000});console.log(JSON.stringify(out,null,2));process.exitCode=out.firstPaint&&out.cacheHit&&out.keyMatches&&out.secondPaint&&out.filteredPaint&&out.foreignPaint===false?0:1;
