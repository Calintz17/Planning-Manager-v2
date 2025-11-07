/* ============================================================
   APP.JS — ROMAN Planning Manager (no-auth, final)
   - Tabs handler unique
   - Supabase client (CONFIG.* requis dans config.js)
   - Modules: Tasks, ForecastStore, Attendance, Agents+PTO, Weekly, Regulation
   - Calcul avancé Weekly: total → mois → semaine → jour → heure
     → répartition par tâches (Task-Mix) → minutes via AHT
     → comparaison à la capacité nette (règles + PTO + présence)
   ============================================================ */

/* ---------- Supabase client ---------- */
const supabase = window.supabase.createClient(
  window.CONFIG.SUPABASE_URL,
  window.CONFIG.SUPABASE_ANON_KEY
);

/* ======================================================================
   TABS HANDLER — unique & robuste
   ====================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const btns   = Array.from(document.querySelectorAll('.tab-btn'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));
  const show = (id) => {
    panels.forEach(p => p.id === id ? p.removeAttribute('hidden') : p.setAttribute('hidden',''));
    btns.forEach(b => {
      const on = b.dataset.tab === id;
      b.classList.toggle('active', on);
      if (b.hasAttribute('aria-selected')) b.setAttribute('aria-selected', String(on));
    });
    try {
      if (id === 'attendance') initAttendanceUI();
      if (id === 'agents')     initAgentsUI();
      if (id === 'weekly')     initWeeklyUI();
      if (id === 'forecast')   ForecastStore.init();
      if (id === 'regulation') RegulationUI.init();
      if (id === 'tasks')      Tasks.init();
    } catch(e){ console.error(e); }
  };
  btns.forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  const initial = btns.find(b=>b.classList.contains('active'))?.dataset.tab || panels[0]?.id;
  if (initial) show(initial);
});

/* ======================================================================
   HELPERS
   ====================================================================== */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const ymd = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0,10);
function isoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}
function firstDayOfCurrentMonthISO(){ const n=new Date(); return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0,10); }

/* ======================================================================
   REGULATIONS (clé-valeur par région)
   ====================================================================== */
async function fetchRegulationMap(region){
  // regulation_rules(region, rule_key, value_text, enabled)
  const { data, error } = await supabase
    .from('regulation_rules')
    .select('rule_key,value_text,enabled')
    .eq('region', region)
    .eq('enabled', true);
  if (error) { console.warn(error.message); return defaultRegulations(); }
  const map = Object.create(null);
  (data||[]).forEach(r => map[r.rule_key] = r.value_text);
  // normalisation vers structure de calcul
  return normalizeRegulations(map);
}
function defaultRegulations(){
  // Valeurs par défaut “France-like”
  return {
    maxHoursPerDay: 8,
    maxHoursPerWeek: 37.5,
    lunchMin: 60,
    lunchWindowStart: '12:00',
    lunchWindowEnd: '15:00',
    breaksPerDay: 2,
    breakMin: 15,
    minRestBetweenShifts: 11,
    saturdayWork: false,
    sundayWork: false,
    businessOpen: '10:00',
    businessClose: '18:00',
    minArrival: '09:00',
    maxDeparture: '21:00',
    canWorkOutsideBusiness: true
  };
}
function normalizeRegulations(map){
  const num = (k, def) => (map[k]!=null ? parseFloat(String(map[k]).replace(',','.')) : def);
  const bool = (k, def) => {
    const v = (map[k]??'').toString().trim().toLowerCase();
    if (['1','true','yes','oui','y','on'].includes(v)) return true;
    if (['0','false','no','non','n','off'].includes(v)) return false;
    return def;
  };
  const str = (k, def) => (map[k] ?? def);
  return {
    maxHoursPerDay: num('Max Hours per Day', 8),
    maxHoursPerWeek: num('Max Hours per Week', 37.5),
    lunchMin: num('Lunch Duration (minutes)', 60),
    lunchWindowStart: str('Lunch Window Start (HH:MM)', '12:00'),
    lunchWindowEnd:   str('Lunch Window End (HH:MM)', '15:00'),
    breaksPerDay: num('Breaks per Day (count)', 2),
    breakMin: num('Break Duration (minutes)', 15),
    minRestBetweenShifts: num('Min Rest Between Shifts (hours)', 11),
    saturdayWork: bool('Saturday Work', false),
    sundayWork: bool('Sunday Work', false),
    businessOpen: str('Client facing opening hour is', '10:00'),
    businessClose: str('Client facing closing hour is', '18:00'),
    minArrival: str('Minimum arrival date for advisor', '09:00'),
    maxDeparture: str('Maximum arrival date for advisor is', '21:00'),
    canWorkOutsideBusiness: bool('Advisor can work in the window outside of the client facing hours', true)
  };
}
function computeNetCapacityPerAgentMin(reg){
  const workMin = reg.maxHoursPerDay * 60;
  const breaks  = reg.breaksPerDay * reg.breakMin;
  return Math.max(0, workMin - reg.lunchMin - breaks);
}

/* ======================================================================
   TASKS (catalogue local par région)
   ====================================================================== */
const Tasks = (() => {
  const KEY = 'roman_tasks_v3:';
  const DEFAULT = [
    { key:'call',        label:'Call',         priority:'high', aht:7,  enabled:true,  notes:'' },
    { key:'mail',        label:'Mail',         priority:'med',  aht:8,  enabled:true,  notes:'' },
    { key:'chat',        label:'Chat',         priority:'high', aht:3,  enabled:true,  notes:'' },
    { key:'clienteling', label:'Clienteling',  priority:'low',  aht:15, enabled:true,  notes:'' },
    { key:'backoffice',  label:'Back Office',  priority:'med',  aht:15, enabled:true,  notes:'' },
    { key:'fraud',       label:'Fraud',        priority:'high', aht:10, enabled:true,  notes:'' },
    { key:'lunch',       label:'Lunch Break',  priority:'high', aht:60, enabled:true,  notes:'Mandatory by regulation' },
    { key:'break',       label:'Break',        priority:'high', aht:15, enabled:true,  notes:'x2 per day' },
    { key:'morning',     label:'Morning Brief',priority:'low',  aht:15, enabled:true,  notes:'' },
    { key:'training',    label:'Training',     priority:'low',  aht:1,  enabled:true,  notes:'' },
  ];
  let region = 'EMEA';
  let rows = [];
  const els = {
    panel:   () => document.getElementById('tasksPanel'),
    search:  () => document.getElementById('task-search'),
    fPrio:   () => document.getElementById('task-filter-priority'),
    region:  () => document.getElementById('task-region'),
    tbody:   () => document.getElementById('tasksTbody'),
    counters:() => document.getElementById('task-counters'),
    createBtn:() => document.getElementById('createTaskBtn'),
  };
  const key = (reg) => `${KEY}${reg}`;
  const load = (reg) => {
    try{
      const raw = localStorage.getItem(key(reg));
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT));
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : JSON.parse(JSON.stringify(DEFAULT));
    }catch{ return JSON.parse(JSON.stringify(DEFAULT)); }
  };
  const save = () => localStorage.setItem(key(region), JSON.stringify(rows));
  const AHT = () => {
    const m = Object.create(null);
    rows.forEach(r => { m[r.label] = Number(r.aht)||0; });
    // alias vers noms utilisés par le forecast
    m['Call'] = rows.find(r=>r.key==='call')?.aht ?? 7;
    m['Mail'] = rows.find(r=>r.key==='mail')?.aht ?? 8;
    m['Chat'] = rows.find(r=>r.key==='chat')?.aht ?? 3;
    m['Clienteling'] = rows.find(r=>r.key==='clienteling')?.aht ?? 15;
    m['Fraud'] = rows.find(r=>r.key==='fraud')?.aht ?? 10;
    m['Back Office'] = rows.find(r=>r.key==='backoffice')?.aht ?? 15;
    return m;
  };
  const renderRow = (r) => `
    <tr data-row="${r.key}">
      <td><input type="text" value="${escapeHtml(r.label)}" data-key="${r.key}" data-field="label" /></td>
      <td>
        <select data-key="${r.key}" data-field="priority">
          <option value="high" ${r.priority==='high'?'selected':''}>High (P1)</option>
          <option value="med"  ${r.priority==='med'?'selected':''}>Medium (P2)</option>
          <option value="low"  ${r.priority==='low'?'selected':''}>Low (P3)</option>
        </select>
      </td>
      <td><input type="number" min="0" step="1" value="${Number(r.aht)||0}" data-key="${r.key}" data-field="aht" /></td>
      <td>
        <label class="switch">
          <input type="checkbox" ${r.enabled?'checked':''} data-key="${r.key}" data-field="enabled" />
          <span class="slider"></span>
        </label>
      </td>
      <td><input type="text" value="${escapeHtml(r.notes||'')}" data-key="${r.key}" data-field="notes" /></td>
      <td class="row-actions">
        <button type="button" class="mini danger" data-action="delete" data-key="${r.key}" title="Delete">Delete</button>
      </td>
    </tr>
  `;
  const escapeHtml=(s='')=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const debounce=(fn,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);}};

  const onCellInput = debounce((e)=>onCellChange(e),200);
  const onCellChange = (e) => {
    const el=e.target, k=el.dataset.key, f=el.dataset.field;
    const i=rows.findIndex(x=>x.key===k); if(i<0) return;
    let v = (f==='enabled') ? el.checked : (f==='aht' ? Number(el.value)||0 : el.value);
    rows[i][f] = v; save(); renderCounters();
  };
  const renderCounters = () => {
    const cnt = els.counters(); if (!cnt) return;
    const enabled = rows.filter(r=>r.enabled).length;
    cnt.innerHTML = [
      `<span class="counter">Region: <b>${region}</b></span>`,
      `<span class="counter">Tasks: <b>${rows.length}</b></span>`,
      `<span class="counter">Enabled: <b>${enabled}</b></span>`
    ].join('');
  };
  const render = () => {
    const tb = els.tbody(); if (!tb) return;
    const q  = (els.search()?.value||'').toLowerCase().trim();
    const fp = (els.fPrio()?.value||'');
    const list = rows.filter(r=>{
      if (q && !(r.label.toLowerCase().includes(q) || (r.notes||'').toLowerCase().includes(q))) return false;
      if (fp && r.priority!==fp) return false;
      return true;
    });
    tb.innerHTML = list.map(renderRow).join('') || `<tr><td colspan="6" class="muted">No tasks.</td></tr>`;
    tb.querySelectorAll('select[data-key], input[data-key]').forEach(inp=>{
      inp.addEventListener('change', onCellChange);
      inp.addEventListener('input',  onCellInput);
    });
    renderCounters();
  };
  const init = () => {
    const panel=els.panel(); if(!panel) return;
    if(init._init) return; init._init=true;
    const rSel=els.region();
    region=rSel?.value||'EMEA';
    rows=load(region); render();
    rSel?.addEventListener('change', ()=>{ region=rSel.value; rows=load(region); render(); });
    els.search()?.addEventListener('input', render);
    els.fPrio()?.addEventListener('change', render);
    els.createBtn()?.addEventListener('click', ()=>{
      const name=prompt('New task name ?'); if(!name) return;
      const safe=name.toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,24)||('task'+Date.now());
      rows.push({ key:safe, label:name, priority:'low', aht:5, enabled:true, notes:'' });
      save(); render();
    });
  };
  return { init, AHT };
})();

/* ======================================================================
   FORECAST STORE (localStorage + sync REST optionnelle)
   Keys: total, monthly[1..12]%, weekly[1..53]%, daily[Mon..Sun]%,
         hourly["HH:MM"]% (slots 30’)
   ====================================================================== */
const ForecastStore = (() => {
  const PREFIX = 'roman_forecast_v3:';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const HOURS  = Array.from({length:24*2},(_,i)=>{
    const h = Math.floor(i/2), m = (i%2)*30;
    return `${String(h).padStart(2,'0')}:${m?'30':'00'}`;
  });

  let region='EMEA', state=null;
  const key = (reg)=>`${PREFIX}${reg}`;
  const blank = ()=>({
    total:'',
    monthly:Object.fromEntries(MONTHS.map((_,i)=>[String(i+1), ''])),
    weekly:Object.fromEntries(Array.from({length:53},(_,i)=>[String(i+1), ''])),
    daily:Object.fromEntries(DAYS.map(d=>[d, ''])),
    hourly:Object.fromEntries(HOURS.map(h=>[h,'']))
  });
  const mergeBlank = (obj)=>{
    const b = blank();
    return {
      total: obj?.total ?? b.total,
      monthly: { ...b.monthly, ...(obj?.monthly||{}) },
      weekly:  { ...b.weekly,  ...(obj?.weekly||{}) },
      daily:   { ...b.daily,   ...(obj?.daily||{}) },
      hourly:  { ...b.hourly,  ...(obj?.hourly||{}) }
    };
  };
  const load = (reg)=>{
    try{
      const raw=localStorage.getItem(key(reg));
      if(!raw) return blank();
      return mergeBlank(JSON.parse(raw));
    }catch{ return blank(); }
  };
  const save = ()=> localStorage.setItem(key(region), JSON.stringify(state));
  const sumPercent = (arr)=> {
    const n = arr.reduce((s,v)=> s + (parseFloat(String(v).replace(',','.'))||0), 0);
    return Math.round(n*100)/100;
  };

  // UI rendering (index.html already has containers/labels)
  const inputHtml = (name, value)=> `<input type="number" step="0.01" name="${name}" value="${value??''}"/>`;
  const table = (head, rows)=>{
    const th = `<thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead>`;
    const tb = `<tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
    return `<table class="table">${th}${tb}</table>`;
  };
  const wire = (host)=> {
    host.querySelectorAll('input[name]').forEach(inp=>{
      inp.addEventListener('input', onChange);
      inp.addEventListener('change', onChange);
    });
  };
  function onChange(e){
    const path = e.target.name.split('.');
    let ref = state;
    for (let i=0;i<path.length-1;i++){ const k=path[i]; if(ref[k]==null) ref[k]={}; ref=ref[k]; }
    ref[path.at(-1)] = e.target.value;
    save(); // optionnel: sync REST ouverte
    if (window.CONFIG.SYNC_FORECAST) softSyncForecast(e.target.name, e.target.value);
    refreshSums();
  }
  async function softSyncForecast(field, value){
    try{
      const url = `${window.CONFIG.SUPABASE_URL}/rest/v1/forecast_values`;
      await fetch(url, {
        method: 'POST',
        headers: {
          apikey: window.CONFIG.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${window.CONFIG.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify([{ region, field, value, updated_at: new Date().toISOString() }])
      });
    }catch(e){ /* no-crash */ }
  }
  const refreshSums = ()=>{
    const mSpan=document.getElementById('fc-monthly-sum');
    const wSpan=document.getElementById('fc-weekly-sum');
    const dSpan=document.getElementById('fc-daily-check');
    const hSpan=document.getElementById('fc-hourly-sum');
    if (mSpan) mSpan.textContent = `Sum: ${sumPercent(Object.values(state.monthly))}%`;
    if (wSpan) wSpan.textContent = `Sum (guide): ${sumPercent(Object.values(state.weekly))}%`;
    if (dSpan) dSpan.textContent = `Day% sum: ${sumPercent(Object.values(state.daily))}%`;
    if (hSpan) hSpan.textContent = `Sum: ${sumPercent(Object.values(state.hourly))}%`;
  };

  // Public getters for calculations
  const getTotal = ()=> parseFloat(String(state.total).replace(',','.'))||0;
  const getMonthlyShare = (m1to12)=> (parseFloat(String(state.monthly[String(m1to12)]||'0').replace(',','.'))||0)/100;
  const getWeeklyShare  = (w1to53)=> (parseFloat(String(state.weekly[String(w1to53)]||'0').replace(',','.'))||0)/100;
  const getDailyShare   = (dow)=> { // JS 1..7 (Mon..Sun)
    const map = {1:'Mon',2:'Tue',3:'Wed',4:'Thu',5:'Fri',6:'Sat',7:'Sun'};
    return (parseFloat(String(state.daily[map[dow]]||'0').replace(',','.'))||0)/100;
  };
  const getHourlyShares = (startHHMM, endHHMM)=>{
    // returns Map(hhmm -> shareFractionWithinDayWindow)
    const hours = Object.keys(state.hourly);
    const window = hours.filter(h => h>=startHHMM && h<endHHMM);
    const sum = window.reduce((s,h)=> s + (parseFloat(String(state.hourly[h]||'0').replace(',','.'))||0), 0) || 1;
    const map = new Map();
    window.forEach(h => {
      const v = (parseFloat(String(state.hourly[h]||'0').replace(',','.'))||0);
      map.set(h, v / sum);
    });
    return map;
  };

  const init = () => {
    const host = document.getElementById('forecast-section'); if(!host) return;
    if (init._init) { // refresh region switch
      const rSel = document.getElementById('fc-region');
      const r = rSel?.value || 'EMEA';
      if (r !== region){ region=r; state=load(region); paint(); }
      return;
    }
    init._init=true;
    const rSel = document.getElementById('fc-region');
    region = rSel?.value || 'EMEA';
    state = load(region);
    rSel?.addEventListener('change', ()=>{ region=rSel.value; state=load(region); paint(); });
    paint();
  };
  const paint = ()=>{
    // total
    const tot = document.getElementById('fc-total');
    if (tot){ tot.value = state.total??''; tot.oninput = (e)=>{ state.total=e.target.value; save(); }; }
    // monthly
    const monthly = document.getElementById('fc-monthly');
    if (monthly){
      const head = ['Month', ...Array.from({length:12},(_,i)=>String(i+1))];
      const row  = ['Share %', ...Array.from({length:12},(_,i)=> inputHtml(`monthly.${String(i+1)}`, state.monthly[String(i+1)]))];
      monthly.innerHTML = table(head, [row]); wire(monthly);
    }
    // weekly
    const weekly = document.getElementById('fc-weekly');
    if (weekly){
      const head=['Week',...Array.from({length:53},(_,i)=>String(i+1))];
      const row=['Share %',...Array.from({length:53},(_,i)=> inputHtml(`weekly.${String(i+1)}`, state.weekly[String(i+1)]))];
      weekly.innerHTML = table(head,[row]); wire(weekly);
    }
    // daily
    const daily = document.getElementById('fc-daily');
    if (daily){
      const head=['Day','%'];
      const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const rows=days.map(d=> [d, inputHtml(`daily.${d}`, state.daily[d])]);
      daily.innerHTML = table(head, rows); wire(daily);
    }
    // hourly
    const hourly = document.getElementById('fc-hourly');
    if (hourly){
      const head=['Hour', ...Object.keys(state.hourly)];
      const row =['Share %', ...Object.keys(state.hourly).map(h => inputHtml(`hourly.${h}`, state.hourly[h]))];
      hourly.innerHTML = table(head,[row]); wire(hourly);
    }
    refreshSums();
  };

  return {
    init,
    getTotal, getMonthlyShare, getWeeklyShare, getDailyShare, getHourlyShares
  };
})();

/* ======================================================================
   ATTENDANCE — couverture mensuelle
   ====================================================================== */
const attRegionSel   = document.getElementById("att-region");
const attStartInput  = document.getElementById("att-start");
const attCalcBtn     = document.getElementById("att-calc");
const adherenceLabel = document.getElementById("adherence-label");
const adherenceFill  = document.getElementById("adherence-fill"); // (style.css gère la barre si présente)
const attTable       = document.getElementById("att-table");
const attWarnings    = document.getElementById("att-warnings");

async function fetchAgentsWithPTO(region){
  const [{ data: agents, error:e1 }, { data: pto, error:e2 }] = await Promise.all([
    supabase.from('agents').select('id,full_name,region,status').eq('region', region).order('full_name',{ascending:true}),
    supabase.from('agent_pto').select('agent_id,start_date,end_date,half_day_start,half_day_end')
  ]);
  if (e1) throw e1; if (e2) throw e2;
  const byId = Object.create(null);
  (agents||[]).forEach(a => byId[a.id] = { ...a, pto: [] });
  (pto||[]).forEach(p => { if(byId[p.agent_id]) byId[p.agent_id].pto.push(p); });
  return Object.values(byId);
}
function agentIsOffThatDate(agent, dateISO){
  for (const p of agent.pto||[]) if (dateISO >= p.start_date && dateISO <= p.end_date) return true;
  return false;
}

async function fetchDailyTaskMix(region, dow){
  // Si tu as rempli forecast_daily (email_pct, call_pct, etc.) on l’utilise.
  const { data, error } = await supabase
    .from('forecast_daily')
    .select('email_pct,call_pct,chat_pct,clienteling_pct,fraud_pct,admin_pct')
    .eq('region', region)
    .eq('weekday', dow) // 1..7 (Mon..Sun)
    .maybeSingle();
  if (error) { return {Mail:.28, Call:.30, Chat:0, Clienteling:.04, Fraud:.02, 'Back Office':.36}; }
  return {
    Mail: (parseFloat(data?.email_pct)||0)/100,
    Call: (parseFloat(data?.call_pct)||0)/100,
    Chat: (parseFloat(data?.chat_pct)||0)/100,
    Clienteling: (parseFloat(data?.clienteling_pct)||0)/100,
    Fraud: (parseFloat(data?.fraud_pct)||0)/100,
    'Back Office': (parseFloat(data?.admin_pct)||0)/100,
  };
}
async function fetchTotalsAndShares(region, y, m, d){
  const week = isoWeekNumber(new Date(y,m-1,d));
  const wd = ((new Date(y,m-1,d).getDay()+6)%7)+1; // 1..7
  // totals
  let annual = ForecastStore.getTotal();
  if (!annual) {
    // fallback DB: forecast_totals
    const { data } = await supabase.from('forecast_totals').select('total_volume').eq('region',region).maybeSingle();
    annual = data?.total_volume||0;
  }
  const mShare = ForecastStore.getMonthlyShare(m) || 0;
  const wShare = ForecastStore.getWeeklyShare(week) || 0;
  const dShare = ForecastStore.getDailyShare(wd) || 0;
  return { annual, mShare, wShare, dShare, week, wd };
}
function sumDemandMinutesFromMix(totalDay, mix, ahtMap){
  const keys = ['Call','Mail','Chat','Clienteling','Fraud','Back Office'];
  let minutes = 0;
  for (const k of keys){
    const pct = mix[k]??0;
    const aht = ahtMap[k]??0;
    const count = totalDay * pct;
    minutes += count * aht;
  }
  return minutes;
}

async function calcAttendance(region, startISO){
  const start = new Date(startISO);
  const y = start.getFullYear(), m = start.getMonth()+1;
  const daysInMonth = new Date(y, m, 0).getDate();
  const regs = await fetchRegulationMap(region);
  const netCapPerAgentMin = computeNetCapacityPerAgentMin(regs);
  const agents = await fetchAgentsWithPTO(region);
  const ahtMap = Tasks.AHT();

  const results=[];
  for (let day=1; day<=daysInMonth; day++){
    const dateISO = ymd(new Date(y,m-1,day));
    const { annual, mShare, wShare, dShare, wd } = await fetchTotalsAndShares(region, y, m, day);
    const totalDay = annual * mShare * wShare * dShare;
    const mix = await fetchDailyTaskMix(region, wd);
    const demandMin = sumDemandMinutesFromMix(totalDay, mix, ahtMap);
    const available = agents.filter(a => a.status==='Present' && !agentIsOffThatDate(a, dateISO)).length;
    const required  = (netCapPerAgentMin>0) ? Math.ceil(demandMin / netCapPerAgentMin) : 0;
    const adherence = required>0 ? Math.min(100, Math.round((available/required)*100)) : 100;
    results.push({ dateISO, day, available, required, adherence });
  }
  return { results, agents };
}
function renderAttendanceGrid(region, calc){
  const { results, agents } = calc;
  let thead = `<thead><tr><th class="first-col">Agent</th>`;
  for (const c of results){
    const flag = c.required>c.available ? `<span class="warn-flag">/!\\</span>` : "";
    thead += `<th><div class="day-head">${c.day}</div>${flag}<div class="req-available">${c.available}/${c.required}</div></th>`;
  }
  thead += `</tr></thead>`;

  let tbody = `<tbody>`;
  for (const a of agents){
    tbody += `<tr><td class="first-col" title="${a.status}">${a.full_name}</td>`;
    for (const c of results){
      const off = agentIsOffThatDate(a, c.dateISO);
      let cls = off ? 'cell-pto' : 'cell-present';
      tbody += `<td class="${cls}"></td>`;
    }
    tbody += `</tr>`;
  }
  tbody += `</tbody>`;
  attTable.innerHTML = thead + tbody;

  const warnDays = results.filter(r => r.required>r.available);
  attWarnings.textContent = warnDays.length ? `Manque sur: ${warnDays.map(w=>`D${w.day}`).join(', ')}` : 'All days fully staffed';
}
function renderAdherenceSummary(results){
  if (!results.length){ adherenceLabel.textContent='–%'; return; }
  const avg = Math.round(results.reduce((s,r)=>s+r.adherence,0)/results.length);
  adherenceLabel.textContent = `${avg}%`;
}
async function initAttendanceUI(){
  if (initAttendanceUI._init) return;
  initAttendanceUI._init = true;
  attRegionSel.value = 'EMEA';
  attStartInput.value = firstDayOfCurrentMonthISO();
  const run = async()=>{
    const calc = await calcAttendance(attRegionSel.value, attStartInput.value);
    renderAttendanceGrid(attRegionSel.value, calc);
    renderAdherenceSummary(calc.results);
  };
  attCalcBtn?.addEventListener('click', run);
  await run();
}

/* ======================================================================
   AGENTS (Directory + Skills + PTO Drawer)
   ====================================================================== */
const agRegionSel  = document.getElementById("ag-region");
const agAddBtn     = document.getElementById("ag-add");
const agExportBtn  = document.getElementById("ag-export");
const agTableBody  = document.getElementById("ag-table")?.querySelector("tbody");

const PTO_DRAWER = {
  el: document.getElementById("pto-drawer"),
  title: document.getElementById("pto-title"),
  closeBtn: document.getElementById("pto-close"),
  start: document.getElementById("pto-start"),
  end: document.getElementById("pto-end"),
  halfStart: document.getElementById("pto-half-start"),
  halfEnd: document.getElementById("pto-half-end"),
  saveBtn: document.getElementById("pto-save"),
  list: document.getElementById("pto-list"),
  calendar: document.getElementById("pto-calendar"),
  agentId: null,
  agentName: null,
};

async function fetchAgents(region){
  const { data, error } = await supabase
    .from('agents')
    .select('id,full_name,region,status')
    .eq('region', region)
    .order('full_name',{ascending:true});
  if (error) throw error;

  const { data: skills, error:e2 } = await supabase.from('agent_skills').select('*');
  if (e2) throw e2;

  const byId = Object.create(null);
  (data||[]).forEach(a => byId[a.id] = { ...a, skills: { can_call:true, can_mail:true, can_chat:true, can_clienteling:true, can_fraud:true, can_backoffice:true }});
  (skills||[]).forEach(s => {
    if (byId[s.agent_id]) {
      byId[s.agent_id].skills = {
        can_call: !!s.can_call, can_mail: !!s.can_mail, can_chat: !!s.can_chat,
        can_clienteling: !!s.can_clienteling, can_fraud: !!s.can_fraud, can_backoffice: !!s.can_backoffice
      };
    }
  });
  return Object.values(byId);
}
function statusSelectHtml(current){
  const opts = ['Present','PTO','Sick Leave','Unavailable'];
  return `<select class="ag-status">${opts.map(o=>`<option value="${o}" ${o===current?'selected':''}>${o}</option>`).join('')}</select>`;
}
function skillCheckbox(checked, cls){
  return `<input type="checkbox" class="ag-skill ${cls}" ${checked?'checked':''}/>`;
}
function rowActions(){
  return {
    pto:`<button class="mini primary">PTO</button>`,
    cal:`<button class="mini secondary">📅</button>`,
    del:`<button class="mini danger">Delete</button>`
  };
}
async function renderAgentsTable(){
  if (!agTableBody) return;
  agTableBody.innerHTML = `<tr><td colspan="12">Loading…</td></tr>`;
  const rows = await fetchAgents(agRegionSel.value);
  if (!rows.length){ agTableBody.innerHTML = `<tr><td colspan="12">No agents yet.</td></tr>`; return; }
  const html = rows.map(r=>{
    const a=rowActions();
    return `<tr data-id="${r.id}">
      <td class="ag-name" contenteditable="true">${r.full_name}</td>
      <td>${r.region}</td>
      <td>${statusSelectHtml(r.status)}</td>
      <td>${skillCheckbox(r.skills.can_call, "can_call")}</td>
      <td>${skillCheckbox(r.skills.can_mail, "can_mail")}</td>
      <td>${skillCheckbox(r.skills.can_chat, "can_chat")}</td>
      <td>${skillCheckbox(r.skills.can_clienteling, "can_clienteling")}</td>
      <td>${skillCheckbox(r.skills.can_fraud, "can_fraud")}</td>
      <td>${skillCheckbox(r.skills.can_backoffice, "can_backoffice")}</td>
      <td>${a.pto}</td><td>${a.cal}</td><td>${a.del}</td>
    </tr>`;
  }).join('');
  agTableBody.innerHTML = html;

  // bindings
  agTableBody.querySelectorAll('tr').forEach(tr=>{
    const id = tr.getAttribute('data-id');
    // name edit
    const nameEl = tr.querySelector('.ag-name');
    nameEl.addEventListener('blur', async ()=>{
      const newName = nameEl.textContent.trim();
      await supabase.from('agents').update({ full_name:newName }).eq('id', id);
    });
    // status
    tr.querySelector('.ag-status').addEventListener('change', async (e)=>{
      await supabase.from('agents').update({ status:e.target.value }).eq('id', id);
    });
    // skills
    tr.querySelectorAll('.ag-skill').forEach(cb=>{
      cb.addEventListener('change', async (e)=>{
        const cls = e.target.classList.contains('can_call') ? 'can_call'
          : e.target.classList.contains('can_mail') ? 'can_mail'
          : e.target.classList.contains('can_chat') ? 'can_chat'
          : e.target.classList.contains('can_clienteling') ? 'can_clienteling'
          : e.target.classList.contains('can_fraud') ? 'can_fraud'
          : 'can_backoffice';
        const payload = { agent_id:id, [cls]: e.target.checked };
        await supabase.from('agent_skills').upsert(payload, { onConflict:'agent_id' });
      });
    });
    // PTO drawer
    tr.querySelector('.mini.primary').addEventListener('click', ()=>{
      openPtoDrawer(id, tr.querySelector('.ag-name').textContent.trim());
    });
    tr.querySelector('.mini.secondary').addEventListener('click', ()=>{
      openPtoDrawer(id, tr.querySelector('.ag-name').textContent.trim());
    });
    // delete
    tr.querySelector('.mini.danger').addEventListener('click', async ()=>{
      if (!confirm('Delete agent & related PTO/skills ?')) return;
      await supabase.from('agent_skills').delete().eq('agent_id', id);
      await supabase.from('agent_pto').delete().eq('agent_id', id);
      await supabase.from('agents').delete().eq('id', id);
      await renderAgentsTable();
    });
  });
}
async function onAddAgent(){
  const name = prompt('Agent full name ?'); if(!name) return;
  const region = agRegionSel.value;
  const { data, error } = await supabase.from('agents').insert({ full_name:name, region }).select('id').single();
  if (error) { alert(error.message); return; }
  await supabase.from('agent_skills').insert({ agent_id:data.id });
  await renderAgentsTable();
}
async function exportAgentsCSV(){
  const list = await fetchAgents(agRegionSel.value);
  let csv = "Name,Region,Status,Call,Mail,Chat,Clienteling,Fraud,Back Office\n";
  for (const a of list){
    csv += `"${a.full_name}",${a.region},${a.status},${a.skills.can_call},${a.skills.can_mail},${a.skills.can_chat},${a.skills.can_clienteling},${a.skills.can_fraud},${a.skills.can_backoffice}\n`;
  }
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href=url; link.download=`agents_${agRegionSel.value}.csv`; link.click();
  URL.revokeObjectURL(url);
}

/* PTO Drawer */
async function openPtoDrawer(agentId, agentName){
  PTO_DRAWER.agentId = agentId;
  PTO_DRAWER.agentName = agentName;
  PTO_DRAWER.title.textContent = `PTO for ${agentName}`;
  PTO_DRAWER.start.value=''; PTO_DRAWER.end.value='';
  PTO_DRAWER.halfStart.value=''; PTO_DRAWER.halfEnd.value='';
  await refreshPtoList();
  await renderPtoMiniCalendar();
  PTO_DRAWER.el.classList.add('open'); PTO_DRAWER.el.setAttribute('aria-hidden','false');
}
function closePtoDrawer(){ PTO_DRAWER.el.classList.remove('open'); PTO_DRAWER.el.setAttribute('aria-hidden','true'); }
async function refreshPtoList(){
  const { data, error } = await supabase
    .from('agent_pto')
    .select('id,start_date,end_date,half_day_start,half_day_end')
    .eq('agent_id', PTO_DRAWER.agentId)
    .order('start_date',{ascending:true});
  if (error){ console.error(error); return; }
  PTO_DRAWER.list.innerHTML = (data||[]).map(p=>{
    const label = `${p.start_date} ${p.half_day_start||'Full'} → ${p.end_date} ${p.half_day_end||'Full'}`;
    return `<li data-id="${p.id}">${label} <button class="mini danger" data-del="${p.id}">Delete</button></li>`;
  }).join('') || `<li class="muted">No PTO yet.</li>`;
  PTO_DRAWER.list.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      await supabase.from('agent_pto').delete().eq('id', btn.getAttribute('data-del'));
      await refreshPtoList(); await renderPtoMiniCalendar();
    });
  });
}
async function savePtoRange(){
  const start_date = PTO_DRAWER.start.value;
  const end_date   = PTO_DRAWER.end.value || start_date;
  const half_day_start = PTO_DRAWER.halfStart.value || null;
  const half_day_end   = PTO_DRAWER.halfEnd.value || null;
  if (!start_date) { alert('Select a start date'); return; }
  const { error } = await supabase.from('agent_pto').insert({
    agent_id:PTO_DRAWER.agentId, start_date, end_date, half_day_start, half_day_end
  });
  if (error){ alert(error.message); return; }
  await refreshPtoList(); await renderPtoMiniCalendar();
}
async function renderPtoMiniCalendar(){
  const now = new Date(); const y=now.getFullYear(), m=now.getMonth();
  const last = new Date(y,m+1,0); const days=last.getDate();
  const { data, error } = await supabase.from('agent_pto')
    .select('start_date,end_date,half_day_start,half_day_end')
    .eq('agent_id', PTO_DRAWER.agentId);
  if (error){ console.error(error); return; }
  function tag(iso){
    for (const p of (data||[])) if (iso>=p.start_date && iso<=p.end_date) return (p.half_day_start||p.half_day_end)?'half':'full';
    return null;
  }
  let html = `<div class="mini-cal-grid">`;
  for (let d=1; d<=days; d++){
    const iso = ymd(new Date(y,m,d));
    const t = tag(iso);
    html += `<div class="mini-cal-cell ${t==='full'?'pto':t==='half'?'pto-half':''}">${d}</div>`;
  }
  html += `</div>`;
  PTO_DRAWER.calendar.innerHTML = html;
}

async function initAgentsUI(){
  if (initAgentsUI._init) return;
  initAgentsUI._init = true;
  agRegionSel.value = 'EMEA';
  await renderAgentsTable();
  agRegionSel.addEventListener('change', renderAgentsTable);
  agAddBtn.addEventListener('click', onAddAgent);
  agExportBtn.addEventListener('click', exportAgentsCSV);
  PTO_DRAWER.closeBtn.addEventListener('click', closePtoDrawer);
  PTO_DRAWER.saveBtn.addEventListener('click', savePtoRange);
}

/* ======================================================================
   WEEKLY PLANNER (30’ slots) — calcul avancé
   ====================================================================== */
const Weekly = (()=>{
  const $ = (s)=>document.querySelector(s);
  const els = {
    region: ()=>$('#wp-region'),
    week:   ()=>$('#wp-week'),
    dayStart:()=>$('#wp-day-start'),
    dayEnd:  ()=>$('#wp-day-end'),
    load:    ()=>$('#wp-load'),
    exportBtn:()=>$('#wp-export'),
    grid:    ()=>$('#wp-grid'),
    agentsCount:()=>$('#wp-agents-count'),
    coverageAvg:()=>$('#wp-coverage-avg'),
    understaffed:()=>$('#wp-understaffed'),
  };
  const parseWeekInput = (val)=> {
    const [y, w] = val.split('-W').map(x=>parseInt(x,10)); return isoWeekToMondayUTC(y,w);
  };
  function isoWeekToMondayUTC(year, week){
    const simple = new Date(Date.UTC(year,0,4));
    const day = simple.getUTCDay()||7;
    const thursday = new Date(simple); thursday.setUTCDate(simple.getUTCDate() + (4 - day));
    const monday = new Date(thursday); monday.setUTCDate(thursday.getUTCDate() - 3 + (week-1)*7);
    monday.setUTCHours(0,0,0,0);
    return monday;
  }
  function addDays(d,n){ const x=new Date(d); x.setUTCDate(x.getUTCDate()+n); return x; }
  function minutesBetween(a,b){ const [ah,am]=a.split(':').map(Number), [bh,bm]=b.split(':').map(Number); return (bh*60+bm)-(ah*60+am); }
  function hhmmAdd(hhmm,delta){ let [h,m]=hhmm.split(':').map(Number); let t=h*60+m+delta; if(t<0)t=0; const nh=Math.floor(t/60), nm=t%60; return `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`; }

  async function computeDemand(region, mondayUTC, start, end){
    // Build slots
    const slots=[]; for(let cur=start; cur<end; cur=hhmmAdd(cur,30)) slots.push(cur);
    // Prepare
    const regs = await fetchRegulationMap(region);
    const ahtMap = Tasks.AHT();
    const demand = {}; // key date|hhmm -> minutes
    // Loop days
    for (let i=0;i<7;i++){
      const d = addDays(mondayUTC,i);
      const y=d.getUTCFullYear(), m=d.getUTCMonth()+1, day=d.getUTCDate();
      const wd = ((d.getUTCDay()+6)%7)+1; // 1..7
      const { annual, mShare, wShare, dShare } = await fetchTotalsAndShares(region, y, m, day);
      const totalDay = annual * mShare * wShare * dShare;

      // Task mix (par jour)
      const mix = await fetchDailyTaskMix(region, wd);

      // Hourly repartition (% du jour) — normalisée sur [start,end)
      const hourShares = ForecastStore.getHourlyShares(start, end); // Map(hhmm -> fraction)
      for (const hhmm of slots){
        const frac = hourShares.get(hhmm)||0;
        const volSlot = totalDay * frac; // contacts toutes tâches
        // minutes via task mix + AHT
        const minutes =
          (volSlot * (mix['Call']||0)        * (ahtMap['Call']||0)) +
          (volSlot * (mix['Mail']||0)        * (ahtMap['Mail']||0)) +
          (volSlot * (mix['Chat']||0)        * (ahtMap['Chat']||0)) +
          (volSlot * (mix['Clienteling']||0) * (ahtMap['Clienteling']||0)) +
          (volSlot * (mix['Fraud']||0)       * (ahtMap['Fraud']||0)) +
          (volSlot * (mix['Back Office']||0) * (ahtMap['Back Office']||0));
        demand[`${ymd(d)}|${hhmm}`] = minutes;
      }
    }
    return { slots, demand, regs };
  }

  async function computeCapacity(region, mondayUTC, start, end){
    const agents = await fetchAgentsWithPTO(region);
    const regs = await fetchRegulationMap(region);
    const netCapPerAgentMin = computeNetCapacityPerAgentMin(regs);
    const workWindowMin = Math.max(30, minutesBetween(start,end));
    const perAgentPerSlot = netCapPerAgentMin * (30 / workWindowMin); // proportion sur le slot

    const cap = {};
    const presentAgentsByDate = {};
    for (let i=0;i<7;i++){
      const d = addDays(mondayUTC,i);
      const dateISO = ymd(d);
      const present = agents.filter(a=> a.status==='Present' && !agentIsOffThatDate(a,dateISO));
      presentAgentsByDate[dateISO] = present.length;
      for (let cur=start; cur<end; cur=hhmmAdd(cur,30)){
        cap[`${dateISO}|${cur}`] = present.length * perAgentPerSlot;
      }
    }
    return { cap, presentAgentsByDate, agents, regs };
  }

  function renderGrid(days, slots, demand, cap, agents){
    const grid = els.grid(); if(!grid) return;
    let thead = `<thead><tr><th class="first-col">Row</th>${slots.map(s=>`<th class="slot-col ${s.endsWith(':00')?'hour-marker':''}">${s}</th>`).join('')}</tr></thead>`;
    let tbody = '';

    // Day rows (Demand vs Capacity)
    for (const dateISO of days){
      let row = `<tr><td class="first-col">${dateISO} — Demand vs Cap.</td>`;
      for (const s of slots){
        const key = `${dateISO}|${s}`;
        const dmin = demand[key]||0;
        const cmin = cap[key]||0;
        const cls = dmin > cmin ? 'gap' : (cmin > dmin ? 'over' : 'present');
        row += `<td><div class="cell ${cls}" title="Demand ${Math.round(dmin)}m / Cap ${Math.round(cmin)}m"></div></td>`;
      }
      row += `</tr>`;
      tbody += row;
    }

    // Agent availability rows
    agents.forEach(a=>{
      let row = `<tr><td class="first-col">${a.full_name}</td>`;
      for (const dateISO of days){
        const off = agentIsOffThatDate(a, dateISO);
        const cls = off ? 'pto' : 'present';
        for (let i=0;i<slots.length;i++) row += `<td><div class="cell ${cls}"></div></td>`;
      }
      row += `</tr>`;
      tbody += row;
    });

    grid.innerHTML = thead + `<tbody>${tbody}</tbody>`;
  }

  function renderSummaries(days, slots, demand, cap, presentAgentsByDate){
    const agentsAvg = Math.round(Object.values(presentAgentsByDate).reduce((a,b)=>a+b,0) / (Object.values(presentAgentsByDate).length||1));
    let totalD=0,totalC=0,gaps=0;
    for (const dateISO of days){
      for (const s of slots){
        const key=`${dateISO}|${s}`;
        const d=demand[key]||0, c=cap[key]||0;
        totalD+=d; totalC+=c; if (d>c) gaps++;
      }
    }
    const coverage = totalD>0 ? Math.min(100, Math.round((totalC/totalD)*100)) : 100;
    els.agentsCount().textContent = `${agentsAvg}`;
    els.coverageAvg().textContent = `${coverage}%`;
    els.understaffed().textContent = `${gaps}`;
  }

  async function load(){
    const region = els.region().value;
    const weekVal = els.week().value;
    const start = els.dayStart().value || '09:00';
    const end   = els.dayEnd().value   || '18:00';
    if (!weekVal) { alert('Sélectionne une semaine ISO'); return; }
    if (minutesBetween(start,end) < 30) { alert('La journée doit couvrir au moins 30 min'); return; }

    const monday = parseWeekInput(weekVal);
    const days = Array.from({length:7},(_,i)=> ymd(new Date(monday.getTime()+i*86400000)));

    const { slots, demand } = await computeDemand(region, monday, start, end);
    const { cap, presentAgentsByDate, agents } = await computeCapacity(region, monday, start, end);
    renderGrid(days, slots, demand, cap, agents);
    renderSummaries(days, slots, demand, cap, presentAgentsByDate);

    els.exportBtn().onclick = ()=> exportCSV(region, days, slots, demand, cap);
  }

  function exportCSV(region, days, slots, demand, cap){
    let csv = `Region,${region}\nSlot,Date,Time,Demand_Min,Capacity_Min\n`;
    let idx=1;
    for (const dateISO of days){
      for (const s of slots){
        const key=`${dateISO}|${s}`;
        csv += `${idx},${dateISO},${s},${Math.round(demand[key]||0)},${Math.round(cap[key]||0)}\n`;
        idx++;
      }
    }
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`weekly_planning_${region}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function init(){
    els.region().value = 'EMEA';
    const now = new Date();
    const week = isoWeekNumber(now);
    els.week().value = `${now.getFullYear()}-W${String(week).padStart(2,'0')}`;
    els.load().addEventListener('click', load);
  }
  return { init };
})();
async function initWeeklyUI(){ if (initWeeklyUI._init) return; initWeeklyUI._init=true; await Weekly.init(); }

/* ======================================================================
   REGULATION UI (CRUD local sur table public.regulations)
   ====================================================================== */
const RegulationUI = (()=>{
  const el = {
    tabPanel: document.getElementById('regulation'),
    enforceToggle: document.getElementById('enforceRegulationsToggle'),
    addRuleBtn: document.getElementById('addRuleBtn'),
    validateAllBtn: document.getElementById('validateAllBtn'),
    exportViolationsBtn: document.getElementById('exportViolationsBtn'),
    ruleSearch: document.getElementById('ruleSearch'),
    activeRulesCount: document.getElementById('activeRulesCount'),
    violationsCount: document.getElementById('violationsCount'),
    lastValidationAt: document.getElementById('lastValidationAt'),
    rulesTbody: document.getElementById('regulationTableBody'),
    violationsPanel: document.getElementById('violationsPanel'),
    violationsTbody: document.getElementById('violationsTableBody'),
    ruleModal: document.getElementById('ruleModal'),
    ruleForm: document.getElementById('ruleForm'),
    ruleModalTitle: document.getElementById('ruleModalTitle'),
    closeRuleModal: document.getElementById('closeRuleModal'),
    cancelRuleBtn: document.getElementById('cancelRuleBtn'),
    ruleId: document.getElementById('ruleId'),
    ruleName: document.getElementById('ruleName'),
    ruleType: document.getElementById('ruleType'),
    ruleParam1: document.getElementById('ruleParam1'),
    ruleParam2: document.getElementById('ruleParam2'),
    ruleParam1Label: document.getElementById('ruleParam1Label'),
    ruleParam2Label: document.getElementById('ruleParam2Label'),
    ruleScope: document.getElementById('ruleScope'),
    scopeTargetField: document.getElementById('scopeTargetField'),
    scopeTargetLabel: document.getElementById('scopeTargetLabel'),
    ruleScopeTarget: document.getElementById('ruleScopeTarget'),
    ruleSeverity: document.getElementById('ruleSeverity'),
    ruleActive: document.getElementById('ruleActive'),
    confirmDeleteModal: document.getElementById('confirmDeleteModal'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
  };
  let rules=[], filtered=[], violations=[];

  const fetchRegulations = async ()=>{
    const { data, error } = await supabase.from('regulations').select('*').order('created_at',{ascending:true});
    if (error){ console.warn(error.message); return []; }
    return data||[];
  };
  const upsertRule = async (payload)=>{
    const { data, error } = await supabase.from('regulations').upsert(payload).select().single();
    if (error) console.warn(error.message);
    return { data, error };
  };
  const deleteRule = async (id)=>{
    const { error } = await supabase.from('regulations').delete().eq('id', id);
    if (error) console.warn(error.message);
  };
  const fetchShifts = async ()=>{
    const { data } = await supabase.from('shifts').select('id,agent_id,start_time,end_time');
    return data||[];
  };
  const fetchPTO = async ()=>{
    const { data } = await supabase.from('pto').select('agent_id,start_date,end_date');
    return data||[];
  };
  const hoursBetween = (a,b)=> Math.abs((new Date(b)-new Date(a))/36e5);
  const getISOWeek = (date)=>{
    const d=new Date(date); d.setHours(0,0,0,0);
    d.setDate(d.getDate()+3-((d.getDay()+6)%7));
    const week1=new Date(d.getFullYear(),0,4);
    return 1 + Math.round(((d - week1)/86400000 - 3 + ((week1.getDay()+6)%7))/7);
  };
  const applyScope = (rule, item)=>{
    if (rule.scope==='AGENT'  && rule.scope_target) return String(item.agent_id)===String(rule.scope_target);
    if (rule.scope==='REGION' && rule.scope_target) return true; // non géré dans ce proto
    return true;
  };

  const runValidation = (rulesActive, shifts, ptoList=[])=>{
    const out=[];
    const byAgent = {};
    shifts.forEach(s => { if(!byAgent[s.agent_id]) byAgent[s.agent_id]=[]; byAgent[s.agent_id].push(s); });
    Object.values(byAgent).forEach(list=> list.sort((a,b)=> new Date(a.start_time)-new Date(b.start_time)));

    const ptoMap={}; ptoList.forEach(p=>{ if(!ptoMap[p.agent_id]) ptoMap[p.agent_id]=[]; ptoMap[p.agent_id].push([new Date(p.start_date), new Date(p.end_date)]); });

    const active = rulesActive.filter(r=>r.active);

    // MAX_HOURS_PER_WEEK
    const maxWeek = active.filter(r=>r.type==='MAX_HOURS_PER_WEEK' && r.param1);
    if (maxWeek.length){
      const weekHours={};
      shifts.forEach(s=>{
        const st=new Date(s.start_time), et=new Date(s.end_time);
        const hrs=Math.max(0,(et-st)/36e5);
        const week=getISOWeek(st); const key=`${s.agent_id}|${st.getUTCFullYear()}|${week}`;
        weekHours[key]=(weekHours[key]||0)+hrs;
      });
      for (const rule of maxWeek){
        for (const key in weekHours){
          const [agent_id,year,week]=key.split('|'); const total=weekHours[key];
          if (!applyScope(rule,{agent_id})) continue;
          if (total>Number(rule.param1)){
            out.push({ rule:rule.name, agent_id, shift:`Week ${week} ${year}`, detail:`${total.toFixed(1)}h > ${Number(rule.param1)}h`, severity:rule.severity||'WARN' });
          }
        }
      }
    }

    // MIN_REST_BETWEEN_SHIFTS
    const restRules = active.filter(r=>r.type==='MIN_REST_BETWEEN_SHIFTS' && r.param1);
    if (restRules.length){
      for (const agent in byAgent){
        const list=byAgent[agent];
        for (let i=1;i<list.length;i++){
          const prev=list[i-1], cur=list[i];
          const restH=hoursBetween(prev.end_time, cur.start_time);
          for (const rule of restRules){
            if (!applyScope(rule,{agent_id:agent})) continue;
            if (restH<Number(rule.param1)){
              out.push({ rule:rule.name, agent_id:agent, shift:`${new Date(cur.start_time).toLocaleString()}`, detail:`Rest ${restH.toFixed(1)}h < ${Number(rule.param1)}h`, severity:rule.severity||'WARN' });
            }
          }
        }
      }
    }

    // NO_OVERLAP_SHIFTS
    const noOverlap = active.filter(r=>r.type==='NO_OVERLAP_SHIFTS');
    if (noOverlap.length){
      for (const agent in byAgent){
        const list=byAgent[agent];
        for (let i=1;i<list.length;i++){
          const prev=list[i-1], cur=list[i];
          if (new Date(cur.start_time) < new Date(prev.end_time)){
            for (const rule of noOverlap){
              if (!applyScope(rule,{agent_id:agent})) continue;
              out.push({ rule:rule.name, agent_id:agent, shift:`${new Date(cur.start_time).toLocaleString()}`, detail:`Overlap with previous shift`, severity:rule.severity||'BLOCK' });
            }
          }
        }
      }
    }

    // NO_PTO_OVERBOOKING
    const ptoRules = active.filter(r=>r.type==='NO_PTO_OVERBOOKING');
    if (ptoRules.length){
      for (const agent in byAgent){
        const list=byAgent[agent]; const ranges=ptoMap[agent]||[];
        if (!ranges.length) continue;
        for (const s of list){
          const st=new Date(s.start_time), et=new Date(s.end_time);
          for (const [pst,pet] of ranges){
            const overlap = st<pet && et>pst;
            if (overlap){
              for (const rule of ptoRules){
                if (!applyScope(rule,{agent_id:agent})) continue;
                out.push({ rule:rule.name, agent_id:agent, shift:`${st.toLocaleString()}`, detail:`Shift overlaps PTO (${pst.toISOString().slice(0,10)}→${pet.toISOString().slice(0,10)})`, severity:rule.severity||'BLOCK' });
              }
            }
          }
        }
      }
    }
    return out;
  };

  const renderRules = ()=>{
    const list = filtered.length ? filtered : rules;
    el.rulesTbody.innerHTML = list.map(r=>{
      const status = r.active ? '<span class="badge success">Actif</span>' : '<span class="badge muted">Inactif</span>';
      const params = [r.param1, r.param2].filter(x=> x!=null && x!=='').join(' · ') || '—';
      const scope = r.scope==='GLOBAL' ? 'Global' : `${r.scope} : ${r.scope_target||'—'}`;
      return `<tr data-id="${r.id||''}">
        <td>${r.name||'—'}</td>
        <td>${r.type||'—'}</td>
        <td>${params}</td>
        <td>${scope}</td>
        <td>${status}</td>
        <td><div class="row-actions">
          <button class="mini js-edit">Edit</button>
          <button class="mini danger js-delete">Delete</button>
        </div></td>
      </tr>`;
    }).join('') || `<tr><td colspan="6">—</td></tr>`;
    el.activeRulesCount.textContent = (rules||[]).filter(r=>r.active).length;
    attachRowActions();
  };
  const attachRowActions = ()=>{
    el.rulesTbody.querySelectorAll('.js-edit').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const tr = btn.closest('tr'); const id = tr?.dataset?.id;
        const r = rules.find(x=> String(x.id)===String(id));
        openRuleModal(r||null);
      });
    });
    el.rulesTbody.querySelectorAll('.js-delete').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const tr=btn.closest('tr'); const id=tr?.dataset?.id;
        el.confirmDeleteModal.showModal();
        el.confirmDeleteBtn.onclick = async ()=>{
          await deleteRule(id); el.confirmDeleteModal.close();
          rules = await fetchRegulations(); renderRules();
        };
        el.cancelDeleteBtn.onclick = ()=> el.confirmDeleteModal.close();
      });
    });
  };
  const openRuleModal = (rule=null)=>{
    el.ruleForm.reset(); el.ruleId.value=''; el.ruleScope.value='GLOBAL'; toggleScope();
    el.ruleActive.checked=true; el.ruleSeverity.value='WARN';
    if (rule){
      el.ruleModalTitle.textContent = 'Éditer la règle';
      el.ruleId.value = rule.id||'';
      el.ruleName.value = rule.name||'';
      el.ruleType.value = rule.type||'';
      el.ruleParam1.value = rule.param1??'';
      el.ruleParam2.value = rule.param2??'';
      el.ruleScope.value  = rule.scope||'GLOBAL'; toggleScope();
      el.ruleScopeTarget.value = rule.scope_target||'';
      el.ruleSeverity.value = rule.severity||'WARN';
      el.ruleActive.checked = !!rule.active;
      updateParamLabels();
    } else {
      el.ruleModalTitle.textContent = 'Nouvelle règle';
    }
    el.ruleModal.showModal();
  };
  const toggleScope = ()=>{
    const s = el.ruleScope.value;
    if (s==='GLOBAL'){ el.scopeTargetField.hidden=true; el.ruleScopeTarget.value=''; }
    else if (s==='REGION'){ el.scopeTargetField.hidden=false; el.scopeTargetLabel.textContent='Code Région'; }
    else { el.scopeTargetField.hidden=false; el.scopeTargetLabel.textContent='Agent ID'; }
  };
  const updateParamLabels = ()=>{
    const t = el.ruleType.value;
    if (t==='MAX_HOURS_PER_WEEK'){ el.ruleParam1Label.textContent='Heures max / semaine'; el.ruleParam2Label.textContent='Optionnel'; }
    else if (t==='MIN_REST_BETWEEN_SHIFTS'){ el.ruleParam1Label.textContent='Repos minimum (heures)'; el.ruleParam2Label.textContent='Optionnel'; }
    else { el.ruleParam1Label.textContent='Paramètre 1'; el.ruleParam2Label.textContent='Paramètre 2'; }
  };
  const applySearch = ()=>{
    const q=(el.ruleSearch.value||'').toLowerCase().trim();
    if (!q){ filtered=[]; renderRules(); return; }
    filtered = rules.filter(r=>{
      const hay = `${r.name||''} ${r.type||''} ${r.scope||''} ${r.scope_target||''}`.toLowerCase();
      return hay.includes(q);
    });
    renderRules();
  };
  const exportViolationsCSV = ()=>{
    if (!violations.length) return;
    const headers=['regle','agent','shift','detail','gravite'];
    const lines=[headers.join(',')].concat(
      violations.map(v=>[
        `"${String(v.rule).replace(/"/g,'""')}"`,
        `"${String(v.agent_id).replace(/"/g,'""')}"`,
        `"${String(v.shift).replace(/"/g,'""')}"`,
        `"${String(v.detail).replace(/"/g,'""')}"`,
        `"${String(v.severity).replace(/"/g,'""')}"`
      ].join(','))
    );
    const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=`violations_${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const init = async ()=>{
    if (!el.tabPanel) return;
    if (init._init) return;
    init._init = true;

    el.addRuleBtn?.addEventListener('click', ()=> openRuleModal(null));
    el.closeRuleModal?.addEventListener('click', (e)=>{ e.preventDefault(); el.ruleModal.close(); });
    el.cancelRuleBtn?.addEventListener('click', (e)=>{ e.preventDefault(); el.ruleModal.close(); });
    el.ruleType?.addEventListener('change', updateParamLabels);
    el.ruleScope?.addEventListener('change', toggleScope);

    el.ruleForm?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const payload = {
        id: el.ruleId.value || undefined,
        name: el.ruleName.value?.trim(),
        type: el.ruleType.value,
        param1: el.ruleParam1.value ? Number(el.ruleParam1.value) : null,
        param2: el.ruleParam2.value ? Number(el.ruleParam2.value) : null,
        scope: el.ruleScope.value || 'GLOBAL',
        scope_target: el.ruleScopeTarget.value?.trim() || null,
        severity: el.ruleSeverity.value || 'WARN',
        active: !!el.ruleActive.checked,
      };
      await upsertRule(payload);
      el.ruleModal.close();
      rules = await fetchRegulations(); renderRules();
    });

    el.ruleSearch?.addEventListener('input', applySearch);
    el.enforceToggle?.addEventListener('change', ()=>{
      localStorage.setItem('pm_enforce_regulations', el.enforceToggle.checked?'true':'false');
    });

    el.validateAllBtn?.addEventListener('click', async ()=>{
      const active = rules.filter(r=>r.active);
      const [shifts, pto] = await Promise.all([fetchShifts(), fetchPTO()]);
      violations = runValidation(active, shifts, pto);
      el.violationsCount.textContent = String(violations.length);
      el.lastValidationAt.textContent = new Date().toLocaleString();
      el.violationsPanel.hidden = violations.length===0;
      el.violationsTbody.innerHTML = violations.map(v=>`
        <tr><td>${v.rule}</td><td>${v.agent_id}</td><td>${v.shift}</td><td>${v.detail}</td><td>${v.severity}</td></tr>
      `).join('');
    });
    el.exportViolationsBtn?.addEventListener('click', exportViolationsCSV);

    // initial
    const enforce = localStorage.getItem('pm_enforce_regulations')==='true';
    el.enforceToggle.checked = enforce;

    rules = await fetchRegulations();
    renderRules();
  };

  return { init };
})();

/* ======================================================================
   BOOT minimal (aucune auth)
   ====================================================================== */
window.addEventListener('load', ()=>{
  // Tab par défaut (Attendance) se charge via Tabs handler
});
