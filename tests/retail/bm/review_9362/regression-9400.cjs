// Claude 2026-10-17: 9.3.65 -> 9.4.0.0 (advisor weekly hours, month counter, no preferred shift). Every changed cell and issue on Astra's eight cases.
// Usage: node regression-9400.cjs
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {context}=require('./runner.cjs');
const out=[],MAND=/^(openNone|closeNone|week|hours|twoWeeks|row|day|rest)\|/;
const cases=[['bm',''],['jpA',''],['jpB',''],
 ['zeroTraffic','Object.values(trafficDaily).forEach(x=>x.traffic=0);Object.keys(cornerTrafficMonthly).forEach(k=>cornerTrafficMonthly[k]={last_year:0,current_year:0});'],
 ['hours30','regulations.weekly_hours=30;'],
 ['longClose',"RETAIL_SHIFTS.sales.find(s=>s.code==='C').endMin=1260;storeSettings.min_closing=3;"],
 ['fewSales',"var kept=0;agents=agents.filter(a=>poolOf(a)!=='sales'||++kept<=4);"],
 ['learned',"for(const a of agents){planningOverrides[a.id]={};for(let d=1;d<=31;d++)planningOverrides[a.id]['2026-10-'+String(d).padStart(2,'0')]=d%7<2?'OFF':'O';}"]];
for(const [name,mod] of cases){
 let previous;
 for(const file of ['CAST_v9_3_65_RETAIL_TEST.html','CAST_v9_4_0_0_RETAIL_TEST.html']){
  const c=context(file,name.startsWith('jp')?name:'bm');vm.runInContext(mod,c);
  const r=JSON.parse(vm.runInContext(`JSON.stringify((()=>{const r=pickMonthlyPlan();return {cells:r.cells,issues:r.issues,status:r.diagnostics.status,unknown:r.diagnostics.unknown};})())`,c,{timeout:180000}));
  if(previous){
   const changed=[];for(const ds in r.cells)for(const id in r.cells[ds]){const x=JSON.stringify(r.cells[ds][id]),y=JSON.stringify((previous.cells[ds]||{})[id]);if(x!==y)changed.push(ds+' '+id+' '+y+' -> '+x);}
   const keys=new Set([...Object.keys(r.issues),...Object.keys(previous.issues)]),moved=[...keys].filter(k=>(r.issues[k]||0)!==(previous.issues[k]||0)).map(k=>k+' '+(previous.issues[k]||0)+' -> '+(r.issues[k]||0));
   const mand=x=>Object.keys(x).filter(k=>MAND.test(k)).length;
   out.push({case:name,changedCells:changed.length,changedSample:changed.slice(0,6),changedIssues:moved.length,issuesSample:moved.slice(0,8),mandatoryBefore:mand(previous.issues),mandatoryAfter:mand(r.issues),before:previous.status,status:r.status,unknown:r.unknown.length});}
  previous=r;
 }
 console.log(JSON.stringify(out[out.length-1]));
 fs.writeFileSync(__dirname+'/regression-9400-results.json',JSON.stringify(out,null,2));
}
