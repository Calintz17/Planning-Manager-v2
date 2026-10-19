// Astra audit 10.0.0.1. Synthetic fixture only. No network or production writes.
// Run: node tests/retail/bm/checks/audit-100001.cjs [absolute build path]
// Known failures are reported and make the command exit 1 until corrected.
const vm=require('vm');
const {context}=require('./runner.cjs');
const build=process.argv[2]||'CAST_RETAIL_TEST.html';
const results=[];
function fresh(){const c=context(build);vm.runInContext(`Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-19T12:00:00']));}};monthlyRef=new Date(2026,10,1);`,c);return c;}
function run(c,s){return vm.runInContext(s,c,{timeout:180000});}
(async()=>{
 let c=fresh();
 results.push(JSON.parse(run(c,`JSON.stringify((()=>{const counts=[3,4,5,17].map(n=>Object.values(lateCodes(Array.from({length:n},(_,i)=>({code:'S'+i,startMin:500+i,endMin:1000+i})))).filter(Boolean).length);return {test:'last quarter rounded up',counts,pass:JSON.stringify(counts)==='[1,1,2,5]'};})())`)));
 c=fresh();
 results.push(JSON.parse(run(c,`JSON.stringify((()=>{
 agents=agents.filter(a=>['a00','a01','a02','a09'].includes(a.id));agentLeaves=[];agentPrefs={};storeCorners=storeCorners.slice(0,1);storeSettings.closing_ratio=.7;
 const ctx=buildMonthlyContext(),result=pickMonthlyPlan(ctx),ds='2026-11-21',row=result.cells[ds];
 const working=Object.values(row).filter(r=>!r.special&&['O','M','C'].includes(r.code));
 const target=Math.round(.7*working.length),actual=working.filter(r=>r.code==='C').length;
 const trial=JSON.parse(JSON.stringify(result.cells));trial[ds].a00={code:'C',tone:'close'};
 const check=validatePlan(trial,ctx),added=mandatoryAdded(check.issues,result.issues);
 return {test:'feasible late target precedes automatic manager role heuristic',date:ds,target,actual,alternativeNewMandatory:added,pass:actual===target||added.length>0};
 })())`)));
 c=fresh();
 run(c,`me={id:'test-admin',role:'admin'};var sent=pickMonthlyPlan();planSnapshot={storeId:currentStoreId,month:snapshotMonthKey(),ok:true,plan:JSON.parse(JSON.stringify(sent.cells))};manualMode=true;monthReview={id:'reviewtest',store_id:currentStoreId,month:shownMonthKey(),revision:1,status:'pending',submitted_plan:JSON.parse(JSON.stringify(sent.cells))};agents.push({...agents[9],id:'new-employee',first_name:'New',last_name:'Test'});lastSnapSave=null;reviewStep=async(name,args)=>{window.auditArgs=args;return true;};`);
 await run(c,`decideReview('validated','')`);
 results.push(JSON.parse(run(c,`JSON.stringify({test:'approval does not silently add an employee absent from submission',submittedPeople:Object.keys(monthReview.submitted_plan['2026-11-19']).length,approvedPeople:Object.keys(window.auditArgs.p_plan['2026-11-19']).length,pass:!window.auditArgs.p_plan['2026-11-19']['new-employee']})`)));
 console.log(JSON.stringify(results,null,2));process.exitCode=results.every(r=>r.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});
