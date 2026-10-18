// Source-only regression probes. No network, database or real accounts.
// Run: node checks/audit-context-startup.cjs [build]
const fs=require('fs'),vm=require('vm'),{context}=require('./runner.cjs');
(async()=>{
 const c=context(process.argv[2]||'CAST_RETAIL_TEST.html');
 const result=JSON.parse(vm.runInContext(`JSON.stringify((()=>{
   const ctx=buildMonthlyContext(),p=pickMonthlyPlan(ctx);let jsonRoundTrip;
   try{validatePlan(p.cells,JSON.parse(JSON.stringify(ctx)));jsonRoundTrip={ok:true};}
   catch(e){jsonRoundTrip={ok:false,error:e.message};}
   // 9.5.0.4: the month is kept as text (YYYY-MM-DD), so it cannot be changed inside the frozen context
   const m=ctx.inputs.monthlyRef;let dateMutation;
   if(typeof m==='string'){try{ctx.inputs.monthlyRef='2099-01-01';}catch(e){}dateMutation=ctx.inputs.monthlyRef!==m;}
   else{const y=m.getFullYear();m.setFullYear(y+1);dateMutation=m.getFullYear()!==y;}
   return {jsonRoundTrip,dateMutation,monthType:typeof m};
 })())`,c,{timeout:180000}));
 vm.runInContext(`workspaceStarted=false;showLoader=()=>{};hideLoader=()=>{};
 sb.from=()=>({select(){return this},order(){return Promise.reject(Error('synthetic network rejection'))}});`,c);
 try{await vm.runInContext('startWorkspace()',c);}catch(e){result.startupError=e.message;}
 result.startupLocked=c.workspaceStarted;
 console.log(JSON.stringify(result,null,2));
 if(!result.jsonRoundTrip.ok||result.dateMutation||result.startupLocked)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
