// Run after the anonymised setup.js in an ISOLATED candidate page.
// Freeze its clock at 2026-10-31 before loading the candidate. No database writes.
(() => {
  if (currentStoreId !== 'bm' || !agents.every(a => a.first_name === 'Agent'))
    throw new Error('Use only the anonymised fixture, never production');
  if (toDateStr(new Date()) !== '2026-10-31')
    throw new Error('Freeze the isolated page clock at 2026-10-31');
  const saved = { agents, agentPrefs, agentLeaves, storeCorners, planningOverrides,
    cornerOverrides, availability, planSnapshot, regulations, storeSettings,
    RETAIL_SHIFTS, calHolidays, calOverrides, monthlyRef, monthlyResult,
    savePlanSnapshot, attachCrossHighlight };
  const results = [];
  try {
    savePlanSnapshot = async () => {}; attachCrossHighlight = () => {};
    for (const n of [3, 5, 17, 30]) for (const ratio of [0, 0.5, 1]) {
      agents = Array.from({ length:14 }, (_,i) => ({ id:'matrix'+i, first_name:'Agent',
        last_name:String(i), status:'SA', work_pct:100, home_corner_id:null }));
      agentPrefs = {}; agentLeaves = []; storeCorners = []; planningOverrides = {};
      cornerOverrides = {}; availability = {}; planSnapshot = null;
      regulations = { ...saved.regulations, weekly_hours:37.5, max_days:5,
        max_consecutive_days:5, public_holidays:[], closed_dates:[],
        breaks:[{name:'Lunch',duration:60,window_start:12,window_end:15}],
        day_hours:Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun']
          .map(k => [k,{open:10,close:20}])) };
      calHolidays = {}; calOverrides = {};
      RETAIL_SHIFTS = { sales:Array.from({length:n}, (_,i) => ({ code:'S'+i,
        startMin:570+Math.round(i*180/(n-1)), endMin:1080+Math.round(i*180/(n-1)),
        tone:'mid', label:'S'+i })), stock:[] };
      storeSettings = { ...saved.storeSettings, min_opening:1, min_closing:1,
        fairness_rotation:false, sunday_single_shift:false, closing_ratio:ratio };
      monthlyRef = new Date(2026,10,1); renderMonthlyPlanning();
      const days = Object.entries(monthlyResult).filter(([ds]) => ds.startsWith('2026-11'))
        .map(([ds,rs]) => {
          const people = agents.map(a => ({a,r:rs[a.id]}))
            .filter(({a,r}) => r && !r.special && workHoursOf(a,ds,r));
          return { day:ds, present:people.length, target:Math.round(people.length*ratio),
            lateQuarter:people.filter(({r}) => Number(r.code.slice(1)) >= n-Math.ceil(n/4)).length,
            lateCurrent:people.filter(({r}) => Number(r.code.slice(1)) >= Math.floor(n/2)).length,
            opening:people.filter(({a,r}) => coverOf(a,ds,r).open).length,
            closing:people.filter(({a,r}) => coverOf(a,ds,r).close).length };
        });
      results.push({catalogue:n,ratio,days,summary:{days:days.length,
        exactCurrent:days.filter(d => d.lateCurrent===d.target).length,
        exactQuarter:days.filter(d => d.lateQuarter===d.target).length,
        missingOpen:days.filter(d => !d.opening).length,
        missingClose:days.filter(d => !d.closing).length}});
    }
    return JSON.stringify(results);
  } finally {
    agents=saved.agents; agentPrefs=saved.agentPrefs; agentLeaves=saved.agentLeaves;
    storeCorners=saved.storeCorners; planningOverrides=saved.planningOverrides;
    cornerOverrides=saved.cornerOverrides; availability=saved.availability;
    planSnapshot=saved.planSnapshot; regulations=saved.regulations;
    storeSettings=saved.storeSettings; RETAIL_SHIFTS=saved.RETAIL_SHIFTS;
    calHolidays=saved.calHolidays; calOverrides=saved.calOverrides;
    monthlyRef=saved.monthlyRef; monthlyResult=saved.monthlyResult;
    savePlanSnapshot=saved.savePlanSnapshot; attachCrossHighlight=saved.attachCrossHighlight;
  }
})()
