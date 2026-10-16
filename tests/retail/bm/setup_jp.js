// Synthetic Japan-style store for the shift ventilation bench (no real names). Run after the page loads, like setup.js.
// window.JP = 'shibuya' (7 sales shifts from 9:00, store 11-21, real hourly curve shape) or 'osaka' (19 shifts, flat curve).
(function(){
var V = window.JP || 'shibuya';
currentStoreId='jp'; currentStoreName='Store J';
var g=document.getElementById('store-gate'); if(g){g.style.display='none';g.classList.remove('show');} document.body.classList.remove('gate-open');
var ld=document.getElementById('loader'); if(ld) ld.style.display='none';
function sh(code,a,b){ return {code:code,startMin:a,endMin:b,tone:'mid',label:code}; }
var dh={}, oh = V === 'osaka' ? {open:11,close:20} : {open:11,close:21};
['mon','tue','wed','thu','fri','sat','sun'].forEach(k=>dh[k]=Object.assign({},oh));
regulations.day_hours=dh; regulations.saturday_rest=false; regulations.sunday_rest=false; regulations.max_days=5; regulations.public_holidays=[]; regulations.closed_dates=[];
if (V === 'osaka') {
  regulations.weekly_hours=40; regulations.max_daily_hours=8.5; regulations.rest_gap_hours=11;
  regulations.breaks=[{name:'Lunch',duration:60,window_start:12,window_end:15},{name:'Break',duration:30,window_start:17,window_end:19.5}];
  var list=[['08C',510,1020],['09A',540,1050],['09B',555,1065],['09C',570,1080],['09D',585,1095],['10A',600,1110],['10B',615,1110],['10C',630,1140],['10D',645,1155],
    ['11A',660,1170],['11B',675,1185],['11C',690,1200],['EX',690,1200],['11D',705,1215],['12A',720,1230],['12B',735,1215],['12C',750,1260],['12D',765,1275],['VM',900,1380]];
  RETAIL_SHIFTS={sales:list.map(x=>sh(x[0],x[1],x[2])),stock:[sh('C08',510,1020),sh('C10',630,1140),sh('B12',735,1245)]};
  storeSettings={closing_ratio:0,min_opening:0,min_closing:0,sunday_single_shift:false,fairness_rotation:false,intraday_reinforcement:false,hourly_curve:[9.1,9.1,9.1,9.1,9.1,9.1,9.1,9.1,9.1,9.1,9.1]};
} else {
  regulations.weekly_hours=45; regulations.max_daily_hours=9; regulations.rest_gap_hours=8;
  regulations.breaks=[{name:'Lunch',duration:60,window_start:12,window_end:15},{name:'Break',duration:30,window_start:15,window_end:18}];
  RETAIL_SHIFTS={sales:[sh('09A',540,1050),sh('09C',570,1080),sh('10A',590,1100),sh('10C',620,1130),sh('11A',650,1160),sh('11C',690,1200),sh('12D',765,1275)],
    stock:[sh('A10',590,1100),sh('C10',620,1130),sh('D12',765,1275)]};
  storeSettings={closing_ratio:0.5,min_opening:1,min_closing:1,sunday_single_shift:false,fairness_rotation:false,intraday_reinforcement:false,hourly_curve:[7.1,7.1,10.5,7.1,11.8,12.8,11.7,9.7,8.2,7.1,7.1]};
}
storeCorners=[]; cornerTrafficMonthly={};
var n = V === 'osaka' ? 20 : 7;
agents=[{id:'j00',first_name:'Agent',last_name:'01',status:'SM',work_pct:100,home_corner_id:null},{id:'j01',first_name:'Agent',last_name:'02',status:'MANAGER',work_pct:100,home_corner_id:null}];
for (var i=0;i<n;i++) agents.push({id:'j'+String(i+2).padStart(2,'0'),first_name:'Agent',last_name:String(i+3).padStart(2,'0'),status:'SA',work_pct:100,home_corner_id:null});
agentLeaves=[]; agentPrefs={};
var w=[1.25,0.9,0.85,0.9,0.95,1.05,1.4]; trafficDaily={}; trafficMonthly={};
for(var dd=1; dd<=31; dd++){ ['2026-10-','2026-11-','2026-12-'].forEach(p=>{ if(dd>30&&p==='2026-11-')return; var ds=p+String(dd).padStart(2,'0'); trafficDaily[ds]={date:ds,traffic:Math.round(1000*w[new Date(ds+'T12:00:00').getDay()]),is_manual:false}; }); }
calHolidays={}; calOverrides={};
planningOverrides={}; cornerOverrides={}; availability={}; manualMode=false; monthlyRef=new Date(2026,10,1);
planSnapshot=null;
})();
