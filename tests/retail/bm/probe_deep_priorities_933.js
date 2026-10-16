// Astra: only in an isolated page, after anonymised tests/retail/bm/setup.js.
// Freeze clock at 2026-10-31. Await the returned promise. No database writes.
(async () => {
 if (currentStoreId !== 'bm' || !agents.every(a => a.first_name === 'Agent')) throw new Error('Anonymised fixture only');
 if (toDateStr(new Date()) !== '2026-10-31') throw new Error('Freeze clock at 2026-10-31');
 const saved={agents,agentPrefs,agentLeaves,storeCorners,planningOverrides,cornerOverrides,availability,planSnapshot,calHolidays,calOverrides,regulations,storeSettings,RETAIL_SHIFTS,monthlyRef,monthlyResult,intradayOverrides,addedMissions,currentIntradayDate,savePlanSnapshot,attachCrossHighlight,from:sb.from};
 const out={};
 function reset(){ regulations={...saved.regulations}; storeSettings={...saved.storeSettings};
agents=Array.from({length:14},(_,i)=>({id:'x'+i,first_name:'Agent',last_name:String(i),status:'SA',work_pct:100,home_corner_id:null}));agentPrefs={};agentLeaves=[];storeCorners=[];planningOverrides={};cornerOverrides={};availability={};planSnapshot=null;calHolidays={};calOverrides={};regulations.weekly_hours=37.5;regulations.max_days=5;regulations.max_consecutive_days=5;regulations.public_holidays=[];regulations.closed_dates=[];regulations.day_hours=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(k=>[k,{open:10,close:20}]));regulations.breaks=[{name:'Lunch',duration:60,window_start:12,window_end:15}];RETAIL_SHIFTS={sales:[{code:'O',startMin:570,endMin:1080,tone:'open'},{code:'M',startMin:660,endMin:1170,tone:'mid'},{code:'C',startMin:750,endMin:1260,tone:'close'}],stock:[]};storeSettings={...storeSettings,min_opening:1,min_closing:1,fairness_rotation:false,sunday_single_shift:false,closing_ratio:.5};monthlyRef=new Date(2026,10,1);
 }
 function measure(){return (()=>{const ds='2026-11-01',rs=monthlyResult[ds];const p=agents.filter(a=>rs[a.id]&&!rs[a.id].special&&workHoursOf(a,ds,rs[a.id]));return {present:p.length,late:p.filter(a=>['M','C'].includes(rs[a.id].code)).length,open:p.filter(a=>coverOf(a,ds,rs[a.id]).open).length,close:p.filter(a=>coverOf(a,ds,rs[a.id]).close).length,cells:Object.fromEntries(p.map(a=>[a.id,rs[a.id].code]))};})();}
 try {
 savePlanSnapshot=async()=>{};attachCrossHighlight=()=>{};
 reset();renderMonthlyPlanning();out.manualBaseline=measure();
 const id=Object.keys(out.manualBaseline.cells).find(id=>out.manualBaseline.cells[id]==='O');
 planningOverrides[id]={'2026-11-01':'C'};renderMonthlyPlanning();out.oneManualClosing={...measure(),changedAgent:id};
 reset();agents=agents.slice(0,2).map(a=>({...a,status:'MANAGER'}));agents.forEach(a=>agentPrefs[a.id]={preferred_shift:'C'});renderMonthlyPlanning();out.allManagerPreferredClose=measure();
 reset();intradayOverrides={};addedMissions={};renderMonthlyPlanning();currentIntradayDate='2026-11-01';renderIntraday(currentIntradayDate);
 const aid=intradayExport.rows.find(r=>r.endH>=17&&r.blocks.some(b=>b.type==='lun')).agentId;
 intradayOverrides[aid+':lun']=915;renderIntraday(currentIntradayDate);
 out.readFailure={before:{keys:Object.keys(intradayOverrides).length,lunch:intradayExport.rows.find(r=>r.agentId===aid).blocks.find(b=>b.type==='lun')}};
 sb.from=function(){const q={};['select','eq'].forEach(k=>q[k]=()=>q);q.then=(ok,err)=>Promise.resolve({data:null,error:{message:'synthetic read failure'}}).then(ok,err);return q;};
 await loadAndRenderIntraday(currentIntradayDate);
 out.readFailure.after={keys:Object.keys(intradayOverrides).length,lunch:intradayExport.rows.find(r=>r.agentId===aid).blocks.find(b=>b.type==='lun')};
 return JSON.stringify(out);
 } finally {
 agents=saved.agents;agentPrefs=saved.agentPrefs;agentLeaves=saved.agentLeaves;storeCorners=saved.storeCorners;planningOverrides=saved.planningOverrides;cornerOverrides=saved.cornerOverrides;availability=saved.availability;planSnapshot=saved.planSnapshot;calHolidays=saved.calHolidays;calOverrides=saved.calOverrides;regulations=saved.regulations;storeSettings=saved.storeSettings;RETAIL_SHIFTS=saved.RETAIL_SHIFTS;monthlyRef=saved.monthlyRef;monthlyResult=saved.monthlyResult;intradayOverrides=saved.intradayOverrides;addedMissions=saved.addedMissions;currentIntradayDate=saved.currentIntradayDate;savePlanSnapshot=saved.savePlanSnapshot;attachCrossHighlight=saved.attachCrossHighlight;sb.from=saved.from;
 }
})()
