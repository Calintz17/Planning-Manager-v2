const fs=require('fs'),vm=require('vm'),{context}=require('../review_9362/runner.cjs');let out=[];
for(const month of [9,10,11])for(const type of ['A','OUT','conflict']){let runs=[];
 for(const channel of ['manual','calendar']){const c=context('CAST_v9_4_0_6_RETAIL_TEST.html');const ds=`2026-${String(month).padStart(2,'0')}-01`,ds2=`2026-${String(month).padStart(2,'0')}-${month===9?'07':month===10?'05':'02'}`;
 vm.runInContext(`Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-08-01T12:00:00']));}};monthlyRef=new Date(2026,${month-1},1);agentLeaves=agentLeaves.filter(x=>x.agent_id!=='a12');planningOverrides.a12={};`,c);
 for(const day of [ds,ds2]){
 const code=type==='conflict'?'O':type;
 if(channel==='manual')vm.runInContext(`planningOverrides.a12['${day}']='${code}';${type==='conflict'?`agentLeaves.push({agent_id:'a12',start_date:'${day}',end_date:'${day}',type:'absence'});`:''}`,c);
 else if(type==='conflict')vm.runInContext(`planningOverrides.a12['${day}']='O';`,c);
 else vm.runInContext(`agentLeaves.push({agent_id:'a12',start_date:'${day}',end_date:'${day}',type:'${type==='A'?'absence':'out'}'});`,c);
 }
 runs.push(JSON.parse(vm.runInContext(`JSON.stringify((()=>{const p=pickMonthlyPlan();return {cells:p.cells,issues:p.diagnostics.mandatoryIssues,hours:p.hours.a12};})())`,c,{timeout:180000})));}
 const same=JSON.stringify(runs[0].cells)===JSON.stringify(runs[1].cells),sameHours=JSON.stringify(runs[0].hours)===JSON.stringify(runs[1].hours);out.push({month,type,sameCells:same,sameHours,mandatory:runs.map(r=>r.issues.length)});console.log(JSON.stringify(out.at(-1)));
}fs.writeFileSync(__dirname+'/markers-results.json',JSON.stringify(out,null,2));if(out.some(x=>!x.sameCells||!x.sameHours))process.exitCode=1;
