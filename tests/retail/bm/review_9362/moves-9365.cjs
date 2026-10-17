// Claude 2026-10-17, Retail 9.3.65 TEST: tested moves. Cases where the step-by-step repairs leave a mandatory rule broken
// because the next month is already known (rest and days in a row across Nov 30 / Dec 1), plus an absurd daily limit.
// Usage: node moves-9365.cjs   (compares 9.3.64 and 9.3.65, Astra's runner context, clock 31-10, Store A synthetic)
const fs=require('fs'),vm=require('vm');
const {context}=require('./runner.cjs');
const known=(from,n,code)=>`(()=>{const p={};for(let i=0;i<${n};i++){const d=new Date('${from}T12:00:00');d.setDate(d.getDate()+i);const ds=toDateStr(d);p[ds]={};agents.forEach(a=>p[ds][a.id]=${code});}return p;})()`;
const snap=(next)=>`planSnapshot={storeId:currentStoreId,month:snapshotMonthKey(),ok:true,plan:{},prevPlan:null,nextPlan:${next}};`;
const next=(work,n)=>`(()=>{const p=${known('2026-12-01',7,"{code:'OFF',special:'off'}")};for(let i=1;i<=${n};i++){const ds='2026-12-0'+i;agents.forEach(a=>p[ds][a.id]=${work});}return p;})()`;
const cases=[
 ['restNextMonth',"regulations.rest_gap_hours=14;"+snap(next("{code:'O',tone:'open'}",1))],
 ['rowNextMonth',snap(next("{code:'M',tone:'mid'}",3))],
 ['dailyLimit1h',"regulations.max_daily_hours=1;"]];
const out=[];
for(const [name,mod] of cases){
 const row={case:name};
 for(const file of ['CAST_v9_3_64_RETAIL_TEST.html','CAST_v9_3_65_RETAIL_TEST.html']){
  const c=context(file,'bm');vm.runInContext(mod,c);const t=Date.now();
  const r=JSON.parse(vm.runInContext(`JSON.stringify((()=>{const r=pickMonthlyPlan();const m=r.diagnostics.mandatoryIssues;
   const fam={};m.forEach(k=>{const f=k.split('|')[0];fam[f]=(fam[f]||0)+1;});
   const tgt=Object.keys(r.issues).filter(k=>!MANDATORY.test(k)).length;
   return {mandatory:m.length,families:fam,targets:tgt,status:r.diagnostics.status,moves:r.diagnostics.moves?{tried:r.diagnostics.moves.tried,applied:r.diagnostics.moves.applied.length,kinds:r.diagnostics.moves.applied.reduce((o,x)=>(o[x.kind]=(o[x.kind]||0)+1,o),{}),failed:r.diagnostics.moves.failed.length,sample:r.diagnostics.moves.applied.slice(0,3)}:null};})())`,c,{timeout:600000}));
  r.seconds=(Date.now()-t)/1000;row[file.includes('64')?'v9364':'v9365']=r;
 }
 console.log(JSON.stringify(row));out.push(row);
}
fs.writeFileSync(__dirname+'/moves-9365-results.json',JSON.stringify(out,null,2));
