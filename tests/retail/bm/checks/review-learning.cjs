// Learning of the evening share, groups with ties, reviewed copy and its check, bell (10.0.0.4; Astra 10.0.0.3 audit).
// Synthetic data, no network. Usage: node review-learning.cjs [build]. Exit 1 on failure.
const {context}=require('./runner.cjs');const vm=require('vm');const file=process.argv[2]||'CAST_RETAIL_TEST.html';
const run=(c,s)=>vm.runInContext(s,c,{timeout:180000});
function fresh(){const c=context(file);run(c,`Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-19T12:00:00']));}};monthlyRef=new Date(2026,10,1);`);return c;}
function rows(c,R){c.R=R;run(c,`window.calls=0;sb.from=function(t){var rs=R.slice(),q={};['select','eq','order'].forEach(k=>q[k]=()=>q);q.lt=(k,v)=>{rs=rs.filter(r=>r[k]<v);return q;};q.range=(a,b)=>{rs=rs.slice(a,b+1);return q;};q.then=ok=>{window.calls++;return Promise.resolve({data:rs,error:null}).then(ok);};return q;};eveningLearned=null;`);}
const ev=(e,n)=>({evening:e,sellers:n,grouping:'median-1'});
const row=(m,rev,st,e,n)=>({month:m,revision:rev,status:st,decision_diagnostics:e==null?null:{evening:ev(e,n)}});
(async()=>{const out=[];let c;
 c=fresh();rows(c,[row('2026-12',1,'validated',26,26)]);await run(c,'loadEveningShare()');out.push(['December validated, November planned: 50%',run(c,'storeEveningShare()')===0.5]);
 c=fresh();rows(c,[row('2026-11',1,'validated',200,200)]);await run(c,'loadEveningShare()');out.push(['the month itself validated: not learned',run(c,'storeEveningShare()')===0.5]);
 c=fresh();rows(c,[]);await run(c,'loadEveningShare()');out.push(['no history: 50%',run(c,'storeEveningShare()')===0.5]);
 c=fresh();rows(c,[row('2026-10',3,'validated',60,100),row('2026-10',2,'validated',10,100),row('2026-10',1,'validated',10,100),row('2026-09',1,'validated',40,100)]);await run(c,'loadEveningShare()');
 out.push(['October with 3 revisions + September: last revision of each month, both months',JSON.stringify(run(c,'JSON.stringify(eveningLearned.months)'))===JSON.stringify(JSON.stringify(['2026-10','2026-09']))&&Math.abs(run(c,'storeEveningShare()')-(150+100)/(300+200))<1e-9]);
 c=fresh();rows(c,[row('2026-10',2,'cancelled',null),row('2026-10',1,'validated',90,100)]);await run(c,'loadEveningShare()');out.push(['last October sending cancelled: October not learned',run(c,'storeEveningShare()')===0.5]);
 c=fresh();const R=[];for(let m=1;m<=8;m++)R.push(row('2026-'+String(m).padStart(2,'0'),1,'validated',100,100));rows(c,R);await run(c,'loadEveningShare()');out.push(['8 validated months: the 6 last only',run(c,'eveningLearned.months.join()')==='2026-08,2026-07,2026-06,2026-05,2026-04,2026-03'&&Math.abs(run(c,'storeEveningShare()')-(150+600)/(300+600))<1e-9]);
 c=fresh();rows(c,[row('2026-10',1,'validated',100,100)]);await run(c,'loadEveningShare()');const a=run(c,'storeEveningShare()');run(c,'monthlyRef=new Date(2026,9,1)');await run(c,'loadEveningShare()');out.push(['same store, October planned: reloaded, October not learned for itself',a>0.5&&run(c,'storeEveningShare()')===0.5&&run(c,'window.calls')===2]);
 c=fresh();rows(c,[row('2026-10',1,'validated',100,100)]);await run(c,'loadEveningShare()');run(c,`agents=agents.filter(a=>poolOf(a)!=='sales');`);out.push(['a store whose sellers left: the count of the month stays (made when validated)',run(c,'storeEveningShare()')>0.5]);
 c=fresh();run(c,`var ctx=buildMonthlyContext(),p=pickMonthlyPlan(ctx),e=eveningCount(p.cells,ctx.inputs);agents=agents.slice(0,3);RETAIL_SHIFTS.sales=RETAIL_SHIFTS.sales.slice(0,1);var e2=eveningCount(p.cells,ctx.inputs);`);out.push(['the count of a validation uses its own team and shifts',run(c,'e.sellers>0&&e.evening===e2.evening&&e.sellers===e2.sellers&&agents.length===3')]);

 // groups: ties and one shift (Roman 19-10)
 c=fresh();const G=x=>JSON.stringify(run(c,`shiftGroups(${JSON.stringify(x)})`));
 out.push(['O/M/C stays O/M/C',G([{code:'O',startMin:570,endMin:1080},{code:'M',startMin:630,endMin:1140},{code:'C',startMin:675,endMin:1185}])==='{"O":"am","M":"mid","C":"pm"}']);
 out.push(['all end together: the last to arrive is evening',G([{code:'O',startMin:540,endMin:1200},{code:'M',startMin:600,endMin:1200},{code:'C',startMin:660,endMin:1200}])==='{"O":"am","M":"mid","C":"pm"}']);
 out.push(['all start together: the first to leave is morning',G([{code:'A',startMin:540,endMin:1080},{code:'B',startMin:540,endMin:1140},{code:'C',startMin:540,endMin:1200}])==='{"A":"am","B":"mid","C":"pm"}']);
 out.push(['one shift: no groups',G([{code:'X',startMin:540,endMin:1200}])==='{"X":"mid"}']);
 c=fresh();run(c,`agents=agents.filter(a=>['a00','a09','a12','a13','a14'].includes(a.id));agentLeaves=[];agentPrefs={};storeCorners=storeCorners.slice(0,1);RETAIL_SHIFTS.sales=[{code:'O',startMin:540,endMin:1200,tone:'open'},{code:'M',startMin:600,endMin:1200,tone:'mid'},{code:'C',startMin:660,endMin:1200,tone:'close'}];regulations.weekly_hours=60;regulations.max_daily_hours=12;var p=pickMonthlyPlan();`);
 out.push(['tied catalogue: the evening share is met, no false gap',run(c,'p.diagnostics.late.actual===p.diagnostics.late.target&&p.diagnostics.late.target>0&&!p.diagnostics.mandatoryIssues.length')]);
 // reviewed copy: an old corner set by hand is not a reviewer change
 c=fresh();run(c,`monthlyResult={'2026-11-19':{a09:{code:'C'}}};planningOverrides={};cornerOverrides={a09:{'2026-11-19':'c_lg'}};agentLeaves=[];var sent={'2026-11-19':{a09:{code:'O'}}};var ctxIn={planningOverrides:{},cornerOverrides:{a09:{'2026-11-19':'c_lg'}},agentLeaves:[]};var rc=reviewedCopy({submitted_plan:sent,context:{inputs:ctxIn}});`);
 out.push(['a corner set before the sending does not make a recalculated cell a reviewer change',run(c,`rc.cells['2026-11-19'].a09.code==='O'&&!Object.keys(rc.edits).length`)]);
 run(c,`planningOverrides={a09:{'2026-11-19':'C'}};rc=reviewedCopy({submitted_plan:sent,context:{inputs:ctxIn}});`);
 out.push(['a shift set by hand during the review is the reviewer change',run(c,`rc.cells['2026-11-19'].a09.code==='C'&&rc.edits['2026-11-19|a09']===true`)]);
 // the decision is checked with the inputs it was sent with, today's check kept apart
 c=fresh();run(c,`me={id:'t',role:'admin'};var sentCtx=buildMonthlyContext(),sp=pickMonthlyPlan(sentCtx);monthlyResult=JSON.parse(JSON.stringify(sp.cells));monthReview={id:'r',store_id:currentStoreId,month:shownMonthKey(),revision:1,status:'pending',submitted_plan:JSON.parse(JSON.stringify(sp.cells)),context:JSON.parse(JSON.stringify({inputs:sentCtx.inputs,today:sentCtx.today}))};agents.forEach(a=>{a.weekly_hours=1;a.weekly_hours_history=[]});lastSnapSave=null;reviewStep=async(n,args)=>{window.dec=args;return true;};`);
 await run(c,`decideReview('validated','')`);
 out.push(['decision check uses the sent inputs (today kept apart), with the evening count',run(c,`window.dec.p_diagnostics.context==='sent'&&window.dec.p_diagnostics.mandatory===validatePlan(monthReview.submitted_plan,{inputs:monthReview.context.inputs,today:monthReview.context.today}).mandatory.length&&window.dec.p_diagnostics.mandatoryToday>window.dec.p_diagnostics.mandatory&&window.dec.p_diagnostics.evening.sellers>0`)]);
 // bell: the unread after the first 50 still light it
 c=fresh();run(c,`me={id:'d',role:'director'};reviewSeen={};sb.from=function(table){let head=false,lim=null;const q={};q.select=(cols,o)=>{head=!!(o&&o.head);return q;};['eq','order','in','gte'].forEach(k=>q[k]=()=>q);q.range=(a,b)=>{lim=b+1;return q;};q.then=ok=>Promise.resolve(table==='retail_plan_reviews'?head?{count:60,data:null,error:null}:{data:Array.from({length:Math.min(60,lim||60)},(_,i)=>({id:'r'+i,store_id:'bm',status:'pending'})),error:null}:{data:table==='retail_review_seen'?Array.from({length:50},(_,i)=>({review_id:'r'+i})):[],error:null}).then(ok);return q;};`);
 await run(c,'refreshReviewCounts()');
 out.push(['60 waiting, the first 50 read: the 10 others light the bell',run(c,`bellItems.length===10&&document.getElementById('bell-count').hidden===false`)]);
 console.log(out.map(x=>(x[1]?'OK  ':'FAIL')+' '+x[0]).join('\n'));process.exitCode=out.every(x=>x[1])?0:1;})();
