// Claude 2026-10-17: 9.3.63 -> 9.3.64, same cells and same issues on Astra's eight cases; status now says checked / incomplete / violation.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {context}=require('./runner.cjs');
const out=[];
const cases=[['bm',''],['jpA',''],['jpB',''],
 ['zeroTraffic','Object.values(trafficDaily).forEach(x=>x.traffic=0);Object.keys(cornerTrafficMonthly).forEach(k=>cornerTrafficMonthly[k]={last_year:0,current_year:0});'],
 ['hours30','regulations.weekly_hours=30;'],
 ['longClose',"RETAIL_SHIFTS.sales.find(s=>s.code==='C').endMin=1260;storeSettings.min_closing=3;"],
 ['fewSales',"var kept=0;agents=agents.filter(a=>poolOf(a)!=='sales'||++kept<=4);"],
 ['learned',"for(const a of agents){planningOverrides[a.id]={};for(let d=1;d<=31;d++)planningOverrides[a.id]['2026-10-'+String(d).padStart(2,'0')]=d%7<2?'OFF':'O';}"]];
for(const [name,mod] of cases){
 let previous;
 for(const file of ['CAST_v9_3_63_RETAIL_TEST.html','CAST_v9_3_64_RETAIL_TEST.html']){
  const c=context(file,name.startsWith('jp')?name:'bm');vm.runInContext(mod,c);
  const r=JSON.parse(vm.runInContext(`JSON.stringify((()=>{const r=pickMonthlyPlan();return {cells:r.cells,issues:r.issues,status:r.diagnostics.status,unknown:r.diagnostics.unknown};})())`,c,{timeout:180000}));
  if(previous){assert.deepStrictEqual(r.cells,previous.cells, name+' changed planning');assert.deepStrictEqual(r.issues,previous.issues, name+' changed issues');out.push({case:name,sameCells:true,sameIssues:true,before:previous.status,status:r.status,unknown:r.unknown.length,unknownSample:r.unknown.slice(0,3)});}
  previous=r;
 }
 console.log(name,'unchanged');
 fs.writeFileSync(__dirname+'/regression-9364-results.json',JSON.stringify(out,null,2));
}
