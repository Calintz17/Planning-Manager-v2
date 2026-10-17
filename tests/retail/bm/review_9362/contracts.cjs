const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {context}=require('./runner.cjs');
const file=process.argv[2]||'CAST_v9_3_61_RETAIL.html';
const c=context(file);
const out={};
out.movedViolation=vm.runInContext(`(()=>{
 const original=pickMonthlyPlan;let moved=false;
 pickMonthlyPlan=()=>({issues:moved?{'closeNone|2026-11-15':1}:{'closeNone|2026-11-14':1}});
 try{return manualChangeIssue(()=>moved=true,()=>moved=false);}finally{pickMonthlyPlan=original;}
})()`,c);
out.resultProtection=vm.runInContext(`(()=>{
 const r=computeMonthlyPlan({habits:true}),ds=Object.keys(r.cells)[0],id=Object.keys(r.cells[ds])[0],before=r.cells[ds][id].code;
 r.cells[ds][id].code='INVALID_TEST';
 return {protected:r.cells[ds][id].code===before};
})()`,c);
out.stalePaint=vm.runInContext(`(()=>{
 const r=computeMonthlyPlan({habits:true}),old=currentStoreId;currentStoreId='other-store';
 const before=JSON.stringify(monthlyResult);let result;
 try {result=r.paint();return {blocked:JSON.stringify(monthlyResult)===before,returned:result};}
 finally{currentStoreId=old;}
})()`,c);
out.invalidSave=vm.runInContext(`(()=>{
 const sid=currentStoreId;planSnapshot={storeId:sid,month:snapshotMonthKey(),ok:true,plan:{}};
 regulations.max_daily_hours=1;let writes=0;const original=savePlanSnapshot;savePlanSnapshot=()=>{writes++;return Promise.resolve();};
 try{const r=computeMonthlyPlan({habits:true});r.paint();return {mandatory:Object.keys(r.issues).filter(k=>MANDATORY.test(k)).length,writes,diagnostics:r.diagnostics};}
 finally{savePlanSnapshot=original;}
})()`,c);
if(file.includes('9362')||file.includes('9_3_62')){assert(out.movedViolation);assert(out.resultProtection.protected);assert(out.stalePaint.blocked);assert(out.invalidSave.mandatory>0);assert.strictEqual(out.invalidSave.writes,0);}
console.log(JSON.stringify({...out,invalidSave:{mandatory:out.invalidSave.mandatory,writes:out.invalidSave.writes,status:out.invalidSave.diagnostics?.status}},null,2));
fs.writeFileSync(__dirname+'/'+file.replace('.html','')+'-contracts.json',JSON.stringify(out,null,2));
