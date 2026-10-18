// Claude 2026-10-18, Retail 9.4.0.5: days off set by the manager must not cost working days.
// Case: November, every full-time seller without leave gets two manual OFF each week (the same two days every week, different for each person; a pattern that moves would make runs above 5 days, a legal limit).
// Expected: 5 working days in every full Monday-to-Sunday week (the manual OFF are the 2 days off). 9.4.0.4: fewer.
// Usage: node manual-off-9405.cjs   (exit 1 when a week has fewer than 5 days in 9.4.0.5)
const vm=require('vm'),fs=require('fs');const {context}=require('./runner.cjs');
const probe=`(()=>{const weeks=['2026-11-02','2026-11-09','2026-11-16','2026-11-23'];
 const ok=agents.filter(a=>poolOf(a)==='sales'&&a.status!=='PART_TIME'&&!(agentPrefs[a.id]||{}).fixed_schedule&&!agentLeaves.some(l=>l.agent_id===a.id)&&!Object.keys(availability[a.id]||{}).length);
 ok.forEach((a,i)=>{planningOverrides[a.id]=planningOverrides[a.id]||{};weeks.forEach((wk,w)=>{const k=i%5;for(const j of [k,k+1]){const x=new Date(wk+'T12:00:00');x.setDate(x.getDate()+j);planningOverrides[a.id][toDateStr(x)]='OFF';}});});
 const r=pickMonthlyPlan(),dist={};let short=0;
 ok.forEach(a=>weeks.forEach(wk=>{let w=0;for(let i=0;i<7;i++){const x=new Date(wk+'T12:00:00');x.setDate(x.getDate()+i);const c=r.cells[toDateStr(x)][a.id];if(c&&!c.special)w++;}dist[w]=(dist[w]||0)+1;if(w<5)short++;}));
 return JSON.stringify({people:ok.length,weekDays:dist,short,mandatory:r.diagnostics.mandatoryIssues.length});})()`;
const out={};
const BUILD=process.argv[2]||'CAST_v9_5_0_2_RETAIL_TEST.html';
for(const f of [BUILD]){const c=context(f,'bm');out[f]=JSON.parse(vm.runInContext(probe,c,{timeout:180000}));console.log(f,JSON.stringify(out[f]));}
fs.writeFileSync(__dirname+'/manual-off-results.json',JSON.stringify(out,null,2));
if(out[BUILD].short>0||out[BUILD].mandatory>0)process.exit(1);
