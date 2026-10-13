/* Public synthetic integration bench. Small planner, NOT the CAST production engine. */
const assert=require('node:assert/strict');
const {buildLearningModel}=require('./learning.js');
const {selectLearningHistory}=require('./history-policy.js');
const {assessLearningCandidate}=require('./viability-gate.js');
const cutoff='2026-11-02';
const roster=Array.from({length:4},(_,i)=>({id:'agent-'+i,storeId:'test',pool:'sales',joined:'2026-01-01',contextVersion:'v1',catalogue:['O','C']}));
const catalogue={O:{start:570,end:1080},C:{start:720,end:1230}};
const records=[];
for(let k=1;k<=84;k++)for(let i=0;i<4;i++){
 const d=new Date(Date.parse(cutoff)-k*86400000),dow=d.getUTCDay();
 const off=dow===(i+1)%7||dow===(i+2)%7;
 records.push({agentId:roster[i].id,storeId:'test',pool:'sales',date:d.toISOString().slice(0,10),state:off?'off':'work',shift:off?null:i%2?'C':'O',source:'official',validated:true,contextVersion:'v1'});
}
const selected=selectLearningHistory(records,roster,cutoff);
const model=buildLearningModel(selected.records,cutoff);
function simulate(rules,learning){
 let states=[{days:[],count:[0,0,0,0],run:[0,0,0,0],prev:[null,null,null,null],score:0}];
 for(let day=0;day<7;day++){
  const date=new Date(Date.parse(cutoff)+day*86400000),ds=date.toISOString().slice(0,10),dow=date.getUTCDay(),next=[];
  for(const state of states)for(let mask=0;mask<81;mask++){
   let m=mask,choices=[],count=state.count.slice(),run=state.run.slice(),score=state.score,ok=true;
   for(let i=0;i<4;i++){
    const code=['OFF','O','C'][m%3];m=Math.floor(m/3);choices.push(code);
    const work=code!=='OFF',blocked=(rules.blocked||[]).includes(i+':'+day),fixed=rules.fixed?.[i+':'+day];
    if((blocked&&work)||(fixed&&fixed!==code)){ok=false;break;}
    count[i]+=work?1:0;run[i]=work?run[i]+1:0;
    if(count[i]>rules.maxDays || count[i]*7.5>rules.weeklyHours || run[i]>rules.maxRun){ok=false;break;}
    if(work){const shift=catalogue[code],prev=catalogue[state.prev[i]];
     if((shift.end-shift.start-60)/60>rules.dailyHours || (prev&&1440+shift.start-prev.end<rules.restHours*60)){ok=false;break;}}
    if(learning){const a=roster[i],p=model.presence(a.id,a.pool,dow);score+=Math.log(Math.max(.001,work?p:1-p));if(work)score+=Math.log(Math.max(.001,model.shift(a.id,a.pool,dow,code,2)));}
   }
   if(!ok||choices.filter(x=>x==='O').length<rules.minOpen||choices.filter(x=>x==='C').length<rules.minClose)continue;
   next.push({days:[...state.days,choices],count,run,prev:choices,score});
  }
  // Bound execution; failure is "no solution found", not a proof of impossibility.
  next.sort((a,b)=>b.score-a.score);states=next.slice(0,250);
  if(!states.length)return {found:false};
 }
 return {found:true,...states[0]};
}
const rules={maxDays:5,maxRun:5,weeklyHours:37.5,dailyHours:8.5,restHours:11,minOpen:1,minClose:1};
function verify(plan,rules){
 assert(plan.found);for(let day=0;day<7;day++){
  assert(plan.days[day].filter(x=>x==='O').length>=rules.minOpen);
  assert(plan.days[day].filter(x=>x==='C').length>=rules.minClose);
 }for(let i=0;i<4;i++){let count=0,run=0,prev=null;for(let day=0;day<7;day++){
  const code=plan.days[day][i],work=code!=='OFF';if(work)count++;run=work?run+1:0;
  assert(run<=rules.maxRun);if((rules.blocked||[]).includes(i+':'+day))assert(!work);
  if(rules.fixed?.[i+':'+day])assert.equal(code,rules.fixed[i+':'+day]);
  const s=catalogue[code];if(s){assert((s.end-s.start-60)/60<=rules.dailyHours);if(prev)assert(1440+s.start-prev.end>=rules.restHours*60);}prev=s;
 }assert(count<=rules.maxDays);assert(count*7.5<=rules.weeklyHours);}
}
const cases=[];
for(const[name,r]of [['normal',rules],['absence',{...rules,blocked:['0:0','0:1']}],['fixed',{...rules,fixed:{'0:0':'O','0:1':'OFF'}}],['30_hours',{...rules,weeklyHours:30}]]){
 const a=simulate(r,false),b=simulate(r,true);verify(a,r);verify(b,r);cases.push({name,baselineFound:a.found,learningFound:b.found});
}
const insufficient=simulate({...rules,minOpen:3,minClose:2},true);assert(!insufficient.found);
assert.equal(assessLearningCandidate({hours:[],cornerClose:[]},{hours:[],cornerClose:['test-day']}).accepted,false);
assert.equal(assessLearningCandidate({hours:[],cornerClose:[]},{hours:[],cornerClose:[]}).accepted,true);
console.log(JSON.stringify({cases,insufficient:'no solution found; no rule relaxation',finalRegressionGate:'passed',observations:selected.records.length},null,2));
