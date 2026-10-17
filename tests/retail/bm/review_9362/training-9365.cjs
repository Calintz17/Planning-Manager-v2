// Claude 2026-10-17, Retail 9.3.65 TEST: training (OUT) = 9:00-18:00 with a 1 h 30 break (450 paid min, Roman 17-10).
// 1) The 9.3.64 plan of Astra's 'longClose' case, checked with the 9.3.65 rules: trainees' weeks go over the weekly hours.
// 2) The 9.3.65 plan of the same case: no mandatory break. 3) A week of known days with training is now 'checked'.
const fs=require('fs'),vm=require('vm');const {context}=require('./runner.cjs');
const mod="RETAIL_SHIFTS.sales.find(s=>s.code==='C').endMin=1260;storeSettings.min_closing=3;";
const c4=context('CAST_v9_3_64_RETAIL_TEST.html','bm');vm.runInContext(mod,c4);const cells=vm.runInContext('JSON.stringify(pickMonthlyPlan().cells)',c4);
const c5=context('CAST_v9_3_65_RETAIL_TEST.html','bm');vm.runInContext(mod,c5);
const out=JSON.parse(vm.runInContext(`(()=>{const cells=${cells};const r=pickMonthlyPlan();
 const days=Object.keys(r.cells).sort().map(ds=>({ds:ds,closure:getDayClosureType(ds)}));
 const ctx={days:days,today:'2026-10-31',outside:()=>undefined};
 const a=agents.find(x=>x.id==='a27'),wk=['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15'];
 const paid=(c)=>wk.reduce((m,ds)=>{const h=ruleHours(a,ds,c[ds][a.id]);return m+(h?h.paid:0);},0)/60;
 return JSON.stringify({trainingDay:TRAINING_DAY,plan9364:finalCheck(cells,ctx).mandatory,plan9365:finalCheck(r.cells,ctx).mandatory,
  a27week0911:{limitHours:regulations.weekly_hours,paid9364:paid(cells),paid9365:paid(r.cells),days9365:wk.map(ds=>r.cells[ds][a.id].code)}});})()`,c5));
console.log(JSON.stringify(out,null,1));fs.writeFileSync(__dirname+'/training-9365-results.json',JSON.stringify(out,null,2));
