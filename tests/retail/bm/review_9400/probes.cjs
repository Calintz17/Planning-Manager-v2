const vm=require('vm'),fs=require('fs'),assert=require('assert');
const {context}=require('../review_9362/runner.cjs');
const c=context('CAST_v9_4_0_0_RETAIL_TEST.html');
const out=JSON.parse(vm.runInContext(`JSON.stringify((()=>{
 const a=agents[0];a.weekly_hours=37.5;agentLeaves=[];calHolidays={};calOverrides={};
 const dates=Array.from({length:30},(_,i)=>'2026-11-'+String(i+1).padStart(2,'0'));
 function plan(){return Object.fromEntries(dates.map(d=>[d,{[a.id]:{code:'OFF',special:'off'}}]));}
 let cells=plan();cells['2026-11-01'][a.id]={code:'A',special:'leave'};
 const sundayLeave=monthHoursUsed(a,cells,dates)/60;
 cells=plan();cells['2026-11-02'][a.id]={code:'A',special:'leave'};
 const mondayLeave=monthHoursUsed(a,cells,dates)/60;
 a.status='PART_TIME';a.weekly_hours=21;agentPrefs[a.id]={fixed_schedule:{enabled:true,days:[1,2,3],start:600,end:1080}};
 const fixedDayLeave=monthHoursUsed(a,cells,dates)/60;
 cells=plan();cells['2026-11-05'][a.id]={code:'A',special:'leave'};
 const fixedOffLeave=monthHoursUsed(a,cells,dates)/60;
 cells=plan();calHolidays={'2026-11-05':'Synthetic holiday'};calOverrides={'2026-11-05':false};
 const fixedOffHoliday=monthHoursUsed(a,cells,dates)/60;
 return {sundayLeave,mondayLeave,fixedDayLeave,fixedOffLeave,fixedOffHoliday,monthReference:monthCapMin(a,30)/60};
})())`,c));
const d=context('CAST_v9_4_0_0_RETAIL_TEST.html');
out.generated=JSON.parse(vm.runInContext(`JSON.stringify((()=>{const r=pickMonthlyPlan();return {status:r.diagnostics.status,mandatory:r.diagnostics.mandatoryIssues.length,monthExcess:Object.entries(r.issues).filter(([k])=>k.startsWith('month|')).map(([k,v])=>({key:k,hours:v/60})),unknown:r.diagnostics.unknown.length};})())`,d,{timeout:180000}));
fs.writeFileSync(__dirname+'/probe-results.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
