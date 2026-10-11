(()=>{switchPlanningView('monthly');
function gen(y,m,prev){ monthlyRef=new Date(y,m,1); var key=y+'-'+String(m+1).padStart(2,'0')+'-01'; planSnapshot={storeId:currentStoreId,month:key,ok:false,plan:null,prevPlan:prev,history:[]}; renderMonthlyPlanning(); return JSON.parse(JSON.stringify(monthlyResult)); }
var O=gen(2026,9,null), N=gen(2026,10,O), D=gen(2026,11,N);
var all=Object.assign({},O,N,D); var days=Object.keys(all).sort();
function works(r){ return r && !r.special && r.code && r.code!=='OFF' && r.code!=='A'; }
function busy(a,ds){ var r=(all[ds]||{})[a.id]; return works(r) || (r && r.code==='OUT') || agentOnLeave(a.id,ds)==='out'; }
var out={runOver5:[],weekOver5:[],restLt11:0,hoursOver:[],nov:{}};
agents.forEach(a=>{ var run=0,best=0,bestAt='',prevEnd=null,prevDs=null, wk={}, hk={};
  days.forEach(ds=>{ var b=busy(a,ds); var dt=new Date(ds+'T12:00:00'); var mon=new Date(dt); mon.setDate(dt.getDate()-((dt.getDay()+6)%7)); var k=toDateStr(mon);
    if(b){ run++; if(run>best){best=run;bestAt=ds;} wk[k]=(wk[k]||0)+1; } else run=0;
    var r=(all[ds]||{})[a.id]; var wh=works(r)?workHoursOf(a,ds,r):null;
    if(wh){ hk[k]=(hk[k]||0)+Math.max(0,wh.end-wh.start-60); if(prevEnd!=null){ var gap=(new Date(ds)-new Date(prevDs))/864e5===1 ? 1440+wh.start-prevEnd : 9999; if(gap<660) out.restLt11++; } prevEnd=wh.end; prevDs=ds; } else { prevEnd=null; }
  });
  if(best>5) out.runOver5.push(a.first_name+':'+best+'@'+bestAt);
  Object.keys(wk).forEach(k=>{ if(k>='2026-10-05'&&k<='2026-12-21'&&wk[k]>5) out.weekOver5.push(a.first_name+' '+k+':'+wk[k]); });
  Object.keys(hk).forEach(k=>{ if(k>='2026-10-05'&&k<='2026-12-21'&&hk[k]>2250+1e-6) out.hoursOver.push(a.first_name+' '+k+':'+(hk[k]/60)); });
});
// November store / corner rules
var nov=Object.keys(N).sort(), x={noO:[],noC:[],empty:[],cNoO:[],cNoC:[],mgr:{O:0,C:0,M:0}};
nov.forEach(ds=>{ if(getDayClosureType(ds)) return; var hm=dayMinutes(ds), o=0,c=0, cor={};
  agents.forEach(a=>{ var r=N[ds][a.id]; if(!works(r)) return; var wh=workHoursOf(a,ds,r); if(!wh||poolOf(a)==='stock') return; var cv=coverOfHours(wh.start,wh.end,hm); if(cv.open)o++; if(cv.close)c++;
    if(poolOf(a)==='mgmt') x.mgr[r.code==='O'?'O':r.code==='C'?'C':'M']++;
    if(poolOf(a)==='sales'){ var cc=r.corner||(storeCorners.find(q=>q.id===a.home_corner_id)||{}).code; if(!cc) return; cor[cc]=cor[cc]||{o:0,c:0}; if(cv.open)cor[cc].o++; if(cv.close)cor[cc].c++; } });
  if(!o)x.noO.push(ds.slice(8)); if(!c)x.noC.push(ds.slice(8));
  storeCorners.forEach(q=>{ var z=cor[q.code]; if(!z) x.empty.push(ds.slice(8)+q.code); else { if(!z.o) x.cNoO.push(ds.slice(8)+q.code); if(!z.c) x.cNoC.push(ds.slice(8)+q.code);} }); });
out.nov=x; return JSON.stringify(out);})()