/* ============================================================
   ROMAN — Planning Manager • app.js (Full, no-auth)
   Modules inclus :
   - Seed (regions, forecast, tasks, rules)
   - Attendance (mois)
   - Agents (+ Skills + PTO)
   - Weekly Planner (slots 30')
   - Forecast (édition simple mensuelle)
   - Regulation (CRUD simple)
   - Tasks (CRUD simple)
   ============================================================ */

/* ---------- Supabase ---------- */
if (!window.CONFIG?.SUPABASE_URL || !window.CONFIG?.SUPABASE_ANON_KEY) {
  console.error("CONFIG manquant. Vérifie config.js");
}
const supabase = window.supabase.createClient(
  window.CONFIG.SUPABASE_URL,
  window.CONFIG.SUPABASE_ANON_KEY
);

/* ============================================================
   CONSTANTES (datasets fournis)
   ============================================================ */

const REGIONS = [
  { code:'EMEA', name:'Europe' },
  { code:'US',   name:'Americas' },
  { code:'CN',   name:'Greater China' },
  { code:'JP',   name:'Japan' },
  { code:'KR',   name:'South Korea' },
  { code:'SEAO', name:'Southeast Asia' }
];

const ANNUAL_VOLUME = { EMEA:90000, US:49713, CN:119038, JP:39269, KR:39269, SEAO:25650 };

const MONTHLY_PCT = {
  EMEA:[15.5902,13.2854,14.3268,17.0276,18.3134,18.1632,19.0273,11.9390,10.4328,9.8898,9.6326,14.8091],
  US:  [15.1484,13.1399,13.5878,13.3299,14.9550,14.6565,13.5505,11.8134,10.1679,10.4258,10.4563,14.2935],
  CN:  [10.6086,9.2957,10.4484,10.2299,10.8998,8.6653,9.6515,9.9511,8.2867,8.2492,8.7028,9.1896],
  JP:  [ 9.9188,8.4888,10.9319, 9.4433, 9.0484,8.9533,9.5421,8.2730,8.5253,9.0264,10.8149,17.1458],
  KR:  [10.1018,10.2998,11.3065,12.5383,11.8464,9.6622,9.7409,8.5090,8.7288,8.5633,7.4345,8.0857],
  SEAO:[10.3540, 9.1215, 8.4910, 9.4941, 9.4368,7.9392,10.0315,9.5013,9.4296,9.3437,10.0172,13.7647],
};

const WEEKLY_PCT = {
  EMEA:[2.34,2.09,2.02,2.00,1.85,2.01,2.02,1.63,1.42,1.90,2.04,2.02,1.97,2.02,2.36,2.40,2.34,2.25,2.17,2.43,2.52,2.37,2.54,2.66,2.59,2.56,2.69,2.67,2.62,2.11,1.94,1.63,1.49,1.58,1.50,1.42,1.46,1.53,1.39,1.32,1.41,1.15,1.19,1.01,1.34,1.35,1.37,1.36,1.65,2.10,2.39,1.80],
  US:  [2.26,2.08,2.24,2.34,1.99,2.33,1.86,1.69,1.97,2.16,2.10,2.00,2.02,1.95,2.06,1.99,1.95,2.03,2.19,2.42,2.11,1.85,2.15,2.46,2.47,2.25,1.85,1.94,1.98,2.03,1.84,1.85,1.64,1.82,1.62,1.51,1.77,1.50,1.47,1.54,1.22,1.46,1.61,1.44,1.44,1.36,1.56,2.02,1.90,2.08,2.78,1.86],
  CN:  [2.00,1.95,2.27,2.12,2.32,1.98,1.92,1.85,1.85,1.93,2.12,2.13,2.24,1.99,2.27,2.05,2.10,1.81,2.06,2.84,2.19,1.77,1.93,1.73,1.79,1.76,1.53,1.72,2.15,2.06,2.20,2.65,1.81,1.76,1.53,1.75,1.74,1.69,1.75,1.41,1.59,1.68,1.65,1.86,1.72,1.93,1.75,1.74,1.56,1.88,2.12,1.82],
  JP:  [2.24,2.01,1.93,1.75,1.54,1.68,1.74,1.73,1.44,2.37,2.22,2.10,1.88,1.80,1.99,1.85,1.77,1.59,1.59,1.93,1.81,1.41,1.88,1.86,1.76,1.61,1.76,1.86,1.85,1.90,1.71,1.67,1.48,1.52,1.61,1.75,1.61,1.75,1.74,1.66,1.61,1.74,1.69,1.46,1.95,2.31,1.96,2.67,3.03,3.20,3.34,3.68],
  KR:  [1.99,1.99,1.92,1.81,1.98,1.77,2.07,1.88,2.04,2.51,2.48,2.28,2.41,2.44,2.38,2.66,2.39,2.12,2.03,1.97,2.69,2.50,1.97,2.28,2.09,1.96,1.79,1.82,1.92,1.81,1.74,1.72,1.51,1.80,1.74,1.93,1.92,1.15,2.15,1.55,1.70,1.69,1.54,1.35,1.68,1.67,1.48,1.33,1.47,1.44,1.80,1.69],
  SEAO:[1.55,2.41,2.26,1.84,1.94,1.87,2.06,1.82,1.77,1.88,1.94,1.66,1.35,1.68,1.69,1.59,2.51,2.14,1.91,1.60,1.87,1.60,2.05,1.57,1.54,1.55,1.86,1.49,2.18,1.95,1.79,1.06,1.30,3.14,2.06,1.85,1.87,1.83,1.95,1.82,1.61,1.79,1.86,1.84,1.86,1.88,2.24,2.18,2.70,2.87,3.48,1.90],
};

const DAILY_PCT = {
  EMEA:[18,17,18,16,16,10,4],
  US:  [18,19,17,17,16, 9,4],
  CN:  [15,15,14,15,15,13,13],
  JP:  [15,15,14,15,15,13,13],
  KR:  [18,15,15,16,16,11,10],
  SEAO:[18,15,15,14,15,13,10],
};

const HOURLY_PCT = {
  EMEA:{
    "08:00":0.00,"08:30":0.00,"09:00":0.00,"09:30":0.00,"10:00":0.00,"10:30":0.00,
    "11:00":0.10,"11:30":0.10,"12:00":1.00,"12:30":3.70,"13:00":14.70,"13:30":12.50,
    "14:00":10.40,"14:30":10.30,"15:00":9.80,"15:30":9.90,"16:00":9.40,"16:30":8.20,
    "17:00":6.50,"17:30":2.50,"18:00":0.40,"18:30":0.20,"19:00":0.10,"19:30":0.10,
    "20:00":0.00,"20:30":0.00,"21:00":0.00
  },
  US:{
    "08:00":0.20,"08:30":0.10,"09:00":0.10,"09:30":0.10,"10:00":0.10,"10:30":0.20,
    "11:00":0.20,"11:30":0.50,"12:00":1.60,"12:30":5.60,"13:00":8.40,"13:30":10.80,
    "14:00":10.30,"14:30":10.00,"15:00":9.90,"15:30":9.20,"16:00":8.50,"16:30":8.30,
    "17:00":6.00,"17:30":4.70,"18:00":2.80,"18:30":1.30,"19:00":0.70,"19:30":0.40,
    "20:00":0.00,"20:30":0.00,"21:00":0.00
  },
  CN:{
    "08:00":0.10,"08:30":0.10,"09:00":0.00,"09:30":0.00,"10:00":0.10,"10:30":0.00,
    "11:00":0.00,"11:30":0.10,"12:00":0.40,"12:30":2.10,"13:00":10.50,"13:30":10.70,
    "14:00":10.10,"14:30":9.50,"15:00":9.40,"15:30":9.20,"16:00":10.00,"16:30":9.10,
    "17:00":8.70,"17:30":7.10,"18:00":1.60,"18:30":0.50,"19:00":0.30,"19:30":0.20,
    "20:00":0.00,"20:30":0.00,"21:00":0.00
  },
  JP:{}, KR:{},
  SEAO:{
    "08:00":0.00,"08:30":0.00,"09:00":0.00,"09:30":0.00,"10:00":0.00,"10:30":0.10,
    "11:00":1.10,"11:30":4.00,"12:00":8.00,"12:30":6.50,"13:00":7.50,"13:30":10.90,
    "14:00":10.70,"14:30":9.70,"15:00":9.80,"15:30":7.50,"16:00":6.60,"16:30":4.80,
    "17:00":4.00,"17:30":4.10,"18:00":2.50,"18:30":1.60,"19:00":0.50,"19:30":0.00,
    "20:00":0.00,"20:30":0.00,"21:00":0.00
  }
};

const TASK_MIX = {
  EMEA:{ Call:30, Mail:28, Chat:0,  Clienteling:4,  "Back Office":36, Fraud:2 },
  US:  { Call:29, Mail:28, Chat:1,  Clienteling:4,  "Back Office":36, Fraud:2 },
  CN:  { Call:4,  Mail:4,  Chat:34, Clienteling:20, "Back Office":36, Fraud:2 },
  JP:  { Call:30, Mail:28, Chat:0,  Clienteling:4,  "Back Office":36, Fraud:2 },
  KR:  { Call:34, Mail:28, Chat:0,  Clienteling:0,  "Back Office":36, Fraud:2 },
  SEAO:{ Call:30, Mail:28, Chat:0,  Clienteling:4,  "Back Office":36, Fraud:2 },
};

const TASK_META = [
  { name:'Call',          priority:'P1', aht:7,  color:'#A80716', enabled:true },
  { name:'Mail',          priority:'P2', aht:8,  color:'#D94157', enabled:true },
  { name:'Chat',          priority:'P1', aht:3,  color:'#FACD53', enabled:true },
  { name:'Clienteling',   priority:'P3', aht:15, color:'#F18A0A', enabled:true },
  { name:'Back Office',   priority:'P2', aht:15, color:'#E56B7F', enabled:true },
  { name:'Fraud',         priority:'P1', aht:10, color:'#DB5404', enabled:true },
  { name:'Lunch Break',   priority:'Mandatory', aht:60, color:'#FFFFFF', enabled:true },
  { name:'Break',         priority:'Mandatory', aht:15, color:'#FFFFFF', enabled:true },
  { name:'Morning Brief', priority:'P3', aht:15, color:'#FFB88C', enabled:true },
  { name:'Training',      priority:'P3', aht:1,  color:'#FFD074', enabled:true },
];

const DEFAULT_RULES = [
  ['Maximum Days worked per week','5','max 5j/sem'],
  ['Max Hours per Day','8','FR std'],
  ['Max Hours per Week','37.5','Contrat std'],
  ['Amount of Lunch break per day','1','nb = 1'],
  ['Duration of lunch time (in hour) can\'t be split','1','durée 1h'],
  ['Number of break (other than lunch break)','2','max 2/j'],
  ['Duration of other breaks per day (in Min)','15','<=15m'],
  ['Maximum start hour of Lunch Break','12:00','not before'],
  ['Maximum End Hour of Lunch Break','15:00','not after'],
  ['Min Rest Between Shifts','11','>=11h'],
  ['Saturday Work','0','1=Yes,0=No'],
  ['Sunday Work','0','1=Yes,0=No'],
  ['Client facing opening hour is','10:00','no call before'],
  ['Client facing closing hour is','18:00','no call after'],
  ['Training only when closed','1','1=Yes'],
  ['Minimum arrival hour','09:00','>=09:00'],
  ['Maximum departure hour','21:00','<=21:00'],
  ['Can work outside client hours','1','1=Yes (no calls)'],
];

/* ============================================================
   SEED (idempotent)
   ============================================================ */
async function tableEmpty(table) {
  const { count, error } = await supabase.from(table).select('*', { count:'exact', head:true });
  if (error) return true;
  return (count||0) === 0;
}
async function ensureRegions() {
  if (await tableEmpty('regions')) {
    await supabase.from('regions').upsert(REGIONS, { ignoreDuplicates:true });
  }
}
async function seedForecast() {
  if (await tableEmpty('forecast_totals')) {
    const rows = Object.entries(ANNUAL_VOLUME).map(([region,total_volume])=>({ region, total_volume }));
    await supabase.from('forecast_totals').upsert(rows, { ignoreDuplicates:true });
  }
  if (await tableEmpty('forecast_monthly')) {
    const rows=[];
    for (const [reg, arr] of Object.entries(MONTHLY_PCT)) {
      arr.forEach((pct,i)=>rows.push({ region:reg, month_index:i+1, share_percent:pct, email_pct:0, call_pct:0, chat_pct:0, clienteling_pct:0, fraud_pct:0, admin_pct:0 }));
    }
    await supabase.from('forecast_monthly').upsert(rows, { ignoreDuplicates:true });
  }
  if (await tableEmpty('forecast_weekly')) {
    const rows=[];
    for (const [reg, arr] of Object.entries(WEEKLY_PCT)) {
      arr.forEach((pct,i)=>rows.push({ region:reg, week_index:i+1, share_percent:pct, email_pct:0, call_pct:0, chat_pct:0, clienteling_pct:0, fraud_pct:0, admin_pct:0 }));
    }
    await supabase.from('forecast_weekly').upsert(rows, { ignoreDuplicates:true });
  }
  if (await tableEmpty('forecast_daily')) {
    const rows=[];
    for (const reg of Object.keys(ANNUAL_VOLUME)) {
      const dayP = DAILY_PCT[reg] || DAILY_PCT['EMEA'];
      const mix = TASK_MIX[reg] || TASK_MIX['EMEA'];
      for (let wd=1; wd<=7; wd++){
        rows.push({
          region:reg, weekday:wd,
          share_percent: dayP[wd-1]??0,
          email_pct:mix['Mail']??0, call_pct:mix['Call']??0, chat_pct:mix['Chat']??0,
          clienteling_pct:mix['Clienteling']??0, fraud_pct:mix['Fraud']??0, admin_pct:mix['Back Office']??0
        });
      }
    }
    await supabase.from('forecast_daily').upsert(rows, { ignoreDuplicates:true });
  }
  if (await tableEmpty('forecast_hourly')) {
    const rows=[];
    const slots=["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00"];
    for (const reg of Object.keys(ANNUAL_VOLUME)) {
      const map = (HOURLY_PCT[reg] && Object.keys(HOURLY_PCT[reg]).length)? HOURLY_PCT[reg] : HOURLY_PCT['EMEA'];
      slots.forEach(h=> rows.push({ region:reg, hhmm:h, share_percent:map[h]??0, email_pct:0, call_pct:0, chat_pct:0, clienteling_pct:0, fraud_pct:0, admin_pct:0 }));
    }
    await supabase.from('forecast_hourly').upsert(rows, { ignoreDuplicates:true });
  }
}
async function seedTasksAndRules() {
  if (await tableEmpty('tasks')) {
    const rows=[];
    for (const reg of Object.keys(ANNUAL_VOLUME)) {
      TASK_META.forEach(t=> rows.push({ region:reg, name:t.name, color_hex:t.color, priority:t.priority, avg_handle_time_min:t.aht, enabled:t.enabled }));
    }
    await supabase.from('tasks').upsert(rows, { ignoreDuplicates:true });
  }
  if (await tableEmpty('regulation_rules')) {
    const rows=[];
    for (const reg of Object.keys(ANNUAL_VOLUME)) {
      DEFAULT_RULES.forEach(([k,v,notes])=> rows.push({ region:reg, rule_key:k, value_text:v, notes, enabled:true }));
    }
    await supabase.from('regulation_rules').upsert(rows, { ignoreDuplicates:true });
  }
}
async function seedIfEmpty() {
  try {
    await ensureRegions();
    await seedForecast();
    await seedTasksAndRules();
  } catch (e) {
    console.warn('Seed soft error:', e.message);
  }
}

/* ============================================================
   HELPERS génériques
   ============================================================ */
function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
const firstDayOfMonthISO = () => {
  const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0,10);
};
const mondayOfWeekISO = (d) => {
  const date = new Date(d); const day = (date.getDay()+6)%7; // 0=Mon
  date.setDate(date.getDate()-day);
  return date.toISOString().slice(0,10);
};
async function getDefaultRegion(){ return localStorage.getItem('roman_region') || 'EMEA'; }
function setRegionPersist(code){ localStorage.setItem('roman_region', code); }

async function getAgents(region) {
  const { data } = await supabase.from('agents').select('id,full_name,status,region').eq('region', region).order('full_name');
  return data||[];
}
async function fetchSimpleReg(region) {
  const { data } = await supabase.from('regulation_rules').select('rule_key,value_text,enabled').eq('region', region).eq('enabled', true);
  const R={}; (data||[]).forEach(r=>R[r.rule_key]=r.value_text);
  return {
    maxHoursPerDay: parseFloat(R['Max Hours per Day']??'8'),
    lunchCount: parseInt(R['Amount of Lunch break per day']??'1',10),
    lunchDurationH: parseFloat(R['Duration of lunch time (in hour) can\'t be split']??'1'),
    breaksPerDay: parseInt(R['Number of break (other than lunch break)']??'2',10),
    breakMin: parseInt(R['Duration of other breaks per day (in Min)']??'15',10),
    openHH: R['Client facing opening hour is']||'10:00',
    closeHH: R['Client facing closing hour is']||'18:00',
    canWorkOutside: (R['Can work outside client hours']??'1')==='1'
  };
}
function computeNetCapPerAgentMin(reg) {
  const work = (reg.maxHoursPerDay||8)*60;
  const lunch = (reg.lunchCount||1)*(reg.lunchDurationH||1)*60;
  const br = (reg.breaksPerDay||2)*(reg.breakMin||15);
  return Math.max(0, Math.round(work - lunch - br));
}
async function fetchForecastPieces(region, y, m, d) {
  const week = isoWeekNumber(new Date(y, m-1, d));
  const weekday = ((new Date(y, m-1, d)).getDay()+6)%7 + 1; // 1..7

  const [ft,fm,fw,fd,fh] = await Promise.all([
    supabase.from('forecast_totals').select('total_volume').eq('region', region).maybeSingle(),
    supabase.from('forecast_monthly').select('share_percent').eq('region', region).eq('month_index', m).maybeSingle(),
    supabase.from('forecast_weekly').select('share_percent').eq('region', region).eq('week_index', week).maybeSingle(),
    supabase.from('forecast_daily').select('share_percent,email_pct,call_pct,chat_pct,clienteling_pct,fraud_pct,admin_pct').eq('region', region).eq('weekday', weekday).maybeSingle(),
    supabase.from('forecast_hourly').select('hhmm,share_percent').eq('region', region).order('hhmm')
  ]);

  const total = ft.data?.total_volume ?? 0;
  const monthlyShare = (fm.data?.share_percent ?? 100/12)/100;
  const weeklyShare  = (fw.data?.share_percent ?? 100/52)/100;
  const dayShare     = (fd.data?.share_percent ?? 100/7)/100;

  const dailyTaskPct = {
    Mail:(fd.data?.email_pct??0)/100,
    Call:(fd.data?.call_pct??0)/100,
    Chat:(fd.data?.chat_pct??0)/100,
    Clienteling:(fd.data?.clienteling_pct??0)/100,
    Fraud:(fd.data?.fraud_pct??0)/100,
    "Back Office":(fd.data?.admin_pct??0)/100,
  };

  const hourly = {};
  (fh.data||[]).forEach(r=> hourly[r.hhmm]=(parseFloat(r.share_percent)||0)/100);

  return { total, monthlyShare, weeklyShare, dayShare, dailyTaskPct, hourly };
}
function dayDemandMinutes(totalVolumeDay, dailyTaskPct, tasks) {
  const AHT={}; tasks.forEach(t=>AHT[t.name]=t.avg_handle_time_min||0);
  const keys=["Call","Mail","Chat","Clienteling","Fraud","Back Office"];
  let minutes=0;
  keys.forEach(k=>{
    const share = dailyTaskPct[k]||0;
    minutes += (totalVolumeDay*share) * (AHT[k]||0);
  });
  return minutes;
}

/* ============================================================
   ATTENDANCE (résumé mensuel)
   ============================================================ */
async function initAttendanceUI(){
  const root = document.getElementById('attendance'); if (!root) return;
  const regionSel = document.getElementById('att-region'); if (regionSel) { regionSel.value = await getDefaultRegion(); }
  const startInp = document.getElementById('att-start'); if (startInp) startInp.value = firstDayOfMonthISO();
  const btn = document.getElementById('att-calc'); if (btn) btn.onclick = runAttendance;
  await seedIfEmpty();
  await runAttendance();
}
async function runAttendance(){
  const sel = document.getElementById('att-region'); if (!sel) return;
  const region = sel.value; setRegionPersist(region);
  const startISO = document.getElementById('att-start')?.value || firstDayOfMonthISO();
  const d0 = new Date(startISO);
  const y = d0.getFullYear(), m = d0.getMonth()+1;
  const daysInMonth = new Date(y, m, 0).getDate();

  const regs = await fetchSimpleReg(region);
  const netCapPerAgentMin = computeNetCapPerAgentMin(regs);
  const agents = await getAgents(region);
  const tasks = await supabase.from('tasks').select('name,avg_handle_time_min').eq('region', region).then(r=>r.data||[]);

  const rows=[];
  for (let day=1; day<=daysInMonth; day++){
    const f = await fetchForecastPieces(region, y, m, day);
    const totalDay = f.total * f.monthlyShare * f.weeklyShare * f.dayShare;
    const demandMin = dayDemandMinutes(totalDay, f.dailyTaskPct, tasks);
    const available = agents.filter(a=>a.status==='Present').length;
    const required = netCapPerAgentMin>0 ? Math.ceil(demandMin / netCapPerAgentMin) : 0;
    const adherence = required>0 ? Math.min(100, Math.round((available/required)*100)) : 100;
    rows.push({ day, available, required, adherence });
  }
  renderAttendance(region, rows);
}
function renderAttendance(region, rows){
  const tbl = document.getElementById('att-table'); if (!tbl) return;
  const warn = document.getElementById('att-warnings');
  const adh = document.getElementById('adherence-label');
  const fill = document.getElementById('adherence-fill');

  let h = `<thead><tr><th class="first-col">Day</th>`;
  rows.forEach(r=>{
    const flag = r.required>r.available ? `<span class="warn-flag">!</span>`:'';
    h += `<th><div class="day-head">${r.day}</div>${flag}<div class="muted">${r.available}/${r.required}</div></th>`;
  });
  h += `</tr></thead>`;

  let b = `<tbody><tr><td class="first-col">Coverage</td>`;
  rows.forEach(r=>{
    const cls = r.required>r.available ? 'cell-gap' : 'cell-ok';
    b += `<td><div class="cell ${cls}"></div></td>`;
  });
  b += `</tr></tbody>`;

  tbl.innerHTML = h + b;

  if (warn) {
    const gaps = rows.filter(r=>r.required>r.available);
    warn.textContent = gaps.length ? `Sous-staffé: J${gaps.map(g=>g.day).join(', ')}` : 'OK';
  }
  if (adh && fill) {
    const avg = rows.length ? Math.round(rows.reduce((s,r)=>s+r.adherence,0)/rows.length) : 0;
    adh.textContent = `${avg}%`; fill.style.width = `${avg}%`;
  }
  const exp = document.getElementById('att-export');
  if (exp) {
    exp.onclick = ()=>{
      let csv = `Region,${region}\nDay,Available,Required,Adherence\n`;
      rows.forEach(r=> csv += `${r.day},${r.available},${r.required},${r.adherence}%\n`);
      downloadCSV(`attendance_${region}.csv`, csv);
    };
  }
}

/* ============================================================
   AGENTS (+ Skills + PTO)
   ============================================================ */
async function initAgentsUI(){
  const root = document.getElementById('agents'); if (!root) return;
  const sel = document.getElementById('ag-region'); if (sel) sel.value = await getDefaultRegion();
  document.getElementById('ag-refresh')?.addEventListener('click', loadAgentsList);
  document.getElementById('ag-add')?.addEventListener('click', addAgentFromForm);
  document.getElementById('ag-pto-add')?.addEventListener('click', addPTOFromForm);
  await loadAgentsList();
}
async function loadAgentsList(){
  const region = document.getElementById('ag-region')?.value || await getDefaultRegion();
  const listEl = document.getElementById('ag-list'); if (!listEl) return;
  setRegionPersist(region);
  const agents = await supabase.from('agents').select('id,full_name,status').eq('region', region).order('full_name').then(r=>r.data||[]);
  listEl.innerHTML = agents.map(a=>`
    <div class="ag-card">
      <div class="ag-top">
        <div class="ag-name">${a.full_name}</div>
        <select data-id="${a.id}" class="ag-status">
          ${['Present','PTO','Sick Leave','Unavailable'].map(st=>`<option ${st===a.status?'selected':''}>${st}</option>`).join('')}
        </select>
        <button class="ag-del" data-id="${a.id}">Delete</button>
      </div>
      <div class="ag-skills" data-id="${a.id}"></div>
    </div>
  `).join('') || '<div class="muted">No agents yet.</div>';

  // status change
  listEl.querySelectorAll('.ag-status').forEach(sel=>{
    sel.addEventListener('change', async (e)=>{
      const id = e.target.dataset.id;
      await supabase.from('agents').update({ status:e.target.value }).eq('id', id);
      if (document.getElementById('attendance')) runAttendance();
      if (document.getElementById('weekly')) runWeekly();
    });
  });
  // delete
  listEl.querySelectorAll('.ag-del').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      await supabase.from('agent_skills').delete().eq('agent_id', id);
      await supabase.from('agent_pto').delete().eq('agent_id', id);
      await supabase.from('agents').delete().eq('id', id);
      await loadAgentsList();
      if (document.getElementById('attendance')) runAttendance();
      if (document.getElementById('weekly')) runWeekly();
    });
  });

  // load skills
  for (const a of agents) {
    await ensureSkillRow(a.id);
    const wrap = listEl.querySelector(`.ag-skills[data-id="${a.id}"]`);
    if (wrap) {
      const s = await supabase.from('agent_skills').select('*').eq('agent_id', a.id).maybeSingle().then(r=>r.data);
      wrap.innerHTML = `
        ${renderToggle('Call','can_call',s?.can_call)} 
        ${renderToggle('Mail','can_mail',s?.can_mail)} 
        ${renderToggle('Chat','can_chat',s?.can_chat)} 
        ${renderToggle('Clienteling','can_clienteling',s?.can_clienteling)} 
        ${renderToggle('Fraud','can_fraud',s?.can_fraud)} 
        ${renderToggle('Back Office','can_backoffice',s?.can_backoffice)}
      `;
      wrap.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
        cb.addEventListener('change', async (e)=>{
          const field = e.target.dataset.field;
          await supabase.from('agent_skills').update({ [field]: e.target.checked }).eq('agent_id', a.id);
        });
      });
    }
  }
}
function renderToggle(label, field, val){ return `
  <label class="toggle">
    <input type="checkbox" data-field="${field}" ${val?'checked':''}/>
    <span>${label}</span>
  </label>`; }
async function ensureSkillRow(agent_id){
  const { data } = await supabase.from('agent_skills').select('agent_id').eq('agent_id', agent_id).maybeSingle();
  if (!data) await supabase.from('agent_skills').insert({ agent_id });
}
async function addAgentFromForm(){
  const name = document.getElementById('ag-name')?.value?.trim();
  const region = document.getElementById('ag-region')?.value || await getDefaultRegion();
  if (!name) return;
  await supabase.from('agents').insert({ full_name:name, region, status:'Present' });
  document.getElementById('ag-name').value='';
  await loadAgentsList();
  if (document.getElementById('attendance')) runAttendance();
  if (document.getElementById('weekly')) runWeekly();
}
async function addPTOFromForm(){
  const agentId = document.getElementById('pto-agent')?.value;
  const start = document.getElementById('pto-start')?.value;
  const end = document.getElementById('pto-end')?.value;
  if (!agentId || !start || !end) return;
  await supabase.from('agent_pto').insert({ agent_id:agentId, start_date:start, end_date:end });
  if (document.getElementById('attendance')) runAttendance();
  if (document.getElementById('weekly')) runWeekly();
}

/* ============================================================
   WEEKLY PLANNER (slots 30')
   ============================================================ */
async function initWeeklyUI(){
  const root = document.getElementById('weekly'); if (!root) return;
  const sel = document.getElementById('w-region'); if (sel) sel.value = await getDefaultRegion();
  const start = document.getElementById('week-start');
  if (start) start.value = mondayOfWeekISO(new Date());
  document.getElementById('w-run')?.addEventListener('click', runWeekly);
  await runWeekly();
}
function hhmmRange(hh1, hh2){ // inclusive start, inclusive end on 30' grid
  const parse=(s)=>{ const [H,M]=s.split(':').map(x=>+x); return H*60+M; };
  const a=parse(hh1), b=parse(hh2);
  const out=[]; for (let m=a; m<=b; m+=30){ const H=Math.floor(m/60), M=m%60; out.push(`${String(H).padStart(2,'0')}:${String(M).padStart(2,'0')}`); }
  return out;
}
async function runWeekly(){
  const region = document.getElementById('w-region')?.value || await getDefaultRegion();
  const startISO = document.getElementById('week-start')?.value || mondayOfWeekISO(new Date());
  setRegionPersist(region);

  const regs = await fetchSimpleReg(region);
  const agents = await getAgents(region);
  const tasks = await supabase.from('tasks').select('name,avg_handle_time_min').eq('region', region).then(r=>r.data||[]);

  const openSlots = hhmmRange(regs.openHH||'10:00', regs.closeHH||'18:00'); // business window
  const allSlots = regs.canWorkOutside ? hhmmRange('09:00','21:00') : openSlots;

  // build week grid (Mon..Sun)
  const baseDate = new Date(startISO);
  const grid = []; // [{dateISO, dayLabel, slots: [{hhmm, demandMin, agentsAvail, required, gap}]}]
  for (let d=0; d<7; d++){
    const date = new Date(baseDate); date.setDate(baseDate.getDate()+d);
    const y = date.getFullYear(), m = date.getMonth()+1, day = date.getDate();
    const pieces = await fetchForecastPieces(region, y, m, day);

    const totalDay = pieces.total * pieces.monthlyShare * pieces.weeklyShare * pieces.dayShare;

    // minutes demand per 30'
    // Use hourly share as distribution → split each hour % equally to the two 30' slots
    const hourShares = pieces.hourly; // hhmm -> %
    const bySlot = {};
    Object.keys(hourShares).forEach(HH=>{ bySlot[HH]=hourShares[HH]; });

    const AHT={}; tasks.forEach(t=>AHT[t.name]=t.avg_handle_time_min||0);
    const keys=["Call","Mail","Chat","Clienteling","Fraud","Back Office"];
    const totalTaskMin = keys.reduce((s,k)=> s + (totalDay*(pieces.dailyTaskPct[k]||0))*(AHT[k]||0), 0);

    // Normalize hour shares to sum to 1 (if zero, fallback to uniform across business slots)
    const sumShare = Object.values(bySlot).reduce((s,v)=>s+v,0);
    const factor = sumShare>0 ? 1/sumShare : 0;
    const slotSet = new Set(allSlots);
    const rows=[];
    allSlots.forEach(h=>{
      const hourWeight = (bySlot[h]||0) * factor; // fraction of day minutes
      const demandMin = sumShare>0 ? totalTaskMin*hourWeight : (totalTaskMin/allSlots.length);
      const agentsAvail = agents.filter(a=>a.status==='Present').length; // simplifié
      // required at 30' level ≈ demandMin / (net cap per agent per 30')
      const netPerAgentDay = computeNetCapPerAgentMin(regs);
      const netPerAgentSlot = netPerAgentDay/((regs.maxHoursPerDay||8)*60/30); // spread evenly on day slots
      const required = netPerAgentSlot>0 ? Math.ceil(demandMin / netPerAgentSlot) : 0;
      rows.push({ hhmm:h, demandMin:Math.round(demandMin), agentsAvail, required, gap:Math.max(0, required-agentsAvail) });
    });

    grid.push({
      dateISO: date.toISOString().slice(0,10),
      dayLabel: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d],
      slots: rows
    });
  }
  renderWeeklyGrid(grid);
}
function renderWeeklyGrid(grid){
  const tbl = document.getElementById('week-grid'); if (!tbl) return;
  // headers: first col = HH:MM, then Mon..Sun
  const allSlots = (grid[0]?.slots||[]).map(r=>r.hhmm);
  let thead = `<thead><tr><th class="first-col">Time</th>${grid.map(g=>`<th>${g.dayLabel}<div class="muted">${g.dateISO}</div></th>`).join('')}</tr></thead>`;
  let tbody = `<tbody>`;
  for (const hh of allSlots){
    tbody += `<tr><td class="first-col">${hh}</td>`;
    for (const day of grid){
      const s = day.slots.find(x=>x.hhmm===hh) || { required:0, agentsAvail:0, gap:0 };
      const cls = s.gap>0 ? 'cell-gap' : 'cell-ok';
      tbody += `<td><div class="cell ${cls}" title="Req ${s.required} / Av ${s.agentsAvail}"></div></td>`;
    }
    tbody += `</tr>`;
  }
  tbody += `</tbody>`;
  tbl.innerHTML = thead + tbody;

  const warn = document.getElementById('week-warnings');
  if (warn) {
    const gaps = [];
    grid.forEach(day=>{
      day.slots.forEach(s=>{ if (s.gap>0) gaps.push(`${day.dayLabel} ${day.dateISO} ${s.hhmm}`); });
    });
    warn.textContent = gaps.length ? `Sous-staffé: ${gaps.slice(0,10).join(', ')}${gaps.length>10?'…':''}` : 'OK';
  }
}

/* ============================================================
   FORECAST (édition mensuelle simple)
   ============================================================ */
async function initForecastUI(){
  const root = document.getElementById('forecast'); if (!root) return;
  const sel = document.getElementById('fc-region'); if (sel) sel.value = await getDefaultRegion();
  document.getElementById('fc-refresh')?.addEventListener('click', loadForecastTable);
  document.getElementById('fc-save')?.addEventListener('click', saveForecastTable);
  await loadForecastTable();
}
async function loadForecastTable(){
  const region = document.getElementById('fc-region')?.value || await getDefaultRegion();
  setRegionPersist(region);
  const months = await supabase.from('forecast_monthly').select('month_index,share_percent').eq('region', region).order('month_index').then(r=>r.data||[]);
  const tbl = document.getElementById('fc-table'); if (!tbl) return;
  tbl.innerHTML = `<thead><tr><th>Month</th><th>%</th></tr></thead><tbody>${
    months.map(m=>`<tr><td>${m.month_index}</td><td><input type="number" step="0.0001" value="${m.share_percent}"/></td></tr>`).join('')
  }</tbody>`;
}
async function saveForecastTable(){
  const region = document.getElementById('fc-region')?.value || await getDefaultRegion();
  const rows=[...document.querySelectorAll('#fc-table tbody tr')].map(tr=>{
    const m = parseInt(tr.children[0].textContent,10);
    const v = parseFloat(tr.children[1].querySelector('input').value);
    return { region, month_index:m, share_percent: isNaN(v)?0:v, email_pct:0, call_pct:0, chat_pct:0, clienteling_pct:0, fraud_pct:0, admin_pct:0 };
  });
  await supabase.from('forecast_monthly').upsert(rows);
  if (document.getElementById('attendance')) runAttendance();
  if (document.getElementById('weekly')) runWeekly();
}

/* ============================================================
   REGULATION (CRUD simple)
   ============================================================ */
async function initRegUI(){
  const root = document.getElementById('regulation'); if (!root) return;
  const sel = document.getElementById('reg-region'); if (sel) sel.value = await getDefaultRegion();
  document.getElementById('reg-refresh')?.addEventListener('click', loadRegTable);
  document.getElementById('reg-add')?.addEventListener('click', addRegRowBlank);
  document.getElementById('reg-save')?.addEventListener('click', saveRegTable);
  await loadRegTable();
}
async function loadRegTable(){
  const region = document.getElementById('reg-region')?.value || await getDefaultRegion();
  setRegionPersist(region);
  const rows = await supabase.from('regulation_rules').select('id,rule_key,value_text,notes,enabled').eq('region', region).order('rule_key').then(r=>r.data||[]);
  const tbl = document.getElementById('reg-table'); if (!tbl) return;
  tbl.innerHTML = `<thead><tr><th>Rule</th><th>Value</th><th>Notes</th><th>Enabled</th><th></th></tr></thead><tbody>${
    rows.map(r=>`
      <tr data-id="${r.id}">
        <td><input value="${r.rule_key}"/></td>
        <td><input value="${r.value_text}"/></td>
        <td><input value="${r.notes||''}"/></td>
        <td><input type="checkbox" ${r.enabled?'checked':''}/></td>
        <td><button class="reg-del">Delete</button></td>
      </tr>`).join('')
  }</tbody>`;
  tbl.querySelectorAll('.reg-del').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const tr = btn.closest('tr');
      const id = tr.dataset.id;
      if (id) await supabase.from('regulation_rules').delete().eq('id', id);
      tr.remove();
    });
  });
}
function addRegRowBlank(){
  const tb = document.querySelector('#reg-table tbody'); if (!tb) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input /></td><td><input /></td><td><input /></td><td><input type="checkbox" checked/></td><td><button class="reg-del">Delete</button></td>`;
  tb.appendChild(tr);
  tr.querySelector('.reg-del').addEventListener('click', ()=> tr.remove());
}
async function saveRegTable(){
  const region = document.getElementById('reg-region')?.value || await getDefaultRegion();
  const trs = [...document.querySelectorAll('#reg-table tbody tr')];
  const upserts = trs.map(tr=>{
    const id = tr.dataset.id || undefined;
    const tds = tr.querySelectorAll('td');
    return {
      id, region,
      rule_key: tds[0].querySelector('input').value.trim(),
      value_text: tds[1].querySelector('input').value.trim(),
      notes: tds[2].querySelector('input').value.trim(),
      enabled: tds[3].querySelector('input').checked
    };
  }).filter(r=>r.rule_key);
  await supabase.from('regulation_rules').upsert(upserts);
  if (document.getElementById('attendance')) runAttendance();
  if (document.getElementById('weekly')) runWeekly();
}

/* ============================================================
   TASKS (CRUD simple)
   ============================================================ */
async function initTasksUI(){
  const root = document.getElementById('tasks'); if (!root) return;
  const sel = document.getElementById('tk-region'); if (sel) sel.value = await getDefaultRegion();
  document.getElementById('tk-refresh')?.addEventListener('click', loadTaskTable);
  document.getElementById('tk-add')?.addEventListener('click', addTaskRowBlank);
  document.getElementById('tk-save')?.addEventListener('click', saveTaskTable);
  await loadTaskTable();
}
async function loadTaskTable(){
  const region = document.getElementById('tk-region')?.value || await getDefaultRegion();
  setRegionPersist(region);
  const rows = await supabase.from('tasks').select('id,name,priority,avg_handle_time_min,color_hex,enabled').eq('region', region).order('name').then(r=>r.data||[]);
  const tbl = document.getElementById('tk-table'); if (!tbl) return;
  tbl.innerHTML = `<thead><tr><th>Name</th><th>Priority</th><th>AHT (min)</th><th>Color</th><th>Enabled</th><th></th></tr></thead><tbody>${
    rows.map(r=>`
      <tr data-id="${r.id}">
        <td><input value="${r.name}"/></td>
        <td>
          <select>
            ${['Mandatory','P1','P2','P3'].map(p=>`<option ${p===r.priority?'selected':''}>${p}</option>`).join('')}
          </select>
        </td>
        <td><input type="number" step="1" value="${r.avg_handle_time_min}"/></td>
        <td><input value="${r.color_hex}"/></td>
        <td><input type="checkbox" ${r.enabled?'checked':''}/></td>
        <td><button class="task-del">Delete</button></td>
      </tr>`).join('')
  }</tbody>`;
  tbl.querySelectorAll('.task-del').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const tr = btn.closest('tr'); const id = tr.dataset.id;
      if (id) await supabase.from('tasks').delete().eq('id', id);
      tr.remove();
      if (document.getElementById('attendance')) runAttendance();
      if (document.getElementById('weekly')) runWeekly();
    });
  });
}
function addTaskRowBlank(){
  const tb = document.querySelector('#tk-table tbody'); if (!tb) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input/></td>
    <td><select>${['Mandatory','P1','P2','P3'].map(p=>`<option>${p}</option>`).join('')}</select></td>
    <td><input type="number" step="1" value="5"/></td>
    <td><input value="#999999"/></td>
    <td><input type="checkbox" checked/></td>
    <td><button class="task-del">Delete</button></td>`;
  tb.appendChild(tr);
  tr.querySelector('.task-del').addEventListener('click', ()=> tr.remove());
}
async function saveTaskTable(){
  const region = document.getElementById('tk-region')?.value || await getDefaultRegion();
  const trs = [...document.querySelectorAll('#tk-table tbody tr')];
  const upserts = trs.map(tr=>{
    const id = tr.dataset.id || undefined;
    const tds = tr.querySelectorAll('td');
    return {
      id, region,
      name: tds[0].querySelector('input').value.trim(),
      priority: tds[1].querySelector('select').value,
      avg_handle_time_min: parseInt(tds[2].querySelector('input').value,10)||0,
      color_hex: tds[3].querySelector('input').value.trim(),
      enabled: tds[4].querySelector('input').checked
    };
  }).filter(r=>r.name);
  await supabase.from('tasks').upsert(upserts);
  if (document.getElementById('attendance')) runAttendance();
  if (document.getElementById('weekly')) runWeekly();
}

/* ============================================================
   TABS + BOOTSTRAP
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  // tabs
  const btns = [...document.querySelectorAll('.tab-btn')];
  const panels = [...document.querySelectorAll('.tab-panel')];
  const show = async (id)=>{
    panels.forEach(p=>p.toggleAttribute('hidden', p.id!==id));
    btns.forEach(b=>b.classList.toggle('active', b.dataset.tab===id));
    if (id==='attendance') await initAttendanceUI();
    if (id==='agents') await initAgentsUI();
    if (id==='weekly') await initWeeklyUI();
    if (id==='forecast') await initForecastUI();
    if (id==='regulation') await initRegUI();
    if (id==='tasks') await initTasksUI();
  };
  btns.forEach(b=> b.addEventListener('click', ()=> show(b.dataset.tab)));

  // default seed + show first active tab
  await seedIfEmpty();
  const initial = btns.find(b=>b.classList.contains('active'))?.dataset.tab || panels[0]?.id;
  if (initial) await show(initial);

  // Populate common selects for PTO agent picker if exists
  const ptoSel = document.getElementById('pto-agent');
  if (ptoSel) {
    const region = document.getElementById('ag-region')?.value || await getDefaultRegion();
    const agents = await getAgents(region);
    ptoSel.innerHTML = `<option value="">-- select agent --</option>` + agents.map(a=>`<option value="${a.id}">${a.full_name}</option>`).join('');
  }
});

/* ============================================================
   UTILS
   ============================================================ */
function downloadCSV(filename, text){
  const blob = new Blob([text], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}
