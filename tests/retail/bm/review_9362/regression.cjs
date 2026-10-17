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
 for(const file of ['CAST_v9_3_61_RETAIL.html','CAST_v9_3_62_RETAIL_TEST.html']){
  const c=context(file,name.startsWith('jp')?name:'bm');vm.runInContext(mod,c);
  const r=JSON.parse(vm.runInContext(`JSON.stringify((()=>{const r=pickMonthlyPlan();return {cells:r.cells,issues:r.issues};})())`,c,{timeout:180000}));
  if(previous){assert.deepStrictEqual(r,previous, name+' changed planning or issues');out.push({case:name,sameCells:true,sameIssues:true,mandatory:Object.keys(r.issues).filter(k=>/^(openNone|closeNone|week|hours|twoWeeks|row|day|rest)\|/.test(k)).length});}
  previous=r;
 }
 console.log(name,'unchanged');
 fs.writeFileSync(__dirname+'/regression-results.json',JSON.stringify(out,null,2));
}
