// validatePlan (9.5.0.2): the final check of a plan with the inputs it was made with, away from the engine.
// 1. On the eight cases, validatePlan(cells, ctx) gives the same issues and status as the calculation.
// 2. After the live data changes (contract hours, a new leave, a deleted shift), the saved context still gives the same answer.
// Exit 1 on any difference. Usage: node validate-plan-9502.cjs [build]
const vm=require('vm'),fs=require('fs'),{context}=require('../review_9362/runner.cjs');
const file=process.argv[2]||'CAST_v9_5_0_2_RETAIL_TEST.html';
const cases=[['bm',''],['jpA',''],['jpB',''],['hours30','regulations.weekly_hours=30;'],
 ['learned',"for(const a of agents){planningOverrides[a.id]={};for(let d=1;d<=31;d++)planningOverrides[a.id]['2026-10-'+String(d).padStart(2,'0')]=d%7<2?'OFF':'O';}"],
 ['sixManual',"var x=agents.find(a=>poolOf(a)==='sales');planningOverrides[x.id]={};['02','03','04','05','06','07'].forEach(d=>planningOverrides[x.id]['2026-11-'+d]='O');"]];
const out=[];let failed=false;
for(const [name,mod] of cases){
  const c=context(file,name.startsWith('jp')?name:'bm'); vm.runInContext(mod,c);
  const r=JSON.parse(vm.runInContext(`JSON.stringify((()=>{
    const ctx=buildMonthlyContext(); const p=pickMonthlyPlan(ctx); const v=validatePlan(p.cells, ctx);
    const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
    // live data changes after the plan was made: the saved context must not move
    agents.forEach(a=>{a.weekly_hours=12;}); agentLeaves.push({agent_id:agents[0].id,start_date:'2026-11-01',end_date:'2026-11-30',type:'absence'});
    RETAIL_SHIFTS.sales=RETAIL_SHIFTS.sales.slice(1);
    const later=validatePlan(p.cells, ctx), liveNow=finalCheckLive(p.cells);
    function finalCheckLive(cells){ return validatePlan(cells, buildMonthlyContext()); }
    return { sameIssues: same(v.issues,p.issues), sameStatus: v.status===p.diagnostics.status, status:v.status,
      frozenSame: same(later.issues,v.issues)&&later.status===v.status, liveDiffers: !same(liveNow.issues,v.issues) };
  })())`,c,{timeout:240000}));
  const row=Object.assign({case:name},r); out.push(row); console.log(JSON.stringify(row));
  if(!r.sameIssues||!r.sameStatus||!r.frozenSame||!r.liveDiffers) failed=true;
}
fs.writeFileSync(__dirname+'/validate-plan-9502-results.json',JSON.stringify(out,null,2));
process.exit(failed?1:0);
