// Two builds on the eight cases. Fails (exit 1) when a cell changes or a mandatory rule appears or grows
// (compared key by key, like mandatoryAdded). Replaces regression-93xx/94xx/9500.cjs (kept in Git history).
// Usage: node regression.cjs CAST_vA_RETAIL_TEST.html CAST_vB_RETAIL_TEST.html
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {context}=require('./runner.cjs');
const MAND=/^(data|cell|openNone|closeNone|week|hours|twoWeeks|row|day|rest)\|/;
const cases=[['bm',''],['jpA',''],['jpB',''],
 ['zeroTraffic','Object.values(trafficDaily).forEach(x=>x.traffic=0);Object.keys(cornerTrafficMonthly).forEach(k=>cornerTrafficMonthly[k]={last_year:0,current_year:0});'],
 ['hours30','regulations.weekly_hours=30;'],
 ['longClose',"RETAIL_SHIFTS.sales.find(s=>s.code==='C').endMin=1260;storeSettings.min_closing=3;"],
 ['fewSales',"var kept=0;agents=agents.filter(a=>poolOf(a)!=='sales'||++kept<=4);"],
 ['learned',"for(const a of agents){planningOverrides[a.id]={};for(let d=1;d<=31;d++)planningOverrides[a.id]['2026-10-'+String(d).padStart(2,'0')]=d%7<2?'OFF':'O';}"]];
if(!process.argv[3]){console.error('Usage: node regression.cjs <old build> <new build>');process.exit(2);}
const out=[];let failed=false;
for(const [name,mod] of cases){
 const runs=[process.argv[2],process.argv[3]].map(file=>{
  const c=context(file,name.startsWith('jp')?name:'bm');vm.runInContext(mod,c);
  return JSON.parse(vm.runInContext(`JSON.stringify((()=>{const r=pickMonthlyPlan();return {cells:r.cells,issues:r.issues,status:r.diagnostics.status};})())`,c,{timeout:180000}));
 });
 const [a,b]=runs,mand=x=>Object.keys(x.issues).filter(k=>MAND.test(k));
 const added=mand(b).filter(k=>b.issues[k]>(a.issues[k]||0)+1e-6);
 const row={case:name,sameCells:JSON.stringify(a.cells)===JSON.stringify(b.cells),mandatoryBefore:mand(a).length,mandatoryAfter:mand(b).length,added,before:a.status,status:b.status};
 try{assert.ok(row.sameCells,name+' changed planning');assert.deepStrictEqual(added,[],name+' new or bigger mandatory');}catch(e){failed=true;row.error=e.message;}
 console.log(JSON.stringify(row));out.push(row);
}
fs.writeFileSync(__dirname+'/results/regression.json',JSON.stringify(out,null,2));
if(failed)process.exit(1);
