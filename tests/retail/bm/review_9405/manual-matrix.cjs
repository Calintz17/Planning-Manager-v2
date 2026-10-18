const {context}=require('../review_9362/runner.cjs'),vm=require('vm'),fs=require('fs');
const out=[];
for(const mode of ['off','work','out','absence','leaveOut','leaveAbsence','sixManual','conflictLeave']){
 const c=context('CAST_v9_4_0_5_RETAIL_TEST.html');
 const mods={off:"planningOverrides.a12={'2026-11-02':'OFF','2026-11-03':'OFF'}",work:"planningOverrides.a12={'2026-11-02':'O','2026-11-03':'C'}",out:"planningOverrides.a12={'2026-11-02':'OUT'}",absence:"planningOverrides.a12={'2026-11-02':'A'}",leaveOut:"agentLeaves.push({agent_id:'a12',start_date:'2026-11-02',end_date:'2026-11-02',type:'out'})",leaveAbsence:"agentLeaves.push({agent_id:'a12',start_date:'2026-11-02',end_date:'2026-11-02',type:'absence'})",sixManual:"planningOverrides.a12={};for(let d=2;d<=7;d++)planningOverrides.a12['2026-11-0'+d]='O'",conflictLeave:"planningOverrides.a12={'2026-11-02':'O'};agentLeaves.push({agent_id:'a12',start_date:'2026-11-02',end_date:'2026-11-02',type:'absence'})"};
 vm.runInContext(mods[mode],c);
 const r=JSON.parse(vm.runInContext(`JSON.stringify((()=>{const p=pickMonthlyPlan(),a=agents.find(a=>a.id==='a12');const cells=[],hours=[];for(let d=2;d<=8;d++){let ds='2026-11-0'+d,r=p.cells[ds][a.id];cells.push(r.code);hours.push(ruleHours(a,ds,r)?.paid||0)}return {cells,hours,issues:p.issues,status:p.diagnostics.status};})())`,c,{timeout:180000}));
 out.push({mode,...r});console.log(JSON.stringify(out.at(-1)));
}
fs.writeFileSync(__dirname+'/manual-matrix-results.json',JSON.stringify(out,null,2));
const failures=[];
for(const [mode,wantedWork,wantedOff] of [['absence',4,2],['conflictLeave',5,2]]){
 const r=out.find(x=>x.mode===mode),work=r.cells.filter(x=>!['A','OUT','OFF'].includes(x)).length,off=r.cells.filter(x=>x==='OFF').length;
 if(work!==wantedWork||off!==wantedOff)failures.push({mode,work,off,wantedWork,wantedOff});
}
console.log(JSON.stringify({failures}));if(failures.length)process.exitCode=1;
