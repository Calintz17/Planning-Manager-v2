/* ======================================================================
   ROMAN — Planning Manager (no-auth, Supabase facultatif)
   - Tabs handler unique
   - Attendance (mensuel)
   - Agents + Skills + PTO Drawer
   - Weekly Planner (30 min slots)
   - Tasks (localStorage, par région)
   - Forecast Store (lazy-safe: LS + DB si dispo)
   - Regulation (table simple locale, sans auth)
   ====================================================================== */

/* ---------- Supabase client (optionnel) ---------- */
let supabase = null;
(function initSupabase(){
  try {
    if (window.supabase && window.CONFIG?.SUPABASE_URL && window.CONFIG?.SUPABASE_ANON_KEY) {
      supabase = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY);
    }
  } catch(_) { /* noop */ }
})();

/* ======================================================================
   TABS HANDLER — unique & robuste
   ====================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const btns   = Array.from(document.querySelectorAll('.tab-btn'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));

  const showTab = (id) => {
    panels.forEach(p => { (p.id === id) ? p.removeAttribute('hidden') : p.setAttribute('hidden',''); });
    btns.forEach(b => b.classList.toggle('active', b.dataset.tab === id));

    // Lazy init, safe
    try {
      if (id === 'attendance') initAttendanceUI();
      if (id === 'agents')     initAgentsUI();
      if (id === 'weekly')     initWeeklyUI();
      if (id === 'forecast')   ForecastStore.init(getRegionSelValue('fc-region'));
      if (id === 'tasks')      Tasks.init();
      if (id === 'regulation') Regulation.init();
    } catch(e){ console.error(e); }
  };

  btns.forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  const initial = btns.find(b => b.classList.contains('active'))?.dataset.tab || panels[0]?.id;
  if (initial) showTab(initial);
});

/* ======================================================================
   UTILITAIRES COMMUNS
   ====================================================================== */
const REGIONS = ['EMEA','US','CN','JP','KR','SEAO'];

function getDefaultRegion(){
  return localStorage.getItem('roman_default_region') || 'EMEA';
}
function setDefaultRegion(code){
  localStorage.setItem('roman_default_region', code);
}
function getRegionSelValue(id){
  const el = document.getElementById(id);
  return el?.value || getDefaultRegion();
}
function isoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}
function ymd(date){ return date.toISOString().slice(0,10); }
function clamp01(x){ return Math.min(1, Math.max(0, x)); }
function parsePct(val){ if (val == null || val === '') return 0; return parseFloat(String(val).replace(',','.')) || 0; }

/* ======================================================================
   FORECAST STORE — lazy-safe (LS + DB si dispo)
   ====================================================================== */
window.ForecastStore = (() => {
  const PREFIX = 'roman_forecast_v2:';
  const REGION_DEFAULT = 'EMEA';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  let region = REGION_DEFAULT;
  let state  = null;

  const key = (reg) => `${PREFIX}${reg}`;
  const blank = () => ({
    total: '',
    monthly: Object.fromEntries(MONTHS.map(m => [m, ''])),
    weekly:  Object.fromEntries(Array.from({length:53}, (_,i)=>[String(i+1), ''])),
    daily:   Object.fromEntries(DAYS.map(d => [d, ''])),
    hourly:  Object.fromEntries(Array.from({length:24}, (_,h)=>[`${String(h).padStart(2,'0')}:00`, '']))
  });
  const loadLS = (reg) => {
    try { return Object.assign(blank(), JSON.parse(localStorage.getItem(key(reg)) || '{}')); }
    catch { return blank(); }
  };
  const saveLS = () => localStorage.setItem(key(region), JSON.stringify(state));

  // DB fetchers (tolérants)
  async function fetchTotalFromDB(reg){
    if (!supabase) return null;
    const { data, error } = await supabase.from('forecast_totals')
      .select('total_volume').eq('region', reg).maybeSingle();
    if (error) return null;
    return data?.total_volume ?? null;
  }
  async function fetchMonthlyFromDB(reg){
    if (!supabase) return null;
    const { data, error } = await supabase.from('forecast_monthly')
      .select('month_index, share_percent').eq('region', reg).order('month_index');
    if (error || !data?.length) return null;
    const m = {};
    data.forEach(r => m[MONTHS[r.month_index-1]] = String(r.share_percent));
    return m;
  }
  async function fetchWeeklyFromDB(reg){
    if (!supabase) return null;
    const { data, error } = await supabase.from('forecast_weekly')
      .select('week_index, share_percent').eq('region', reg).order('week_index');
    if (error || !data?.length) return null;
    const w = {};
    data.forEach(r => w[String(r.week_index)] = String(r.share_percent));
    return w;
  }
  async function fetchDailyFromDB(reg){
    if (!supabase) return null;
    const { data, error } = await supabase.from('forecast_daily')
      .select('weekday, share_percent').eq('region', reg).order('weekday');
    if (error || !data?.length) return null;
    const map = {1:'Mon',2:'Tue',3:'Wed',4:'Thu',5:'Fri',6:'Sat',7:'Sun'};
    const d = {};
    data.forEach(r => d[map[r.weekday]] = String(r.share_percent));
    return d;
  }
  async function fetchHourlyFromDB(reg){
    if (!supabase) return null;
    const { data, error } = await supabase.from('forecast_hourly')
      .select('hhmm, share_percent').eq('region', reg).order('hhmm');
    if (error || !data?.length) return null;
    const h = {};
    data.forEach(r => h[r.hhmm] = String(r.share_percent));
    return h;
  }

  async function ensure(reg = region) {
    if (state) return;
    region = reg || REGION_DEFAULT;
    state = loadLS(region);

    try {
      const [t, m, w, d, h] = await Promise.all([
        fetchTotalFromDB(region), fetchMonthlyFromDB(region),
        fetchWeeklyFromDB(region), fetchDailyFromDB(region),
        fetchHourlyFromDB(region)
      ]);
      if (t != null) state.total = String(t);
      if (m) state.monthly = Object.assign(state.monthly, m);
      if (w) state.weekly  = Object.assign(state.weekly,  w);
      if (d) state.daily   = Object.assign(state.daily,   d);
      if (h) state.hourly  = Object.assign(state.hourly,  h);
      saveLS();
    } catch(_) { /* fallback LS */ }
  }

  async function init(reg){ region = reg || region; await ensure(region); }
  async function ready(){ await ensure(); }

  // getters safe
  function getTotal(){ if (!state) state = loadLS(region); return Number(String(state.total).replace(',','.')) || 0; }
  function getMonthlyShare(idx){ if (!state) state = loadLS(region); return parsePct(state.monthly[['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][idx-1]]); }
  function getWeeklyShare(idx){ if (!state) state = loadLS(region); return parsePct(state.weekly[String(idx)]); }
  function getDailyShare(name){ if (!state) state = loadLS(region); return parsePct(state.daily[name]); }
  function getHourlyShare(hhmm){ if (!state) state = loadLS(region); return parsePct(state.hourly[hhmm]); }

  return { init, ready, getTotal, getMonthlyShare, getWeeklyShare, getDailyShare, getHourlyShare };
})();

/* ======================================================================
   TASKS (localStorage par région) — AHT + priorité + enable
   ====================================================================== */
window.Tasks = (() => {
  const LS_PREFIX = 'roman_tasks_v2:';
  const REGION_DEFAULT = 'EMEA';
  const DEFAULT_ROWS = [
    { key:'call',         label:'Call',          priority:'P1', aht:7,  enabled:true,  notes:'' },
    { key:'mail',         label:'Mail',          priority:'P2', aht:8,  enabled:true,  notes:'' },
    { key:'chat',         label:'Chat',          priority:'P1', aht:3,  enabled:true,  notes:'' },
    { key:'clienteling',  label:'Clienteling',   priority:'P3', aht:15, enabled:true,  notes:'' },
    { key:'backoffice',   label:'Back Office',   priority:'P2', aht:15, enabled:true,  notes:'' },
    { key:'fraud',        label:'Fraud',         priority:'P1', aht:10, enabled:true,  notes:'' },
    { key:'lunch',        label:'Lunch Break',   priority:'Mandatory', aht:60, enabled:true, notes:'' },
    { key:'break',        label:'Break',         priority:'Mandatory', aht:15, enabled:true, notes:'' },
    { key:'morningbrief', label:'Morning Brief', priority:'P3', aht:15, enabled:true,  notes:'' },
    { key:'training',     label:'Training',      priority:'P3', aht:1,  enabled:true,  notes:'' },
  ];
  const els = {
    panel:   () => document.getElementById('tasksPanel'),
    region:  () => document.getElementById('task-region'),
    search:  () => document.getElementById('task-search'),
    fPrio:   () => document.getElementById('task-filter-priority'),
    tbody:   () => document.getElementById('tasksTbody'),
    counters:() => document.getElementById('task-counters'),
    createBtn:() => document.getElementById('createTaskBtn'),
  };
  const key = (reg) => `${LS_PREFIX}${reg||REGION_DEFAULT}`;
  const clone = (x)=> JSON.parse(JSON.stringify(x));

  let region = REGION_DEFAULT;
  let rows = [];

  const load = (reg) => {
    const raw = localStorage.getItem(key(reg));
    if (!raw) return clone(DEFAULT_ROWS);
    try { const arr = JSON.parse(raw); return Array.isArray(arr)?arr:clone(DEFAULT_ROWS); }
    catch { return clone(DEFAULT_ROWS); }
  };
  const save = () => localStorage.setItem(key(region), JSON.stringify(rows));

  const render = () => {
    const tb = els.tbody(); if (!tb) return;
    const q = (els.search()?.value || '').toLowerCase().trim();
    const fp = (els.fPrio()?.value || '');
    const list = rows.filter(r => {
      if (q && !(r.label.toLowerCase().includes(q) || (r.notes||'').toLowerCase().includes(q))) return false;
      if (fp && r.priority !== fp) return false;
      return true;
    });
    tb.innerHTML = list.map(r => `
      <tr data-row="${r.key}">
        <td><input type="text" value="${escapeHtml(r.label)}" data-key="${r.key}" data-field="label"></td>
        <td>
          <select data-key="${r.key}" data-field="priority">
            ${['P1','P2','P3','Mandatory'].map(p=>`<option value="${p}" ${p===r.priority?'selected':''}>${p}</option>`).join('')}
          </select>
        </td>
        <td><input type="number" min="0" step="1" value="${Number(r.aht)||0}" data-key="${r.key}" data-field="aht"></td>
        <td>
          <label class="switch">
            <input type="checkbox" ${r.enabled?'checked':''} data-key="${r.key}" data-field="enabled">
            <span class="slider"></span>
          </label>
        </td>
        <td><input type="text" value="${escapeHtml(r.notes||'')}" data-key="${r.key}" data-field="notes"></td>
        <td class="row-actions"><button type="button" class="mini danger" data-action="delete" data-key="${r.key}">Delete</button></td>
      </tr>
    `).join('') || `<tr><td colspan="6" class="muted">No tasks.</td></tr>`;

    tb.querySelectorAll('input[data-key], select[data-key]').forEach(inp=>{
      inp.addEventListener('input', onCellChange);
      inp.addEventListener('change', onCellChange);
    });
    tb.querySelectorAll('[data-action="delete"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const k = btn.dataset.key;
        rows = rows.filter(x => x.key !== k);
        save(); render();
      });
    });
    const cnt = els.counters(); if (cnt) {
      const enabled = rows.filter(r=>r.enabled).length;
      cnt.innerHTML = `Region: <b>${region}</b> · Tasks: <b>${rows.length}</b> · Enabled: <b>${enabled}</b>`;
    }
  };
  const onCellChange = (e) => {
    const el = e.target;
    const k = el.dataset.key, f = el.dataset.field;
    const idx = rows.findIndex(x => x.key === k);
    if (idx === -1) return;
    let v = el.value;
    if (f === 'enabled') v = el.checked;
    if (f === 'aht') v = Number(v)||0;
    rows[idx][f] = v;
    save();
  };
  const escapeHtml = (s='') => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const init = () => {
    const panel = els.panel(); if (!panel) return;
    const rSel = els.region();
    const prev = getDefaultRegion();
    if (rSel) {
      rSel.value = prev;
      rSel.addEventListener('change', ()=>{ setDefaultRegion(rSel.value); region = rSel.value; rows = load(region); render(); });
    }
    region = rSel?.value || prev;
    rows = load(region);
    els.search()?.addEventListener('input', render);
    els.fPrio()?.addEventListener('change', render);
    els.createBtn()?.addEventListener('click', ()=>{
      const name = prompt('New task name?'); if (!name) return;
      const safeKey = name.toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,24) || ('task'+Date.now());
      rows.push({ key:safeKey, label:name, priority:'P3', aht:5, enabled:true, notes:'' });
      save(); render();
    });
    render();
  };

  const getAHT = () => {
    const map = {};
    (rows||[]).forEach(r => map[r.label] = Number(r.aht)||0);
    // alias
    map['Back Office'] = map['Back Office'] ?? map['backoffice'] ?? 15;
    return map;
  };

  return { init, getAHT };
})();

/* ======================================================================
   ATTENDANCE — couverture mensuelle
   ====================================================================== */
function firstDayOfCurrentMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

const att = {
  regionSel:  () => document.getElementById('att-region'),
  startInput: () => document.getElementById('att-start'),
  calcBtn:    () => document.getElementById('att-calc'),
  label:      () => document.getElementById('adherence-label'),
  fill:       () => document.getElementById('adherence-fill'),
  table:      () => document.getElementById('att-table'),
  warns:      () => document.getElementById('att-warnings'),
  exportBtn:  () => document.getElementById('att-export'),
};

async function fetchAgentsWithPTO(region) {
  if (!supabase) return []; // dégradé
  const [{ data: agents }, { data: pto }] = await Promise.all([
    supabase.from('agents').select('id, full_name, region, status').eq('region', region).order('full_name'),
    supabase.from('agent_pto').select('agent_id, start_date, end_date, half_day_start, half_day_end'),
  ]);
  const byId = {};
  (agents||[]).forEach(a => byId[a.id] = { ...a, pto: [] });
  (pto||[]).forEach(p => { if (byId[p.agent_id]) byId[p.agent_id].pto.push(p); });
  return Object.values(byId);
}
function agentIsOffThatDate(agent, dateISO) {
  for (const p of agent.pto || []) if (dateISO >= p.start_date && dateISO <= p.end_date) return true;
  return false;
}
async function fetchDailyTaskPct(region, weekdayName){
  if (!supabase) {
    // fallback: simple mix par défaut (Europe-like)
    return { Call:30/100, Mail:28/100, Chat:0, Clienteling:4/100, Fraud:2/100, "Back Office":36/100 };
  }
  // On prend les pourcentages par canal depuis forecast_daily si dispo, sinon fallback
  const mapDay = {Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7};
  const wd = mapDay[weekdayName];
  const { data, error } = await supabase.from('forecast_daily')
    .select('email_pct, call_pct, chat_pct, clienteling_pct, fraud_pct, admin_pct')
    .eq('region', region).eq('weekday', wd).maybeSingle();
  if (error || !data) return { Call:30/100, Mail:28/100, Chat:0, Clienteling:4/100, Fraud:2/100, "Back Office":36/100 };
  return {
    Mail: (Number(data.email_pct)||0)/100,
    Call: (Number(data.call_pct)||0)/100,
    Chat: (Number(data.chat_pct)||0)/100,
    Clienteling: (Number(data.clienteling_pct)||0)/100,
    Fraud: (Number(data.fraud_pct)||0)/100,
    "Back Office": (Number(data.admin_pct)||0)/100,
  };
}
function computeNetCapacityPerAgentMin() {
  // Règles minimales : 8h/jour, 60’ lunch, 2x15’ breaks
  const workMin = 8*60;
  const breaks  = 2*15;
  return Math.max(0, workMin - 60 - breaks); // 360 min
}
function sumDemandMinutes(totalVolumeDay, dailyTaskPct, AHT) {
  const keys = ["Call","Mail","Chat","Clienteling","Fraud","Back Office"];
  let minutes = 0;
  for (const k of keys) {
    const pct = dailyTaskPct[k] ?? 0;
    const aht = AHT[k] ?? 0;
    const count = totalVolumeDay * pct;
    minutes += count * aht;
  }
  return minutes;
}
async function calcAttendance(region, startISO) {
  await ForecastStore.ready(); // garantit state
  const start = new Date(startISO);
  const year = start.getFullYear();
  const month = start.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  const AHT = Tasks.getAHT();
  const netCapPerAgentMin = computeNetCapacityPerAgentMin();
  const agents = await fetchAgentsWithPTO(region);

  const results = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dateISO = date.toISOString().slice(0,10);
    const week = isoWeekNumber(date);
    const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()];
    const weekdayName = weekday === 'Sun' ? 'Sun' : weekday; // align

    const total = ForecastStore.getTotal();
    const m = ForecastStore.getMonthlyShare(month) / 100;
    const w = ForecastStore.getWeeklyShare(week) / 100 || (1/52);
    const d = ForecastStore.getDailyShare(weekdayName) / 100 || (1/7);

    const totalDay = total * m * w * d;

    const dailyTaskPct = await fetchDailyTaskPct(region, weekdayName);
    const demandMin = sumDemandMinutes(totalDay, dailyTaskPct, AHT);
    const available = agents.filter(a => a.status === "Present" && !agentIsOffThatDate(a, dateISO)).length;
    const required = (netCapPerAgentMin > 0) ? Math.ceil(demandMin / netCapPerAgentMin) : 0;
    const adherence = required > 0 ? Math.min(100, Math.round((available / required) * 100)) : 100;
    results.push({ dateISO, day, available, required, adherence });
  }
  return { results, agents, netCapPerAgentMin };
}
function renderAttendanceGrid(region, calc) {
  const { results, agents } = calc;
  const table = att.table(); if (!table) return;

  let thead = `<thead><tr><th class="first-col">Agent</th>`;
  for (const c of results) {
    const flag = c.required > c.available ? `<span class="warn-flag">/!\\</span>` : "";
    thead += `<th><div class="day-head">${c.day}</div>${flag}<div class="req-available">${c.available}/${c.required}</div></th>`;
  }
  thead += `</tr></thead>`;

  let tbody = `<tbody>`;
  for (const a of agents) {
    tbody += `<tr><td class="first-col" title="${a.status??''}">${a.full_name??'-'}</td>`;
    for (const c of results) {
      const off = agentIsOffThatDate(a, c.dateISO);
      const cls = off ? 'cell-pto' : 'cell-present';
      tbody += `<td class="${cls}"></td>`;
    }
    tbody += `</tr>`;
  }
  tbody += `</tbody>`;
  table.innerHTML = thead + tbody;

  const warnDays = results.filter(r => r.required > r.available);
  att.warns().innerHTML = warnDays.length
    ? warnDays.map(w => `<span class="warn-flag">/!\\ D${w.day}</span>`).join(" ")
    : "All days fully staffed ✅";

  att.exportBtn()?.addEventListener('click', () => exportAttendanceToCSV(region, results, agents), { once:true });
}
function renderAdherenceSummary(results) {
  if (!results.length) { att.label().textContent = "– %"; att.fill().style.width = "0%"; return; }
  const avg = Math.round(results.reduce((s, r) => s + r.adherence, 0) / results.length);
  att.label().textContent = `${avg}%`;
  att.fill().style.width = `${Math.min(100, Math.max(0, avg))}%`;
}
async function runAttendance() {
  const region = att.regionSel().value;
  const startISO = att.startInput().value;
  await ForecastStore.init(region);
  const calc = await calcAttendance(region, startISO);
  renderAttendanceGrid(region, calc);
  renderAdherenceSummary(calc.results);
}
function exportAttendanceToCSV(region, results, agents) {
  let csv = `Region,${region}\n\nAgent`;
  for (const c of results) csv += `,Day ${c.day}`;
  csv += "\n";
  for (const a of agents) {
    csv += `"${a.full_name??'-'}"`;
    for (const c of results) {
      const off = agentIsOffThatDate(a, c.dateISO);
      csv += `,${off ? "PTO" : "Present"}`;
    }
    csv += "\n";
  }
  csv += "\nDay,Available,Required,Adherence\n";
  for (const c of results) csv += `${c.day},${c.available},${c.required},${c.adherence}%\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `attendance_${region}_${new Date().toISOString().slice(0,10)}.csv`; link.click();
  URL.revokeObjectURL(url);
}
async function initAttendanceUI() {
  if (!att.regionSel()) return;
  att.regionSel().value = getDefaultRegion();
  att.startInput().value = firstDayOfCurrentMonthISO();
  att.calcBtn()?.addEventListener('click', runAttendance);
  await runAttendance();
}

/* ======================================================================
   AGENTS + PTO (dégradé si pas de DB)
   ====================================================================== */
const ag = {
  region: ()=>document.getElementById("ag-region"),
  addBtn: ()=>document.getElementById("ag-add"),
  exportBtn: ()=>document.getElementById("ag-export"),
  tbody: ()=>document.querySelector("#ag-table tbody"),

  drawer: {
    el: document.getElementById("pto-drawer"),
    title: document.getElementById("pto-title"),
    closeBtn: document.getElementById("pto-close"),
    start: document.getElementById("pto-start"),
    end: document.getElementById("pto-end"),
    saveBtn: document.getElementById("pto-save"),
    list: document.getElementById("pto-list"),
    calendar: document.getElementById("pto-calendar"),
    agentId: null, agentName: null
  }
};
async function fetchAgents(region) {
  if (!supabase) return [];
  const { data, error } = await supabase.from("agents")
    .select("id, full_name, region, status")
    .eq("region", region).order("full_name");
  if (error) return [];
  return data || [];
}
async function renderAgentsTable(){
  const tb = ag.tbody(); if (!tb) return;
  const region = ag.region().value;
  const rows = await fetchAgents(region);
  if (!rows.length) { tb.innerHTML = `<tr><td colspan="6">No agents yet.</td></tr>`; return; }
  tb.innerHTML = rows.map(r=>`
    <tr data-id="${r.id}">
      <td>${r.full_name}</td>
      <td>${r.region}</td>
      <td>${r.status}</td>
      <td><button class="mini primary js-pto">PTO</button></td>
      <td><button class="mini secondary js-cal">📅</button></td>
      <td><button class="mini danger js-del">Delete</button></td>
    </tr>
  `).join('');
  tb.querySelectorAll('.js-pto').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const tr = e.target.closest('tr'); openPtoDrawer(tr.dataset.id, tr.children[0].textContent);
    });
  });
  tb.querySelectorAll('.js-del').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const tr = e.target.closest('tr'); const id = tr.dataset.id;
      if (!confirm('Delete agent?')) return;
      await supabase.from('agent_pto').delete().eq('agent_id', id);
      await supabase.from('agents').delete().eq('id', id);
      renderAgentsTable();
    });
  });
}
async function onAddAgent(){
  if (!supabase) return alert('Supabase not configured.');
  const name = prompt('Agent full name?'); if (!name) return;
  const region = ag.region().value;
  const { error } = await supabase.from('agents').insert({ full_name:name, region, status:'Present' });
  if (error) return alert(error.message);
  renderAgentsTable();
}
async function openPtoDrawer(agentId, name){
  Object.assign(ag.drawer, { agentId, agentName: name });
  ag.drawer.title.textContent = `PTO — ${name}`;
  ag.drawer.start.value = ''; ag.drawer.end.value = '';
  await refreshPtoList(); await renderPtoCalendar();
  ag.drawer.el.classList.add('open');
}
function closePtoDrawer(){ ag.drawer.el.classList.remove('open'); }
async function refreshPtoList(){
  if (!supabase) return ag.drawer.list.innerHTML = `<li class="muted">Not available (no DB)</li>`;
  const { data } = await supabase.from('agent_pto')
    .select('id,start_date,end_date').eq('agent_id', ag.drawer.agentId).order('start_date');
  ag.drawer.list.innerHTML = (data||[]).map(p=>`
    <li>${p.start_date} → ${p.end_date} <button class="mini danger" data-del="${p.id}">Delete</button></li>
  `).join('') || `<li class="muted">No PTO yet.</li>`;
  ag.drawer.list.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      await supabase.from('agent_pto').delete().eq('id', btn.dataset.del);
      await refreshPtoList(); await renderPtoCalendar();
    });
  });
}
async function savePtoRange(){
  if (!supabase) return alert('Supabase not configured.');
  const start_date = ag.drawer.start.value;
  const end_date = ag.drawer.end.value || start_date;
  if (!start_date) return alert('Select a start date');
  const { error } = await supabase.from('agent_pto')
    .insert({ agent_id: ag.drawer.agentId, start_date, end_date });
  if (error) return alert(error.message);
  await refreshPtoList(); await renderPtoCalendar();
}
async function renderPtoCalendar(){
  if (!supabase) return ag.drawer.calendar.innerHTML = '';
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const last = new Date(y, m+1, 0).getDate();
  const { data } = await supabase.from('agent_pto')
    .select('start_date,end_date').eq('agent_id', ag.drawer.agentId);
  const isPto = (iso) => (data||[]).some(p => iso >= p.start_date && iso <= p.end_date);
  let html = `<div class="mini-cal-grid">`;
  for (let d=1; d<=last; d++){
    const iso = new Date(y,m,d).toISOString().slice(0,10);
    html += `<div class="mini-cal-cell ${isPto(iso)?'pto':''}">${d}</div>`;
  }
  html += `</div>`;
  ag.drawer.calendar.innerHTML = html;
}
async function exportAgentsCSV(){
  const region = ag.region().value;
  const rows = await fetchAgents(region);
  let csv = "Name,Region,Status\n";
  for (const a of rows) csv += `"${a.full_name}",${a.region},${a.status}\n`;
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  const a = document.createElement('a'); a.href=url; a.download=`agents_${region}.csv`; a.click(); URL.revokeObjectURL(url);
}
async function initAgentsUI(){
  if (!ag.region()) return;
  ag.region().value = getDefaultRegion();
  ag.region().addEventListener('change', ()=>{ setDefaultRegion(ag.region().value); renderAgentsTable(); });
  ag.addBtn()?.addEventListener('click', onAddAgent);
  ag.exportBtn()?.addEventListener('click', exportAgentsCSV);
  ag.drawer.closeBtn?.addEventListener('click', closePtoDrawer);
  ag.drawer.saveBtn?.addEventListener('click', savePtoRange);
  await renderAgentsTable();
}

/* ======================================================================
   WEEKLY PLANNER — demande vs capacité (30 min)
   ====================================================================== */
const WP = {
  region: ()=>document.getElementById('wp-region'),
  week: ()=>document.getElementById('wp-week'),
  dayStart: ()=>document.getElementById('wp-day-start'),
  dayEnd: ()=>document.getElementById('wp-day-end'),
  load: ()=>document.getElementById('wp-load'),
  exportBtn: ()=>document.getElementById('wp-export'),
  grid: ()=>document.getElementById('wp-grid'),
  agentsCount: ()=>document.getElementById('wp-agents-count'),
  coverageAvg: ()=>document.getElementById('wp-coverage-avg'),
  understaffed: ()=>document.getElementById('wp-understaffed'),
};
function minutesBetween(hhmmStart, hhmmEnd){
  const [sh,sm]=hhmmStart.split(':').map(Number), [eh,em]=hhmmEnd.split(':').map(Number);
  return (eh*60+em)-(sh*60+sm);
}
function hhmmAdd(hhmm, deltaMin){
  let [h,m] = hhmm.split(':').map(Number);
  let total = h*60+m + deltaMin; if (total<0) total=0;
  const nh = Math.floor(total/60), nm = total%60;
  return `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`;
}
function isoWeekToDate(year, week) {
  const simple = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = simple.getUTCDay() || 7;
  const thursday = new Date(simple);
  thursday.setUTCDate(simple.getUTCDate() + (4 - dayOfWeek));
  const monday = new Date(thursday);
  monday.setUTCDate(thursday.getUTCDate() - 3 + (week - 1) * 7);
  return monday;
}
async function fetchHourlyShares(region){
  if (!supabase) {
    // fallback plat (10:00-18:00)
    const map = new Map();
    for (let h=10; h<=18; h++){
      map.set(`${String(h).padStart(2,'0')}:00`, +(100/18).toFixed(2));
      map.set(`${String(h).padStart(2,'0')}:30`, +(100/18).toFixed(2));
    }
    return map;
  }
  const { data } = await supabase.from('forecast_hourly')
    .select('hhmm, share_percent').eq('region', region).order('hhmm');
  const map = new Map();
  (data||[]).forEach(r => map.set(r.hhmm, parseFloat(r.share_percent)||0));
  return map;
}
async function computeDemandPerSlot(region, mondayUTC, dayStart, dayEnd, slots){
  const demand = {};
  const hourly = await fetchHourlyShares(region);
  for (let i=0; i<7; i++){
    const d = new Date(mondayUTC); d.setUTCDate(d.getUTCDate()+i);
    const dateISO = ymd(d);
    const y=d.getUTCFullYear(), m=d.getUTCMonth()+1, day=d.getUTCDate();
    const week = isoWeekNumber(new Date(y, m-1, day));
    const wdName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()];
    const total = ForecastStore.getTotal();
    const mShare = ForecastStore.getMonthlyShare(m)/100;
    const wShare = ForecastStore.getWeeklyShare(week)/100 || (1/52);
    const dShare = ForecastStore.getDailyShare(wdName)/100 || (1/7);
    const totalDay = total * mShare * wShare * dShare;

    const AHT = Tasks.getAHT();
    const dailyTaskPct = await fetchDailyTaskPct(region, wdName);
    const demandMinutesDay = sumDemandMinutes(totalDay, dailyTaskPct, AHT);

    const keys = Array.from(hourly.keys()).filter(h=> h>=dayStart && h<dayEnd);
    const sumVisible = keys.reduce((s,k)=> s+(hourly.get(k)||0), 0) || 1;
    for (const hhmm of slots){
      if (!keys.includes(hhmm)) continue;
      const pct = (hourly.get(hhmm)||0) / sumVisible;
      demand[`${dateISO}|${hhmm}`] = demandMinutesDay * pct;
    }
  }
  return demand;
}
async function fetchAgentsPresentByDate(region, dates){
  if (!supabase) {
    // dégradé : 0 agent -> juste la heatmap de demande
    const map = {}; dates.forEach(d=>map[d]=0); return map;
  }
  const agents = await fetchAgentsWithPTO(region);
  const map = {};
  dates.forEach(dateISO=>{
    const present = agents.filter(a => a.status === 'Present' && !agentIsOffThatDate(a, dateISO));
    map[dateISO] = present.length;
  });
  return map;
}
function buildWeekSlots(mondayUTC, dayStart, dayEnd){
  const days = Array.from({length:7}, (_,i)=> {
    const d = new Date(mondayUTC); d.setUTCDate(d.getUTCDate()+i); return d;
  });
  const slots = [];
  let cursor = dayStart;
  while (cursor < dayEnd){ slots.push(cursor); cursor = hhmmAdd(cursor, 30); }
  return { days, slots };
}
async function computeCapacityPerSlot(region, mondayUTC, dayStart, dayEnd, slots){
  const workMin = 8*60, lunch=60, breaks=2*15;
  const netCapPerAgentMin = Math.max(0, workMin - lunch - breaks);
  const workWindowMin = Math.max(30, minutesBetween(dayStart, dayEnd));
  const perAgentPerMinute = netCapPerAgentMin / workWindowMin;
  const dates = Array.from({length:7}, (_,i)=> ymd(new Date(mondayUTC.getTime()+i*86400000)));
  const presentByDate = await fetchAgentsPresentByDate(region, dates);
  const cap = {};
  for (const dateISO of dates){
    const present = presentByDate[dateISO] || 0;
    for (const hhmm of slots){
      const slotMin = 30;
      const perAgentSlot = perAgentPerMinute * slotMin;
      cap[`${dateISO}|${hhmm}`] = present * perAgentSlot;
    }
  }
  return { cap, presentByDate };
}
function renderWeekGrid(days, slots, demand, cap){
  const grid = WP.grid(); if (!grid) return;
  let thead = `<thead><tr><th class="first-col">Row</th>`;
  slots.forEach(s=> thead += `<th class="slot-col ${s.endsWith(':00')?'hour-marker':''}">${s}</th>`);
  thead += `</tr></thead>`;
  let tbody = '';
  for (let i=0; i<7; i++){
    const dateISO = ymd(days[i]);
    let row = `<tr><td class="first-col">${dateISO} — Demand vs Cap.</td>`;
    slots.forEach(s=>{
      const key = `${dateISO}|${s}`;
      const dmin = demand[key]||0;
      const cmin = cap[key]||0;
      const cls = dmin > cmin ? 'gap' : (cmin > dmin ? 'over' : 'present');
      row += `<td><div class="cell ${cls}" title="Demand ${Math.round(dmin)}m / Cap ${Math.round(cmin)}m"></div></td>`;
    });
    row += `</tr>`;
    tbody += row;
  }
  grid.innerHTML = thead + `<tbody>${tbody}</tbody>`;
}
function renderWeekSummary(days, slots, demand, cap, presentByDate){
  const agentsAvg = Math.round(
    Object.values(presentByDate).reduce((a,b)=>a+b,0) / (Object.keys(presentByDate).length||1)
  );
  let totalD=0, totalC=0, gaps=0;
  for (let i=0; i<7; i++){
    const dateISO = ymd(days[i]);
    slots.forEach(s=>{
      const key = `${dateISO}|${s}`;
      const d = demand[key]||0, c = cap[key]||0;
      totalD += d; totalC += c;
      if (d > c) gaps++;
    });
  }
  const coverage = totalD>0 ? Math.min(100, Math.round((totalC/totalD)*100)) : 100;
  WP.agentsCount().textContent = `${agentsAvg}`;
  WP.coverageAvg().textContent = `${coverage}%`;
  WP.understaffed().textContent = `${gaps}`;
}
function exportWeekCSV(region, days, slots, demand, cap){
  let csv = `Region,${region}\nSlot,Date,Time,Demand_Min,Capacity_Min\n`;
  let idx=1;
  for (let i=0; i<7; i++){
    const dateISO = ymd(days[i]);
    for (const s of slots){
      const key = `${dateISO}|${s}`;
      const d = Math.round(demand[key]||0);
      const c = Math.round(cap[key]||0);
      csv += `${idx},${dateISO},${s},${d},${c}\n`; idx++;
    }
  }
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  const a = document.createElement('a'); a.href=url; a.download=`weekly_${region}.csv`; a.click(); URL.revokeObjectURL(url);
}
async function loadWeekly(){
  const region = WP.region().value;
  await ForecastStore.init(region);
  const val = WP.week().value; if (!val) return alert('Select week');
  const [y, W] = val.split('-W').map(x=>parseInt(x,10));
  const dayStart = WP.dayStart().value || '09:00';
  const dayEnd   = WP.dayEnd().value || '18:00';
  const monday = isoWeekToDate(y, W);
  const { days, slots } = buildWeekSlots(monday, dayStart, dayEnd);
  const demand = await computeDemandPerSlot(region, monday, dayStart, dayEnd, slots);
  const { cap, presentByDate } = await computeCapacityPerSlot(region, monday, dayStart, dayEnd, slots);
  renderWeekGrid(days, slots, demand, cap);
  renderWeekSummary(days, slots, demand, cap, presentByDate);
  WP.exportBtn().onclick = ()=> exportWeekCSV(region, days, slots, demand, cap);
}
async function initWeeklyUI(){
  if (!WP.region()) return;
  WP.region().value = getDefaultRegion();
  const now = new Date(); const w = isoWeekNumber(now);
  WP.week().value = `${now.getFullYear()}-W${String(w).padStart(2,'0')}`;
  WP.load().addEventListener('click', loadWeekly);
}

/* ======================================================================
   FORECAST (simple panneau: total + tables; rely on ForecastStore)
   ====================================================================== */
// Rien d’interactif ici côté JS (l’édition se fait via LS/DB dans ForecastStore)

/* ======================================================================
   REGULATION — petite grille locale (sans DB)
   ====================================================================== */
const Regulation = (() => {
  const el = {
    panel: ()=>document.getElementById('regulation'),
    table: ()=>document.getElementById('regulationTableBody'),
    add:   ()=>document.getElementById('addRuleBtn')
  };
  const LS_KEY = 'roman_regulation_rules';
  let rules = [
    { name:'Max Hours per Day', value:'8' },
    { name:'Max Hours per Week', value:'37.5' },
    { name:'Lunch Duration (minutes)', value:'60' },
    { name:'Breaks per Day (count)', value:'2' },
    { name:'Break Duration (minutes)', value:'15' },
  ];
  const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)||'[]'); } catch { return []; } };
  const save = () => localStorage.setItem(LS_KEY, JSON.stringify(rules));
  const render = () => {
    const tb = el.table(); if (!tb) return;
    tb.innerHTML = (rules||[]).map((r,i)=>`
      <tr>
        <td>${r.name}</td>
        <td><input type="text" value="${r.value}" data-i="${i}" class="reg-val"></td>
        <td><button class="mini danger" data-del="${i}">Delete</button></td>
      </tr>
    `).join('') || `<tr><td colspan="3" class="muted">No rules.</td></tr>`;
    tb.querySelectorAll('.reg-val').forEach(inp=>{
      inp.addEventListener('input', (e)=>{ rules[e.target.dataset.i].value = e.target.value; save(); });
    });
    tb.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', ()=>{ rules.splice(Number(btn.dataset.del),1); save(); render(); });
    });
  };
  const init = () => {
    const persisted = load(); if (persisted?.length) rules = persisted;
    el.add()?.addEventListener('click', ()=>{
      const n = prompt('Rule name?'); if (!n) return;
      const v = prompt('Value?') || '';
      rules.push({ name:n, value:v }); save(); render();
    });
    render();
  };
  return { init };
})();

/* ======================================================================
   BOOT : rien, tout est lazy sur clic tab
   ====================================================================== */
