const fs=require('fs'),vm=require('vm'),{context}=require('../review_9362/runner.cjs');let out=[];
for(const current of [37.5,21]){
 const c=context('CAST_v9_4_0_3_RETAIL_TEST.html');
 vm.runInContext(`Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-12-01T12:00:00']));}};monthlyRef=new Date(2026,10,1);regulations.monthly_rest_days=10;const a=agents.find(a=>a.id==='a12');a.weekly_hours=${current};a.weekly_hours_history=[{from:'2000-01-01',hours:37.5},{from:'2026-12-01',hours:${current}}];`,c);
 out.push(JSON.parse(vm.runInContext(`JSON.stringify((()=>{const a=agents.find(a=>a.id==='a12'),r=pickMonthlyPlan();return {current:a.weekly_hours,historical:contractHours(a,'2026-11-01'),worked:Object.values(r.cells).filter(x=>x[a.id]&&!x[a.id].special).length,reference:r.hours[a.id].reference,used:r.hours[a.id].used,codes:Object.entries(r.cells).map(([d,x])=>[d,x[a.id].code])};})())`,c,{timeout:180000})));
}
fs.writeFileSync(__dirname+'/history-results.json',JSON.stringify(out,null,2));console.log(out.map(({codes,...r})=>r));
