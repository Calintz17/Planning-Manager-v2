/* ===== TABS HANDLER ===== */
document.addEventListener('DOMContentLoaded', () => {
  const btns = Array.from(document.querySelectorAll('.tab-btn'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));
  let tasksInitDone = false;
  let forecastInitDone = false;

  const showTab = (id) => {
    panels.forEach(p => {
      if (p.id === id) p.removeAttribute('hidden'); else p.setAttribute('hidden', '');
    });
    btns.forEach(b => {
      const isActive = (b.dataset.tab === id);
      b.classList.toggle('active', isActive);
      if (b.hasAttribute('aria-selected')) b.setAttribute('aria-selected', String(isActive));
    });

    // Lazy inits
    if (id === 'tasks' && !tasksInitDone && window.Tasks?.init) {
      Tasks.init();
      tasksInitDone = true;
    }
    if (id === 'forecast' && !forecastInitDone && window.ForecastStore?.init) {
      ForecastStore.init();
      forecastInitDone = true;
    }
  };

  btns.forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  const initial = btns.find(b => b.classList.contains('active'))?.dataset.tab || panels[0]?.id;
  if (initial) showTab(initial);
});

/* =========================
   TASKS MODULE
   - localStorage key: 'roman_tasks'
   - Seed: depuis window.__SEED_TASKS__ si présent
   ========================= */
window.Tasks = (() => {
  const LS_KEY = 'roman_tasks';

  const els = {
    panel: () => document.getElementById('tasksPanel'),
    list:  () => document.getElementById('task-list'),
    counters: () => document.getElementById('task-counters'),
    search: () => document.getElementById('task-search'),
    fPrio: () => document.getElementById('task-filter-priority'),
    fStatus: () => document.getElementById('task-filter-status'),
    fOwner: () => document.getElementById('task-filter-owner'),
    btnCreate: () => document.getElementById('createTaskBtn'),
    form: () => document.getElementById('task-form'),
    tf: {
      title: () => document.getElementById('tf-title'),
      owner: () => document.getElementById('tf-owner'),
      prio:  () => document.getElementById('tf-priority'),
      status:() => document.getElementById('tf-status'),
      notes: () => document.getElementById('tf-notes'),
      cancel:() => document.getElementById('tf-cancel'),
    }
  };

  let tasks = [];
  let owners = []; // rempli depuis Agents si dispo, sinon depuis les tasks existantes

  // -------- Storage helpers
  const load = () => {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try { tasks = JSON.parse(raw); }
      catch { tasks = []; }
    } else {
      // Seed: si une variable globale est fournie côté HTML
      tasks = Array.isArray(window.__SEED_TASKS__) ? window.__SEED_TASKS__ : [];
      persist();
    }
  };
  const persist = () => localStorage.setItem(LS_KEY, JSON.stringify(tasks));

  // -------- Rendering
  const renderOwners = () => {
    // Construit la liste des owners depuis tasks existantes si vide
    if (!owners.length) {
      const set = new Set();
      tasks.forEach(t => t.owner && set.add(t.owner));
      owners = Array.from(set);
    }
    const fOwner = els.fOwner();
    const tfOwner = els.tf.owner();
    const opts = ['<option value="">All owners</option>']
      .concat(owners.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`));
    fOwner.innerHTML = opts.join('');
    tfOwner.innerHTML = owners.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
  };

  const renderCounters = (list) => {
    const total = list.length;
    const open = list.filter(t => t.status==='open').length;
    const prog = list.filter(t => t.status==='progress').length;
    const done = list.filter(t => t.status==='done').length;
    els.counters().innerHTML = [
      `<span class="counter">Total: <b>${total}</b></span>`,
      `<span class="counter">Open: <b>${open}</b></span>`,
      `<span class="counter">In progress: <b>${prog}</b></span>`,
      `<span class="counter">Done: <b>${done}</b></span>`
    ].join('');
  };

  const applyFilters = () => {
    const q = (els.search().value || '').toLowerCase().trim();
    const fp = els.fPrio().value;
    const fs = els.fStatus().value;
    const fo = els.fOwner().value;

    return tasks.filter(t => {
      if (q && !(t.title?.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q))) return false;
      if (fp && t.priority !== fp) return false;
      if (fs && t.status !== fs) return false;
      if (fo && t.owner !== fo) return false;
      return true;
    });
  };

  const renderList = () => {
    const list = applyFilters();
    renderCounters(list);
    els.list().innerHTML = list.map(t => renderItem(t)).join('') || `<div class="muted">No tasks.</div>`;
    // Wire row actions
    els.list().querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('[data-id]')?.dataset.id;
        if (!id) return;
        const idx = tasks.findIndex(x => x.id === id);
        if (idx === -1) return;
        const act = btn.dataset.action;
        if (act === 'delete') {
          tasks.splice(idx,1); persist(); renderList();
        } else if (act === 'status') {
          // Cycle: open -> progress -> done -> open
          const order = ['open','progress','done'];
          const next = order[(order.indexOf(tasks[idx].status)+1) % order.length];
          tasks[idx].status = next; persist(); renderList();
        }
      });
    });
  };

  const renderItem = (t) => {
    const prioMap = {low:'prio-low', med:'prio-med', high:'prio-high'};
    const stMap = {open:'status-open', progress:'status-progress', done:'status-done'};
    return `
      <div class="task-item" data-id="${t.id}">
        <div class="task-main">
          <div>
            <div class="task-title">${escapeHtml(t.title || '')}</div>
            <div class="task-meta">
              <span class="chip ${prioMap[t.priority]||''}">Priority: ${t.priority||'-'}</span>
              <span class="chip ${stMap[t.status]||''}">Status: ${t.status||'-'}</span>
              ${t.owner ? `<span class="chip">Owner: ${escapeHtml(t.owner)}</span>` : ``}
            </div>
            ${t.notes ? `<div class="task-notes">${escapeHtml(t.notes)}</div>` : ``}
          </div>
        </div>
        <div class="task-actions">
          <button class="btn" data-action="status">Next status</button>
          <button class="btn danger" data-action="delete">Delete</button>
        </div>
      </div>
    `;
  };

  // -------- Create form
  const showForm = (show) => els.form().hidden = !show;

  const onCreateClick = () => {
    showForm(true);
    // Pré-sélectionne owner si un filtre est en place
    const fo = els.fOwner().value;
    if (fo) els.tf.owner().value = fo;
  };

  const onFormSubmit = (e) => {
    e.preventDefault();
    const title = els.tf.title().value.trim();
    if (!title) return;
    const task = {
      id: cryptoRandomId(),
      title,
      owner: els.tf.owner().value || '',
      priority: els.tf.prio().value || 'low',
      status: els.tf.status().value || 'open',
      notes: els.tf.notes().value?.trim() || ''
    };
    tasks.unshift(task);
    if (task.owner && !owners.includes(task.owner)) { owners.push(task.owner); renderOwners(); }
    persist(); showForm(false); e.target.reset(); renderList();
  };

  // -------- Utils
  const escapeHtml = (s='') => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cryptoRandomId = () => {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  };

  // -------- Public
  const init = () => {
    if (!els.panel()) return; // pas sur la page
    load();
    renderOwners();
    renderList();

    // Listeners
    els.search().addEventListener('input', renderList);
    els.fPrio().addEventListener('change', renderList);
    els.fStatus().addEventListener('change', renderList);
    els.fOwner().addEventListener('change', renderList);

    els.btnCreate().addEventListener('click', onCreateClick);
    els.form().addEventListener('submit', onFormSubmit);
    els.tf.cancel().addEventListener('click', () => { els.form().reset(); showForm(false); });
  };

  return { init };
})();



// app.js — Planning Manager V2
// Auth Supabase + Attendance (v3.2) + Agents (directory, skills, status, PTO, export)

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);



/* ===== TABS HANDLER (placer TOUT EN HAUT de app.js) ===== */
document.addEventListener('DOMContentLoaded', () => {
  const btns = Array.from(document.querySelectorAll('.tab-btn'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));
  let tasksInitDone = false;

  const showTab = (id) => {
    panels.forEach(p => {
      if (p.id === id) p.removeAttribute('hidden'); else p.setAttribute('hidden', '');
    });
    btns.forEach(b => {
      const isActive = (b.dataset.tab === id);
      b.classList.toggle('active', isActive);
      if (b.hasAttribute('aria-selected')) b.setAttribute('aria-selected', String(isActive));
    });

    // Lazy init: Tasks
    if (id === 'tasks' && !tasksInitDone && window.Tasks?.init) {
      Tasks.init();
      tasksInitDone = true;
    }
  };

  btns.forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // Sélection initiale basée sur le bouton .active
  const initial = btns.find(b => b.classList.contains('active'))?.dataset.tab || panels[0]?.id;
  if (initial) showTab(initial);
});


/* ---------------- Auth Modal ---------------- */
const authModal = document.getElementById("auth-modal");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const forgotLink = document.getElementById("forgot-link");
const authError = document.getElementById("auth-error");
const emailEl = document.getElementById("auth-email");
const passEl = document.getElementById("auth-password");
const regionEl = document.getElementById("auth-region");

async function ensureProfile(userId, email, defaultRegion) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, email, default_region: defaultRegion }, { onConflict: "id" });
  if (error) throw error;
}
async function seedDefaultsIfEmpty(regionCode) {
  const { error } = await supabase.rpc("seed_defaults_for_current_user", { p_region: regionCode });
  if (error) console.warn("seed_defaults_for_current_user:", error.message);
}
const DEFAULT_AGENTS = {
  US: ["CARMICHAEL Keiani","AKOPIAN Ani","KEILITZ Madeline","YOUNG Nicole","TAVAREZ Valerie","SYRDAHL Victoria","BAMBA Nimatul"],
  CN: ["XIAO Nadia","YANG Joyce","RONG Grace","CHENG Lily","LIAO Adam","WANG Nicole","YANG Yilia","HE Krystal"],
  JP: ["SHIONOIRI Ayumi","ADACHI Kazue","YAMADA Kyohei","MISHINA Shinobu","KURIMOTO Kaori","MATSUURA Minato"],
  KR: ["KIM Dooyeon","KIM Bella","RYOO Jiyeon","SONG Chaerin","YANG Inseok","LEE Lina"],
  EMEA: ["PONS Silvia","BIDAU Julien","NGOUALLOU Elisabeth","BEAUVOIS Brice","CAFAGNA Olivia","SHEFFIELD Duncan","VOGEL Leander","NGANZAMI EBALE Naomi","VAZZA Pierluigi","BENMOKTHTAR Safia","RIZZO Stéphane","GEISSLEIR Simone"],
  SEAO: ["CHIA Michell","UNGSUNANTAWIWAT Noppawan","YODPANICH Pichaya","SOON Shanice"],
};
async function seedAgentsIfEmpty() {
  const { data, error } = await supabase.from("agents").select("id").limit(1);
  if (error) { console.error(error); return; }
  if (data && data.length > 0) return;
  for (const [code, names] of Object.entries(DEFAULT_AGENTS)) {
    for (const name of names) {
      const { error: e2 } = await supabase.rpc("add_agent_for_current_user", { p_full_name: name, p_region: code });
      if (e2) console.warn("add_agent_for_current_user:", name, e2.message);
    }
  }
}

async function refreshSession() { const { data } = await supabase.auth.getSession(); return data.session; }
async function requireAuth() {
  const session = await refreshSession();
  if (!session) {
    authModal.classList.add("visible"); authModal.setAttribute("aria-hidden", "false");
  } else {
    authModal.classList.remove("visible"); authModal.setAttribute("aria-hidden", "true");
    // init tabs default region
    initAttendanceUI();
    initAgentsUI();
    initForecastUI();
    initWeeklyUI();
  }
}

loginBtn.addEventListener("click", async () => {
  authError.textContent = "";
  const email = emailEl.value.trim();
  const password = passEl.value;
  const region = regionEl.value;
  if (!email || !password) { authError.textContent = "Please enter email and password."; return; }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { authError.textContent = error.message; return; }
  const user = data.user;
  try {
    await ensureProfile(user.id, user.email, region);
    localStorage.setItem("pmv2_default_region", region);
    await seedDefaultsIfEmpty(region);
    await seedAgentsIfEmpty();
  } catch (e) { console.error(e); }
  await requireAuth();
});
signupBtn.addEventListener("click", async () => {
  authError.textContent = "";
  const email = emailEl.value.trim();
  const password = passEl.value;
  const region = regionEl.value;
  if (!email || !password) { authError.textContent = "Please enter email and password."; return; }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) { authError.textContent = error.message; return; }
  const session = await refreshSession();
  if (!session) { authError.textContent = "Check your inbox to confirm your email, then log in."; return; }
  const user = session.user;
  try {
    await ensureProfile(user.id, user.email, region);
    localStorage.setItem("pmv2_default_region", region);
    await seedDefaultsIfEmpty(region);
    await seedAgentsIfEmpty();
  } catch (e) { console.error(e); }
  await requireAuth();
});
forgotLink.addEventListener("click", async (e) => {
  e.preventDefault();
  authError.textContent = "";
  const email = emailEl.value.trim();
  if (!email) { authError.textContent = "Enter your email first."; return; }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/index.html" });
  if (error) { authError.textContent = error.message; return; }
  alert("Password reset email sent.");
});

/* ---------------- Attendance (v3.2) ---------------- */
const attRegionSel = document.getElementById("att-region");
const attStartInput = document.getElementById("att-start");
const attCalcBtn = document.getElementById("att-calc");
const adherenceLabel = document.getElementById("adherence-label");
const adherenceFill = document.getElementById("adherence-fill");
const attTable = document.getElementById("att-table");
const attWarnings = document.getElementById("att-warnings");

function firstDayOfCurrentMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}
async function getDefaultRegionFromProfile() {
  const local = localStorage.getItem("pmv2_default_region");
  if (local) return local;
  const { data, error } = await supabase.from("profiles").select("default_region").single();
  if (!error && data && data.default_region) return data.default_region;
  return "EMEA";
}
function isoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

async function fetchAgentsWithPTO(region) {
  const [{ data: agents, error: e1 }, { data: pto, error: e2 }] = await Promise.all([
    supabase.from("agents").select("id, full_name, region, status").eq("region", region).order("full_name", { ascending: true }),
    supabase.from("agent_pto").select("agent_id, start_date, end_date, half_day_start, half_day_end"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const byId = {};
  (agents || []).forEach((a) => { byId[a.id] = { ...a, pto: [] }; });
  (pto || []).forEach((p) => { if (byId[p.agent_id]) byId[p.agent_id].pto.push(p); });
  return Object.values(byId);
}

async function fetchRegulations(region) {
  const { data, error } = await supabase.from("regulation_rules").select("rule_key, value_text, enabled").eq("region", region).eq("enabled", true);
  if (error) throw error;
  const map = {};
  (data || []).forEach((r) => (map[r.rule_key] = r.value_text));
  return {
    maxHoursPerDay: parseFloat(map["Max Hours per Day"] ?? "8"),
    lunchMin: parseInt(map["Lunch Duration (minutes)"] ?? "60", 10),
    breaksPerDay: parseInt(map["Breaks per Day (count)"] ?? "2", 10),
    breakMin: parseInt(map["Break Duration (minutes)"] ?? "15", 10),
  };
}

async function fetchForecastPieces(region, y, m, d) {
  const week = isoWeekNumber(new Date(y, m - 1, d));
  const weekday = new Date(y, m - 1, d).getDay(); // 0..6
  const wd = ((weekday + 6) % 7) + 1; // 1..7 (Mon..Sun)

  const [ft, fm, fw, fd, tasks] = await Promise.all([
    supabase.from("forecast_totals").select("total_volume").eq("region", region).single(),
    supabase.from("forecast_monthly").select("month_index, share_percent").eq("region", region).eq("month_index", m).maybeSingle(),
    supabase.from("forecast_weekly").select("week_index, share_percent").eq("region", region).eq("week_index", week).maybeSingle(),
    supabase.from("forecast_daily").select("weekday, share_percent, email_pct, call_pct, chat_pct, clienteling_pct, fraud_pct, admin_pct").eq("region", region).eq("weekday", wd).maybeSingle(),
    supabase.from("tasks").select("name, avg_handle_time_min, enabled").eq("region", region).eq("enabled", true),
  ]);

  if (ft.error) throw ft.error;
  const total = ft.data?.total_volume ?? 0;
  const monthlyShare = (fm.data?.share_percent ?? 100 / 12) / 100.0;
  const weeklyShare = (fw.data?.share_percent ?? (100 / 52)) / 100.0;
  const dailyShare = (fd.data?.share_percent ?? (100 / 7)) / 100.0;

  return {
    totalVolume: total,
    monthlyShare,
    weeklyShare,
    dailyShare,
    dailyTaskPct: {
      Mail: (fd.data?.email_pct ?? 38) / 100.0,
      Call: (fd.data?.call_pct ?? 36) / 100.0,
      Chat: (fd.data?.chat_pct ?? 0) / 100.0,
      Clienteling: (fd.data?.clienteling_pct ?? 3) / 100.0,
      Fraud: (fd.data?.fraud_pct ?? 0) / 100.0,
      "Back Office": (fd.data?.admin_pct ?? 26) / 100.0,
    },
    tasks: tasks.data || [],
  };
}

function agentIsOffThatDate(agent, dateISO) {
  const dOnly = dateISO;
  for (const p of agent.pto || []) {
    if (dOnly >= p.start_date && dOnly <= p.end_date) return true;
  }
  return false;
}
function computeNetCapacityPerAgentMin(reg) {
  const workMin = reg.maxHoursPerDay * 60;
  const breaks = reg.breaksPerDay * reg.breakMin;
  return Math.max(0, workMin - reg.lunchMin - breaks);
}
function sumDemandMinutes(totalVolumeDay, dailyTaskPct, tasks) {
  const AHT = {}; tasks.forEach((t) => { AHT[t.name] = t.avg_handle_time_min; });
  const keys = ["Call", "Mail", "Chat", "Clienteling", "Fraud", "Back Office"];
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
  const start = new Date(startISO);
  const year = start.getFullYear();
  const month = start.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  const regs = await fetchRegulations(region);
  const netCapPerAgentMin = computeNetCapacityPerAgentMin(regs);
  const agents = await fetchAgentsWithPTO(region);

  const results = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateISO = new Date(year, month - 1, day).toISOString().slice(0, 10);
    const f = await fetchForecastPieces(region, year, month, day);
    const totalDay = f.totalVolume * f.monthlyShare * f.weeklyShare * f.dailyShare;
    const demandMin = sumDemandMinutes(totalDay, f.dailyTaskPct, f.tasks);
    const available = agents.filter(a => a.status === "Present" && !agentIsOffThatDate(a, dateISO)).length;
    const required = (netCapPerAgentMin > 0) ? Math.ceil(demandMin / netCapPerAgentMin) : 0;
    const adherence = required > 0 ? Math.min(100, Math.round((available / required) * 100)) : 100;
    results.push({ dateISO, day, available, required, adherence });
  }
  return { results, agents, netCapPerAgentMin };
}

function renderAttendanceGrid(region, calc) {
  const { results, agents } = calc;
  let thead = `<thead><tr><th class="first-col">Agent</th>`;
  for (const c of results) {
    const flag = c.required > c.available ? `<span class="warn-flag">/!\\</span>` : "";
    thead += `<th><div class="day-head">${c.day}</div>${flag}<div class="req-available">${c.available}/${c.required}</div></th>`;
  }
  thead += `</tr></thead>`;

  let tbody = `<tbody>`;
  for (const a of agents) {
    tbody += `<tr><td class="first-col" title="${a.status}">${a.full_name}</td>`;
    for (const c of results) {
      const off = agentIsOffThatDate(a, c.dateISO);
      let half = false;
      if (off && a.pto?.length) {
        const p = a.pto.find(p => c.dateISO >= p.start_date && c.dateISO <= p.end_date);
        if (p && (p.half_day_start || p.half_day_end)) half = true;
      }
      let cls = "";
      if (off && half) cls = "cell-pto-half";
      else if (off) cls = "cell-pto";
      else cls = "cell-present";
      tbody += `<td class="${cls}"></td>`;
    }
    tbody += `</tr>`;
  }
  tbody += `</tbody>`;
  attTable.innerHTML = thead + tbody;

  const warnDays = results.filter(r => r.required > r.available);
  attWarnings.innerHTML = warnDays.length
    ? warnDays.map(w => `<span class="warn-flag">/!\\ D${w.day}</span>`).join(" ")
    : "All days fully staffed ✅";

  document.getElementById("att-export").onclick = () => exportAttendanceToCSV(region, results, agents);
}
function renderAdherenceSummary(results) {
  if (!results.length) { adherenceLabel.textContent = "– %"; adherenceFill.style.width = "0%"; return; }
  const avg = Math.round(results.reduce((s, r) => s + r.adherence, 0) / results.length);
  adherenceLabel.textContent = `${avg}%`;
  adherenceFill.style.width = `${Math.min(100, Math.max(0, avg))}%`;
}
async function initAttendanceUI() {
  if (!attRegionSel) return;
  const def = await getDefaultRegionFromProfile();
  attRegionSel.value = def;
  attStartInput.value = firstDayOfCurrentMonthISO();
  await runAttendance();
  attCalcBtn?.addEventListener("click", runAttendance);
}
async function runAttendance() {
  const region = attRegionSel.value;
  const startISO = attStartInput.value;
  const calc = await calcAttendance(region, startISO);
  renderAttendanceGrid(region, calc);
  renderAdherenceSummary(calc.results);
}
function exportAttendanceToCSV(region, results, agents) {
  let csv = `Region,${region}\n\nAgent`;
  for (const c of results) csv += `,Day ${c.day}`;
  csv += "\n";
  for (const a of agents) {
    csv += `"${a.full_name}"`;
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

/* ---------------- Agents (Directory + PTO) ---------------- */
const agRegionSel = document.getElementById("ag-region");
const agAddBtn = document.getElementById("ag-add");
const agExportBtn = document.getElementById("ag-export");
const agTable = document.getElementById("ag-table")?.querySelector("tbody");

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

async function initAgentsUI() {
  if (!agRegionSel) return;
  const def = await getDefaultRegionFromProfile();
  agRegionSel.value = def;
  await renderAgentsTable();

  agRegionSel.addEventListener("change", renderAgentsTable);
  agAddBtn.addEventListener("click", onAddAgent);
  agExportBtn.addEventListener("click", exportAgentsCSV);

  PTO_DRAWER.closeBtn.addEventListener("click", closePtoDrawer);
  PTO_DRAWER.saveBtn.addEventListener("click", savePtoRange);
}

async function fetchAgents(region) {
  const { data, error } = await supabase
    .from("agents")
    .select("id, full_name, region, status")
    .eq("region", region)
    .order("full_name", { ascending: true });
  if (error) throw error;
  // fetch skills
  const { data: skills, error: e2 } = await supabase.from("agent_skills").select("*");
  if (e2) throw e2;
  const byId = {};
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

function statusSelectHtml(current) {
  const opts = ["Present","PTO","Sick Leave","Unavailable"];
  return `<select class="ag-status">
    ${opts.map(o => `<option value="${o}" ${o===current?'selected':''}>${o}</option>`).join("")}
  </select>`;
}
function skillCheckbox(checked, cls) {
  return `<input type="checkbox" class="ag-skill ${cls}" ${checked ? "checked": ""}/>`;
}
function actionsButtons() {
  return {
    pto: `<button class="mini primary">PTO</button>`,
    cal: `<button class="mini secondary">📅</button>`,
    del: `<button class="mini danger">Delete</button>`
  };
}

async function renderAgentsTable() {
  if (!agTable) return;
  agTable.innerHTML = `<tr><td colspan="12">Loading…</td></tr>`;
  const region = agRegionSel.value;
  const rows = await fetchAgents(region);

  if (!rows.length) {
    agTable.innerHTML = `<tr><td colspan="12">No agents yet.</td></tr>`;
    return;
  }

  const html = rows.map(r => {
    const a = actionsButtons();
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
      <td>${a.pto}</td>
      <td>${a.cal}</td>
      <td>${a.del}</td>
    </tr>`;
  }).join("");
  agTable.innerHTML = html;

  // Bind events
  agTable.querySelectorAll("tr").forEach(tr => {
    const id = tr.getAttribute("data-id");

    // name edit (blur save)
    const nameEl = tr.querySelector(".ag-name");
    nameEl.addEventListener("blur", async () => {
      const newName = nameEl.textContent.trim();
      await supabase.from("agents").update({ full_name: newName }).eq("id", id);
    });

    // status change
    tr.querySelector(".ag-status").addEventListener("change", async (e) => {
      const status = e.target.value;
      await supabase.from("agents").update({ status }).eq("id", id);
    });

    // skill toggles
    tr.querySelectorAll(".ag-skill").forEach(cb => {
      cb.addEventListener("change", async (e) => {
        const cls = e.target.classList.contains("can_call") ? "can_call"
          : e.target.classList.contains("can_mail") ? "can_mail"
          : e.target.classList.contains("can_chat") ? "can_chat"
          : e.target.classList.contains("can_clienteling") ? "can_clienteling"
          : e.target.classList.contains("can_fraud") ? "can_fraud"
          : "can_backoffice";
        const payload = { [cls]: e.target.checked };
        // upsert skills row
        const { error } = await supabase.from("agent_skills").upsert({ agent_id: id, ...payload }, { onConflict: "agent_id" });
        if (error) console.error(error);
      });
    });

    // PTO drawer open
    tr.querySelector(".mini.primary").addEventListener("click", () => openPtoDrawer(id, tr.querySelector(".ag-name").textContent.trim()));

    // PTO mini calendar
    tr.querySelector(".mini.secondary").addEventListener("click", async () => {
      await openPtoDrawer(id, tr.querySelector(".ag-name").textContent.trim(), { showCalendarOnly:true });
    });

    // delete
    tr.querySelector(".mini.danger").addEventListener("click", async () => {
      if (!confirm("Are you sure ?")) return;
      await supabase.from("agent_skills").delete().eq("agent_id", id);
      await supabase.from("agent_pto").delete().eq("agent_id", id);
      await supabase.from("agents").delete().eq("id", id);
      await renderAgentsTable();
    });
  });
}

async function onAddAgent() {
  const name = prompt("Agent full name ?");
  if (!name) return;
  const region = agRegionSel.value;
  // create agent
  const { data, error } = await supabase.from("agents").insert({ full_name: name, region }).select("id").single();
  if (error) { alert(error.message); return; }
  // create empty skills
  await supabase.from("agent_skills").insert({ agent_id: data.id });
  await renderAgentsTable();
}

async function exportAgentsCSV() {
  const region = agRegionSel.value;
  const list = await fetchAgents(region);
  let csv = "Name,Region,Status,Call,Mail,Chat,Clienteling,Fraud,Back Office\n";
  for (const a of list) {
    csv += `"${a.full_name}",${a.region},${a.status},${a.skills.can_call},${a.skills.can_mail},${a.skills.can_chat},${a.skills.can_clienteling},${a.skills.can_fraud},${a.skills.can_backoffice}\n`;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `agents_${region}.csv`; link.click();
  URL.revokeObjectURL(url);
}

/* -------- PTO Drawer logic -------- */
async function openPtoDrawer(agentId, agentName, opts={}) {
  PTO_DRAWER.agentId = agentId;
  PTO_DRAWER.agentName = agentName;
  PTO_DRAWER.title.textContent = `PTO for ${agentName}`;
  PTO_DRAWER.start.value = ""; PTO_DRAWER.end.value = "";
  PTO_DRAWER.halfStart.value = ""; PTO_DRAWER.halfEnd.value = "";

  await refreshPtoList();
  await renderPtoMiniCalendar();

  PTO_DRAWER.el.classList.add("open");
  PTO_DRAWER.el.setAttribute("aria-hidden", "false");

  if (opts.showCalendarOnly) {
    // no-op; just showing
  }
}
function closePtoDrawer() {
  PTO_DRAWER.el.classList.remove("open");
  PTO_DRAWER.el.setAttribute("aria-hidden", "true");
}

async function refreshPtoList() {
  const { data, error } = await supabase
    .from("agent_pto")
    .select("id, start_date, end_date, half_day_start, half_day_end")
    .eq("agent_id", PTO_DRAWER.agentId)
    .order("start_date", { ascending: true });
  if (error) { console.error(error); return; }

  PTO_DRAWER.list.innerHTML = (data||[]).map(p => {
    const half = `${p.half_day_start||''}-${p.half_day_end||''}`.replace(/^-|-$/g,'');
    const label = half ? `${p.start_date} (${p.half_day_start||'Full'}) → ${p.end_date} (${p.half_day_end||'Full'})`
                       : `${p.start_date} → ${p.end_date}`;
    return `<li data-id="${p.id}">${label} <button class="mini danger" data-del="${p.id}">Delete</button></li>`;
  }).join("") || `<li class="muted">No PTO yet.</li>`;

  // bind delete buttons
  PTO_DRAWER.list.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del");
      await supabase.from("agent_pto").delete().eq("id", id);
      await refreshPtoList();
      await renderPtoMiniCalendar();
    });
  });
}

async function savePtoRange() {
  const start_date = PTO_DRAWER.start.value;
  const end_date = PTO_DRAWER.end.value || start_date;
  const half_day_start = PTO_DRAWER.halfStart.value || null;
  const half_day_end = PTO_DRAWER.halfEnd.value || null;
  if (!start_date) { alert("Select a start date"); return; }
  const { error } = await supabase.from("agent_pto").insert({
    agent_id: PTO_DRAWER.agentId, start_date, end_date, half_day_start, half_day_end
  });
  if (error) { alert(error.message); return; }
  await refreshPtoList();
  await renderPtoMiniCalendar();
}

async function renderPtoMiniCalendar() {
  // simple month view around today
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(); // 0..11
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const days = last.getDate();

  const { data, error } = await supabase
    .from("agent_pto")
    .select("start_date, end_date, half_day_start, half_day_end")
    .eq("agent_id", PTO_DRAWER.agentId);
  if (error) { console.error(error); return; }

  function isPto(dStr) {
    for (const p of (data||[])) {
      if (dStr >= p.start_date && dStr <= p.end_date) {
        const half = (p.half_day_start || p.half_day_end) ? "half" : "full";
        return half;
      }
    }
    return null;
  }

  let html = `<div class="mini-cal-grid">`;
  for (let d = 1; d <= days; d++) {
    const iso = new Date(y, m, d).toISOString().slice(0,10);
    const tag = isPto(iso);
    html += `<div class="mini-cal-cell ${tag === 'full' ? 'pto' : tag === 'half' ? 'pto-half' : ''}">${d}</div>`;
  }
  html += `</div>`;
  PTO_DRAWER.calendar.innerHTML = html;
}
// =======================
// === TASKS (Step 3) START
// =======================

/**
 * Modèle de donnée
 * Task = {
 *   id: string,
 *   title: string,
 *   status: 'open'|'in_progress'|'done',
 *   priority: 'low'|'medium'|'high',
 *   assigneeId: string|null,
 *   assigneeName: string|null,
 *   due: 'YYYY-MM-DD'|null,
 *   tags: string[], // en minuscules
 *   notes: string|null,
 *   createdAt: number,
 *   updatedAt: number
 * }
 */

const Tasks = (() => {
  const STORAGE_KEY = 'app.tasks.v1';

  // ---- State
  let tasks = [];
  let filters = {
    q: '',
    status: 'all',
    assignee: 'all',
    priority: 'all',
    tags: []
  };

  // ---- Utils
  const uid = () => Math.random().toString(36).slice(2, 10);
  const now = () => Date.now();

  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch {}
  };
  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) tasks = JSON.parse(raw);
    } catch {}
  };

  const seedIfEmpty = () => {
    if (tasks.length) return;
    tasks = [
      {
        id: uid(), title: 'Mettre en place la vue Tasks', status: 'in_progress', priority: 'high',
        assigneeId: 'u1', assigneeName: 'Roman', due: null, tags:['frontend','repo'], notes:'Wire l’UI et la persistence.',
        createdAt: now(), updatedAt: now()
      },
      {
        id: uid(), title: 'Écrire la doc README: Tasks', status: 'open', priority: 'medium',
        assigneeId: 'u2', assigneeName: 'Aline', due: null, tags:['docs'], notes:null,
        createdAt: now(), updatedAt: now()
      },
      {
        id: uid(), title: 'QA rapide + filtres', status: 'done', priority: 'low',
        assigneeId: null, assigneeName: null, due: null, tags:['qa'], notes:'Ok sur desktop et 375px.',
        createdAt: now(), updatedAt: now()
      }
    ];
  };

  // ---- CRUD
  const add = (payload) => {
    const t = {
      id: uid(),
      title: (payload.title||'').trim(),
      status: payload.status || 'open',
      priority: payload.priority || 'medium',
      assigneeId: payload.assigneeId || null,
      assigneeName: payload.assigneeName || null,
      due: payload.due || null,
      tags: (payload.tags||[]).map(s=>s.toLowerCase()),
      notes: payload.notes || null,
      createdAt: now(), updatedAt: now()
    };
    tasks.unshift(t);
    save();
    return t;
  };

  const update = (id, patch) => {
    const i = tasks.findIndex(t=>t.id===id);
    if (i===-1) return null;
    tasks[i] = { ...tasks[i], ...patch, updatedAt: now() };
    save();
    return tasks[i];
  };

  const remove = (id) => {
    tasks = tasks.filter(t=>t.id!==id);
    save();
  };

  // ---- Filters
  const setFilter = (patch) => {
    filters = { ...filters, ...patch };
    render();
  };

  const applyFilters = (list) => {
    let out = [...list];
    const q = filters.q.trim().toLowerCase();
    if (q) {
      out = out.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.notes||'').toLowerCase().includes(q) ||
        t.tags.some(tag=>tag.includes(q))
      );
    }
    if (filters.status !== 'all') {
      const map = { open:'open', in_progress:'in_progress', done:'done' };
      out = out.filter(t => t.status === map[filters.status]);
    }
    if (filters.assignee !== 'all') {
      out = out.filter(t => (t.assigneeId||'') === filters.assignee);
    }
    if (filters.priority !== 'all') {
      out = out.filter(t => t.priority === filters.priority);
    }
    if (filters.tags.length) {
      out = out.filter(t => filters.tags.every(tag => t.tags.includes(tag)));
    }
    return out;
  };

  // ---- Render
  const $ = (sel) => document.querySelector(sel);

  const el = {
    list: () => $('#tasks-list'),
    search: () => $('#task-search'),
    filterStatus: () => $('#task-filter-status'),
    filterAssignee: () => $('#task-filter-assignee'),
    filterPriority: () => $('#task-filter-priority'),
    filterTags: () => $('#task-filter-tags'),
    form: () => $('#task-form'),
    counts: {
      all: () => $('#tasks-count-all'),
      open: () => $('#tasks-count-open'),
      prog: () => $('#tasks-count-inprogress'),
      done: () => $('#tasks-count-done'),
    }
  };

  const fmtPrio = (p) => ({low:'Faible',medium:'Moyenne',high:'Élevée'})[p]||p;
  const fmtStatus = (s) => ({open:'Ouverte',in_progress:'En cours',done:'Terminée'})[s]||s;

  const chipClassForPrio = (p) => p === 'high' ? 'prio-high' : p === 'low' ? 'prio-low' : 'prio-med';
  const chipClassForStatus = (s) => s === 'done' ? 'status-done' : s === 'in_progress' ? 'status-progress' : 'status-open';

  const renderCounts = (list) => {
    const $all = el.counts.all(); if ($all) $all.textContent = tasks.length;
    const $o = el.counts.open(); if ($o) $o.textContent = tasks.filter(t=>t.status==='open').length;
    const $p = el.counts.prog(); if ($p) $p.textContent = tasks.filter(t=>t.status==='in_progress').length;
    const $d = el.counts.done(); if ($d) $d.textContent = tasks.filter(t=>t.status==='done').length;
  };

  const render = () => {
    const $list = el.list();
    if (!$list) return;

    const filtered = applyFilters(tasks);
    renderCounts(filtered);

    $list.innerHTML = '';
    if (!filtered.length) {
      $list.innerHTML = `<div class="chip">Aucune tâche ne correspond aux filtres</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach(t => {
      const row = document.createElement('div');
      row.className = 'task-item';
      row.innerHTML = `
        <div class="task-main">
          <input type="checkbox" ${t.status==='done'?'checked':''} data-action="toggle" data-id="${t.id}" style="margin-top:4px"/>
          <div>
            <div class="task-title">${escapeHtml(t.title)}</div>
            <div class="task-meta">
              <span class="chip ${chipClassForStatus(t.status)}">${fmtStatus(t.status)}</span>
              <span class="chip ${chipClassForPrio(t.priority)}">Priorité ${fmtPrio(t.priority)}</span>
              ${t.assigneeName?`<span class="chip">@${escapeHtml(t.assigneeName)}</span>`:''}
              ${t.due?`<span class="chip">Échéance ${t.due}</span>`:''}
              ${t.tags.map(tag=>`<span class="chip">#${escapeHtml(tag)}</span>`).join('')}
            </div>
            ${t.notes?`<div class="task-notes">${escapeHtml(t.notes)}</div>`:''}
          </div>
        </div>
        <div class="task-actions">
          <button data-action="edit" data-id="${t.id}">Éditer</button>
          <button class="danger" data-action="delete" data-id="${t.id}">Supprimer</button>
        </div>
      `;
      frag.appendChild(row);
    });
    $list.appendChild(frag);
  };

  const escapeHtml = (s) => String(s)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'","&#039;");

  // ---- Form handling
  const readForm = ($form) => {
    const id = $form.querySelector('#task-id')?.value || null;
    const title = $form.querySelector('#task-title')?.value || '';
    const assignee = $form.querySelector('#task-assignee')?.value || '';
    const [assigneeId, assigneeName] = assignee ? assignee.split('::') : [null, null];
    const due = $form.querySelector('#task-due')?.value || null;
    const priority = $form.querySelector('#task-priority')?.value || 'medium';
    const status = $form.querySelector('#task-status')?.value || 'open';
    const tagsRaw = $form.querySelector('#task-tags')?.value || '';
    const notes = $form.querySelector('#task-notes')?.value || null;

    const tags = tagsRaw
      .split(',')
      .map(s=>s.trim())
      .filter(Boolean)
      .map(s=>s.toLowerCase());

    return { id, title, assigneeId, assigneeName, due, priority, status, tags, notes };
  };

  const fillForm = ($form, t=null) => {
    const set = (sel, val) => { const n = $form.querySelector(sel); if (n) n.value = val ?? ''; };
    set('#task-id', t?.id ?? '');
    set('#task-title', t?.title ?? '');
    if (t?.assigneeId || t?.assigneeName) set('#task-assignee', `${t.assigneeId||''}::${t.assigneeName||''}`);
    set('#task-due', t?.due ?? '');
    set('#task-priority', t?.priority ?? 'medium');
    set('#task-status', t?.status ?? 'open');
    set('#task-tags', (t?.tags||[]).join(', '));
    set('#task-notes', t?.notes ?? '');
  };

  const clearForm = ($form) => fillForm($form, null);

  const hookForm = () => {
    const $form = el.form();
    if (!$form) return;

    // Submit (create/update)
    $form.addEventListener('submit', (e)=>{
      e.preventDefault();
      const data = readForm($form);
      if (!data.title.trim()) return;

      if (data.id) {
        update(data.id, {
          title:data.title, assigneeId:data.assigneeId, assigneeName:data.assigneeName,
          due:data.due, priority:data.priority, status:data.status, tags:data.tags, notes:data.notes
        });
      } else {
        add({
          title:data.title, assigneeId:data.assigneeId, assigneeName:data.assigneeName,
          due:data.due, priority:data.priority, status:data.status, tags:data.tags, notes:data.notes
        });
      }
      clearForm($form);
      render();
    });

    // Reset button (optional)
    const resetBtn = $form.querySelector('[data-action="reset-form"]');
    if (resetBtn) resetBtn.addEventListener('click', (e)=>{ e.preventDefault(); clearForm($form); });
  };

  // ---- List interactions
  const hookList = () => {
    const $list = el.list();
    if (!$list) return;

    $list.addEventListener('click', (e)=>{
      const btn = e.target.closest('button,[data-action="toggle"]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');

      if (action==='delete') {
        remove(id);
        render();
      } else if (action==='edit') {
        const t = tasks.find(t=>t.id===id);
        const $form = el.form(); if ($form && t) fillForm($form, t);
      } else if (action==='toggle') {
        const t = tasks.find(t=>t.id===id);
        if (!t) return;
        const next = t.status === 'done' ? 'open' : 'done';
        update(id, { status: next });
        render();
      }
    });
  };

  // ---- Toolbar (search + filters)
  const hookToolbar = () => {
    const $search = el.search();
    if ($search) $search.addEventListener('input', (e)=> setFilter({ q: e.target.value }));

    const $fs = el.filterStatus();
    if ($fs) $fs.addEventListener('change', (e)=> setFilter({ status: e.target.value }));

    const $fa = el.filterAssignee();
    if ($fa) $fa.addEventListener('change', (e)=> setFilter({ assignee: e.target.value }));

    const $fp = el.filterPriority();
    if ($fp) $fp.addEventListener('change', (e)=> setFilter({ priority: e.target.value }));

    const $ft = el.filterTags();
    if ($ft) $ft.addEventListener('change', (e)=> {
      const val = e.target.value.trim();
      const tags = val ? val.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean) : [];
      setFilter({ tags });
    });
  };

  // ---- Public API
  const init = () => {
    load();
    seedIfEmpty();
    hookForm();
    hookList();
    hookToolbar();
    render();
  };

  return { init, add, update, remove, setFilter };
})();

// Boot Tasks : initialise si la section existe au chargement (sécurité)
document.addEventListener('DOMContentLoaded', () => {
  const hasTasks = document.querySelector('#tasks');
  if (hasTasks) Tasks.init();
});


// =======================
// === TASKS (Step 3) END
// =======================

// =======================
// === FORECAST (Module) START
// =======================

/**
 * Tables utilisées :
 * - forecast_totals: { region, total_volume }
 * - forecast_monthly: { region, month_index (1..12), share_percent }
 * - forecast_weekly: { region, week_index (1..53), share_percent }
 * - forecast_daily: { region, weekday (1..7 Mon..Sun), share_percent,
 *                     email_pct, call_pct, chat_pct, clienteling_pct, fraud_pct, admin_pct }
 * - forecast_hourly: { region, hour (0..23), share_percent }
 */

const Forecast = (() => {
  const $ = (s) => document.querySelector(s);
  const els = {
    region: () => $('#fc-region'),
    month:  () => $('#fc-month'),
    load:   () => $('#fc-load'),
    total:  () => $('#fc-total'),
    saveTotal: () => $('#fc-save-total'),
    monthlyWrap: () => $('#fc-monthly'),
    monthlySum:  () => $('#fc-monthly-sum'),
    saveMonthly: () => $('#fc-save-monthly'),
    weeklyWrap: () => $('#fc-weekly'),
    weeklySum:  () => $('#fc-weekly-sum'),
    saveWeekly: () => $('#fc-save-weekly'),
    dailyWrap: () => $('#fc-daily'),
    dailyCheck:() => $('#fc-daily-check'),
    saveDaily: () => $('#fc-save-daily'),
    hourlyWrap: () => $('#fc-hourly'),
    hourlySum:  () => $('#fc-hourly-sum'),
    saveHourly: () => $('#fc-save-hourly'),
  };

  const sum = (arr) => arr.reduce((a,b)=>a+(parseFloat(b)||0), 0);
  const clamp2 = (n) => Math.round((parseFloat(n)||0) * 100) / 100;

  async function getDefaultRegion() {
    const local = localStorage.getItem("pmv2_default_region");
    if (local) return local;
    const { data } = await supabase.from("profiles").select("default_region").maybeSingle();
    return data?.default_region || "EMEA";
  }

  // ---------- FETCH ----------
  async function fetchTotals(region) {
    const { data } = await supabase.from('forecast_totals').select('total_volume').eq('region', region).maybeSingle();
    return data?.total_volume ?? 0;
  }

  async function fetchMonthly(region) {
    const { data } = await supabase.from('forecast_monthly').select('month_index, share_percent').eq('region', region).order('month_index');
    const map = new Map((data||[]).map(r => [r.month_index, r.share_percent]));
    return Array.from({length:12}, (_,i)=> ({ month:i+1, pct: map.get(i+1) ?? clamp2(100/12) }));
  }

  async function fetchWeekly(region) {
    const { data } = await supabase.from('forecast_weekly').select('week_index, share_percent').eq('region', region).order('week_index');
    const map = new Map((data||[]).map(r => [r.week_index, r.share_percent]));
    return Array.from({length:53}, (_,i)=> ({ week:i+1, pct: map.get(i+1) ?? clamp2(100/52) }));
  }

  async function fetchDaily(region) {
    const { data } = await supabase
      .from('forecast_daily')
      .select('weekday, share_percent, email_pct, call_pct, chat_pct, clienteling_pct, fraud_pct, admin_pct')
      .eq('region', region)
      .order('weekday');

    const defaults = [
      { weekday:1, name:'Mon' }, { weekday:2, name:'Tue' }, { weekday:3, name:'Wed' },
      { weekday:4, name:'Thu' }, { weekday:5, name:'Fri' }, { weekday:6, name:'Sat' }, { weekday:7, name:'Sun' },
    ];
    const byWd = {}; (data||[]).forEach(r => byWd[r.weekday] = r);

    return defaults.map(d => {
      const r = byWd[d.weekday] || {};
      return {
        weekday:d.weekday, name:d.name,
        share: r.share_percent ?? clamp2(100/7),
        email: r.email_pct ?? 38,
        call: r.call_pct ?? 36,
        chat: r.chat_pct ?? 0,
        clienteling: r.clienteling_pct ?? 3,
        fraud: r.fraud_pct ?? 0,
        admin: r.admin_pct ?? 26
      };
    });
  }

async function fetchHourly(region) {
  const { data, error } = await supabase
    .from('forecast_hourly')
    .select('hhmm, share_percent')
    .eq('region', region)
    .order('hhmm');
  if (error) throw error;

  // Agrège 2 créneaux de 30 min -> 1 heure
  const byHour = new Array(24).fill(0);
  (data || []).forEach(r => {
    const h = parseInt(r.hhmm.slice(0,2), 10); // "HH"
    byHour[h] += parseFloat(r.share_percent) || 0;
  });
  return byHour.map((pct, hour) => ({ hour, pct: Math.round(pct * 100) / 100 }));
}


  // ---------- RENDER ----------
  function renderMonthly(rows){
    const wrap = els.monthlyWrap();
    const head = `<thead><tr><th>Month</th>${rows.map(r=>`<th>${r.month}</th>`).join('')}</tr></thead>`;
    const row = `<tr><td>%</td>${rows.map(r=>`<td><input type="number" step="0.01" min="0" data-m="${r.month}" value="${r.pct}"/></td>`).join('')}</tr>`;
    wrap.innerHTML = `<table>${head}<tbody>${row}</tbody></table>`;
    updateMonthlySum();
    wrap.querySelectorAll('input').forEach(inp => inp.addEventListener('input', updateMonthlySum));
  }

  function updateMonthlySum(){
    const wrap = els.monthlyWrap();
    const vals = Array.from(wrap.querySelectorAll('input')).map(i=>parseFloat(i.value)||0);
    const s = clamp2(sum(vals));
    els.monthlySum().textContent = `Sum = ${s}% ${s===100?'(OK)':'(should be 100%)'}`;
    wrap.querySelectorAll('input').forEach(i => i.classList.toggle('bad', s!==100));
  }

  function renderWeekly(rows){
    const wrap = els.weeklyWrap();
    const chunk = (arr,n)=> arr.reduce((a,_,i)=> (i%n? a[a.length-1].push(arr[i]) : a.push([arr[i]]), a), []);
    const groups = chunk(rows, 13);
    let html = '<table>';
    groups.forEach((g,idx)=>{
      html += `<thead><tr><th>Week ${idx*13+1}..${idx*13+g.length}</th>${g.map(r=>`<th>${r.week}</th>`).join('')}</tr></thead>`;
      html += `<tbody><tr><td>%</td>${g.map(r=>`<td><input type="number" step="0.01" min="0" data-w="${r.week}" value="${r.pct}"/></td>`).join('')}</tr></tbody>`;
    });
    html += '</table>';
    wrap.innerHTML = html;
    updateWeeklySum();
    wrap.querySelectorAll('input').forEach(inp => inp.addEventListener('input', updateWeeklySum));
  }

  function updateWeeklySum(){
    const wrap = els.weeklyWrap();
    const vals = Array.from(wrap.querySelectorAll('input')).map(i=>parseFloat(i.value)||0);
    const s = clamp2(sum(vals));
    els.weeklySum().textContent = `Sum ≈ ${s}% (guide ~100%)`;
  }

  function renderDaily(rows){
    const wrap = els.dailyWrap();
    const head = `<thead>
      <tr>
        <th>Day</th><th>Day %</th>
        <th>Mail %</th><th>Call %</th><th>Chat %</th>
        <th>Clienteling %</th><th>Fraud %</th><th>Back Office %</th>
      </tr>
    </thead>`;
    const body = rows.map(r=>`
      <tr data-wd="${r.weekday}">
        <td>${r.name}</td>
        <td><input type="number" step="0.01" class="fc-d-share" value="${r.share}"/></td>
        <td><input type="number" step="0.01" class="fc-d-mail" value="${r.email}"/></td>
        <td><input type="number" step="0.01" class="fc-d-call" value="${r.call}"/></td>
        <td><input type="number" step="0.01" class="fc-d-chat" value="${r.chat}"/></td>
        <td><input type="number" step="0.01" class="fc-d-clienteling" value="${r.clienteling}"/></td>
        <td><input type="number" step="0.01" class="fc-d-fraud" value="${r.fraud}"/></td>
        <td><input type="number" step="0.01" class="fc-d-admin" value="${r.admin}"/></td>
      </tr>`).join('');
    wrap.innerHTML = `<table>${head}<tbody>${body}</tbody></table>`;
    updateDailyChecks();
    wrap.querySelectorAll('input').forEach(inp => inp.addEventListener('input', updateDailyChecks));
  }

  function updateDailyChecks(){
    const wrap = els.dailyWrap();
    const dayShare = Array.from(wrap.querySelectorAll('.fc-d-share')).map(i=>parseFloat(i.value)||0);
    const daySum = clamp2(sum(dayShare));
    let allOk = true;
    wrap.querySelectorAll('tbody tr').forEach(tr=>{
      const vals = ['.fc-d-mail','.fc-d-call','.fc-d-chat','.fc-d-clienteling','.fc-d-fraud','.fc-d-admin']
        .map(sel=>parseFloat(tr.querySelector(sel).value)||0);
      const s = clamp2(sum(vals));
      const bad = s!==100;
      ['.fc-d-mail','.fc-d-call','.fc-d-chat','.fc-d-clienteling','.fc-d-fraud','.fc-d-admin']
        .forEach(sel=>tr.querySelector(sel).classList.toggle('bad', bad));
      if (bad) allOk = false;
    });
    els.dailyCheck().textContent = `Day% sum = ${daySum}% ${daySum===100?'(OK)':'(should be 100%)'} | Channels per day ${allOk?'(OK)':'(check rows)'}`;
  }

  function renderHourly(rows){
    const wrap = els.hourlyWrap();
    const head = `<thead><tr><th>Hour</th>${rows.map(r=>`<th>${r.hour}</th>`).join('')}</tr></thead>`;
    const row = `<tr><td>%</td>${rows.map(r=>`<td><input type="number" step="0.01" min="0" data-h="${r.hour}" value="${r.pct}"/></td>`).join('')}</tr>`;
    wrap.innerHTML = `<table>${head}<tbody>${row}</tbody></table>`;
    updateHourlySum();
    wrap.querySelectorAll('input').forEach(inp => inp.addEventListener('input', updateHourlySum));
  }

  function updateHourlySum(){
    const wrap = els.hourlyWrap();
    const vals = Array.from(wrap.querySelectorAll('input')).map(i=>parseFloat(i.value)||0);
    const s = clamp2(sum(vals));
    els.hourlySum().textContent = `Sum = ${s}% ${s===100?'(OK)':'(should be 100%)'}`;
    wrap.querySelectorAll('input').forEach(i => i.classList.toggle('bad', s!==100));
  }

  // ---------- SAVE ----------
  async function saveTotals(region){
    const total = parseInt(els.total().value||'0',10);
    await supabase.from('forecast_totals').upsert({ region, total_volume: total }, { onConflict:'region' });
    alert('Totals saved.');
  }

  async function saveMonthly(region){
    const inputs = els.monthlyWrap().querySelectorAll('input');
    const rows = Array.from(inputs).map(i=>({ month_index: parseInt(i.dataset.m,10), share_percent: clamp2(i.value) }));
    await supabase.from('forecast_monthly').upsert(rows.map(r=>({ region, ...r })), { onConflict:'region,month_index' });
    alert('Monthly saved.');
  }

  async function saveWeekly(region){
    const inputs = els.weeklyWrap().querySelectorAll('input');
    const rows = Array.from(inputs).map(i=>({ week_index: parseInt(i.dataset.w,10), share_percent: clamp2(i.value) }));
    await supabase.from('forecast_weekly').upsert(rows.map(r=>({ region, ...r })), { onConflict:'region,week_index' });
    alert('Weekly saved.');
  }

  async function saveDaily(region){
    const trs = els.dailyWrap().querySelectorAll('tbody tr');
    const rows = Array.from(trs).map(tr=>{
      const get = sel=>clamp2(tr.querySelector(sel).value);
      return {
        weekday: parseInt(tr.dataset.wd,10),
        share_percent: get('.fc-d-share'),
        email_pct: get('.fc-d-mail'),
        call_pct: get('.fc-d-call'),
        chat_pct: get('.fc-d-chat'),
        clienteling_pct: get('.fc-d-clienteling'),
        fraud_pct: get('.fc-d-fraud'),
        admin_pct: get('.fc-d-admin'),
      };
    });
    await supabase.from('forecast_daily').upsert(rows.map(r=>({ region, ...r })), { onConflict:'region,weekday' });
    alert('Daily saved.');
  }

async function saveHourly(region){
  // Lis les 24 inputs (0..23) et répartis sur 2 slots HH:00 / HH:30
  const inputs = els.hourlyWrap().querySelectorAll('input');
  const rows = [];
  inputs.forEach(i => {
    const hour = parseInt(i.dataset.h,10);
    const pct = Math.round((parseFloat(i.value)||0) * 100) / 100;
    const half = Math.round((pct / 2) * 100) / 100;
    const hh = String(hour).padStart(2,'0');
    rows.push({ region, hhmm: `${hh}:00`, share_percent: half });
    rows.push({ region, hhmm: `${hh}:30`, share_percent: half });
  });

  // Upsert par (owner_id, region, hhmm) — owner_id est fixé par trigger DB
  const { error } = await supabase.from('forecast_hourly').upsert(rows, {
    onConflict: 'owner_id,region,hhmm'
  });
  if (error) throw error;
  alert('Hourly saved.');
}


  // ---------- LOAD ----------
  async function loadAll(){
    const region = els.region().value;
    els.total().value = await fetchTotals(region);
    renderMonthly(await fetchMonthly(region));
    renderWeekly(await fetchWeekly(region));
    renderDaily(await fetchDaily(region));
    renderHourly(await fetchHourly(region));
  }

  // ---------- INIT ----------
  async function init(){
    els.month().value = new Date().toISOString().slice(0,7);
    els.region().value = await getDefaultRegion();

    els.load().addEventListener('click', loadAll);
    els.saveTotal().addEventListener('click', ()=>saveTotals(els.region().value));
    els.saveMonthly().addEventListener('click', ()=>saveMonthly(els.region().value));
    els.saveWeekly().addEventListener('click', ()=>saveWeekly(els.region().value));
    els.saveDaily().addEventListener('click', ()=>saveDaily(els.region().value));
    els.saveHourly().addEventListener('click', ()=>saveHourly(els.region().value));

    await loadAll();
  }

  return { init };
})();

async function initForecastUI(){
  const hasPanel = document.querySelector('#forecast-section');
  if (!hasPanel) return;
  await Forecast.init();
}

// =======================
// === FORECAST (Module) END
// =======================
// =======================
// === WEEKLY (Module) START
// =======================

/**
 * Weekly Planning: timeline 30 min par agent + comparaison demande/capacité
 * Hypothèses:
 * - On réutilise tes helpers existants:
 *   - fetchAgentsWithPTO(region)
 *   - fetchRegulations(region)
 *   - computeNetCapacityPerAgentMin(reg)
 *   - fetchForecastPieces(region, y, m, d)  -> totalVolume, monthlyShare, weeklyShare, dailyShare, dailyTaskPct, tasks
 *   - sumDemandMinutes(totalVolumeDay, dailyTaskPct, tasks)
 * - forecast_hourly (hhmm, share_percent) distribue la journée (somme = 100).
 */

const Weekly = (() => {
  const $ = (s)=>document.querySelector(s);
  const els = {
    region: ()=>$('#wp-region'),
    week: ()=>$('#wp-week'),
    dayStart: ()=>$('#wp-day-start'),
    dayEnd: ()=>$('#wp-day-end'),
    load: ()=>$('#wp-load'),
    exportBtn: ()=>$('#wp-export'),
    grid: ()=>$('#wp-grid'),

    agentsCount: ()=>$('#wp-agents-count'),
    coverageAvg: ()=>$('#wp-coverage-avg'),
    understaffed: ()=>$('#wp-understaffed'),
  };

  // ---- Utils
  const parseWeekInput = (val) => {
    // "YYYY-Www" -> date du lundi
    const [y, w] = val.split('-W').map(x=>parseInt(x,10));
    return isoWeekToDate(y, w); // retourne le lundi de la semaine ISO
  };

  function isoWeekToDate(year, week) {
    // Trouve le jeudi de la semaine 1
    const simple = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = simple.getUTCDay() || 7;
    const thursday = new Date(simple);
    thursday.setUTCDate(simple.getUTCDate() + (4 - dayOfWeek));
    // Lundi de la semaine demandée
    const monday = new Date(thursday);
    monday.setUTCDate(thursday.getUTCDate() - 3 + (week - 1) * 7);
    return monday; // UTC
  }

  function addDays(date, n){
    const d = new Date(date); d.setUTCDate(d.getUTCDate()+n); return d;
  }
  function ymd(date){ return date.toISOString().slice(0,10); }

  function minutesBetween(hhmmStart, hhmmEnd){
    const [sh, sm] = hhmmStart.split(':').map(Number);
    const [eh, em] = hhmmEnd.split(':').map(Number);
    return (eh*60+em) - (sh*60+sm);
  }

  function hhmmAdd(hhmm, deltaMin){
    let [h,m] = hhmm.split(':').map(Number);
    let total = h*60+m + deltaMin;
    if (total<0) total=0;
    const nh = Math.floor(total/60), nm = total%60;
    return `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`;
  }

  // ---- Forecast hourly (hhmm -> %)
  async function fetchHourlyShares(region){
    const { data, error } = await supabase
      .from('forecast_hourly')
      .select('hhmm, share_percent')
      .eq('region', region)
      .order('hhmm');
    if (error) throw error;
    const map = new Map();
    (data||[]).forEach(r => map.set(r.hhmm, parseFloat(r.share_percent)||0));
    // Si vide, seed plat 10:00..18:00 (9h -> 18 tranches de 30 min)
    if (!map.size){
      for (let h=10; h<=18; h++){
        map.set(`${String(h).padStart(2,'0')}:00`, +(100/18).toFixed(2));
        map.set(`${String(h).padStart(2,'0')}:30`, +(100/18).toFixed(2));
      }
    }
    return map; // somme ≈ 100
  }

  // ---- Build slots grid (Mon..Sun x 30 min)
  function buildWeekSlots(mondayUTC, dayStart, dayEnd){
    // Liste des jours (UTC) + slots internes
    const days = Array.from({length:7}, (_,i)=> addDays(mondayUTC, i));
    const slots = [];
    let cursor = dayStart;
    while (cursor < dayEnd){
      slots.push(cursor);
      cursor = hhmmAdd(cursor, 30);
    }
    return { days, slots }; // slots = ["09:00","09:30",...]
  }

  // ---- Demand per slot
  async function computeDemandPerSlot(region, mondayUTC, dayStart, dayEnd, slots){
    const demand = {}; // key = YYYY-MM-DD|HH:MM -> minutes
    const hourly = await fetchHourlyShares(region); // % sur la journée (somme ≈100)

    for (let i=0; i<7; i++){
      const d = addDays(mondayUTC, i);
      const dateISO = ymd(d);
      const y = d.getUTCFullYear(), m = d.getUTCMonth()+1, day = d.getUTCDate();

      // Forecast du jour (déjà utilisé par Attendance)
      const f = await fetchForecastPieces(region, y, m, day);
      const totalDay = f.totalVolume * f.monthlyShare * f.weeklyShare * f.dailyShare;
      const demandMinutesDay = sumDemandMinutes(totalDay, f.dailyTaskPct, f.tasks);

      // Normalise part horaire aux slots visibles (dayStart..dayEnd)
      const dayKeys = Array.from(hourly.keys()).filter(h=> h>=dayStart && h<dayEnd);
      const sumVisible = dayKeys.reduce((s,k)=> s+(hourly.get(k)||0), 0) || 1;

      for (const hhmm of slots){
        if (!dayKeys.includes(hhmm)) continue;
        const pct = (hourly.get(hhmm)||0) / sumVisible; // part relative dans la fenêtre visible
        const mins = demandMinutesDay * pct;
        demand[`${dateISO}|${hhmm}`] = mins;
      }
    }
    return demand; // minutes de travail requis par slot
  }

  // ---- Capacity per slot
  async function computeCapacityPerSlot(region, mondayUTC, dayStart, dayEnd, slots){
    const regs = await fetchRegulations(region);
    const netCapPerAgentMin = computeNetCapacityPerAgentMin(regs);
    const workWindowMin = Math.max(30, minutesBetween(dayStart, dayEnd));
    const perAgentPerMinute = netCapPerAgentMin / workWindowMin; // capacité lissée

    const agents = await fetchAgentsWithPTO(region);
    const cap = {}; // key = YYYY-MM-DD|HH:MM -> minutes de capacité
    const presentAgentsByDate = {}; // stats

    for (let i=0; i<7; i++){
      const d = addDays(mondayUTC, i);
      const dateISO = ymd(d);
      const present = agents.filter(a => a.status === "Present" && !agentIsOffThatDate(a, dateISO));
      presentAgentsByDate[dateISO] = present.length;

      for (const hhmm of slots){
        const slotMin = 30;
        const perAgentSlot = perAgentPerMinute * slotMin;
        cap[`${dateISO}|${hhmm}`] = present.length * perAgentSlot;
      }
    }

    return { cap, presentAgentsByDate, perAgentPerMinute };
  }

  // ---- Render grid
  function renderGrid(days, slots, demand, cap, agents){
    const $grid = els.grid();
    if (!$grid) return;

    // THEAD
    let thead = `<thead><tr><th class="first-col">Row</th>`;
    // colonnes par slot avec marqueur d’heure pleine
    slots.forEach((s, idx)=>{
      const hourMark = s.endsWith(':00') ? 'hour-marker' : '';
      thead += `<th class="slot-col ${hourMark}">${s}</th>`;
    });
    thead += `</tr></thead>`;

    // TBODY
    let tbody = '';

    // Ligne 1: Demand vs Capacity (couleurs)
    for (let i=0; i<7; i++){
      const dateISO = ymd(addDays(days[0], i));
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

    // Lignes agents: présence vs PTO
    agents.forEach(a=>{
      let row = `<tr><td class="first-col">${a.full_name}</td>`;
      for (let i=0; i<7; i++){
        const dateISO = ymd(addDays(days[0], i));
        const off = agentIsOffThatDate(a, dateISO);
        const cls = off ? 'pto' : 'present';
        slots.forEach(s=>{
          row += `<td><div class="cell ${cls}"></div></td>`;
        });
      }
      row += `</tr>`;
      tbody += row;
    });

    $grid.innerHTML = thead + `<tbody>${tbody}</tbody>`;
  }

  // ---- Summary chips
  function renderSummaries(days, slots, demand, cap, presentAgentsByDate){
    // Agents (present) = moyenne jour (ou Lundi)
    const agentsAvg = Math.round(
      Object.values(presentAgentsByDate).reduce((a,b)=>a+b,0) / Object.values(presentAgentsByDate).length || 0
    );

    // Coverage avg & understaffed slots
    let totalD=0, totalC=0, gaps=0;
    for (let i=0; i<7; i++){
      const dateISO = ymd(addDays(days[0], i));
      slots.forEach(s=>{
        const key = `${dateISO}|${s}`;
        const d = demand[key]||0, c = cap[key]||0;
        totalD += d; totalC += c;
        if (d > c) gaps++;
      });
    }
    const coverage = totalD>0 ? Math.min(100, Math.round((totalC/totalD)*100)) : 100;

    els.agentsCount().textContent = `${agentsAvg}`;
    els.coverageAvg().textContent = `${coverage}%`;
    els.understaffed().textContent = `${gaps}`;
  }

  // ---- Export CSV
  function exportCSV(region, days, slots, demand, cap){
    let csv = `Region,${region}\n`;
    csv += `Slot,Date,Time,Demand_Min,Capacity_Min\n`;
    let idx=1;
    for (let i=0; i<7; i++){
      const dateISO = ymd(addDays(days[0], i));
      for (const s of slots){
        const key = `${dateISO}|${s}`;
        const d = Math.round(demand[key]||0);
        const c = Math.round(cap[key]||0);
        csv += `${idx},${dateISO},${s},${d},${c}\n`;
        idx++;
      }
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `weekly_planning_${region}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- INIT / LOAD
  async function load(){
    const region = els.region().value;
    const weekVal = els.week().value;
    const dayStart = els.dayStart().value || '09:00';
    const dayEnd = els.dayEnd().value || '18:00';

    if (!weekVal){ alert('Select an ISO week'); return; }
    if (minutesBetween(dayStart, dayEnd) < 30){ alert('Day end must be after start by at least 30 min'); return; }

    const monday = parseWeekInput(weekVal); // UTC
    const { days, slots } = buildWeekSlots(monday, dayStart, dayEnd);

    // Demande et capacité
    const demand = await computeDemandPerSlot(region, monday, dayStart, dayEnd, slots);
    const { cap, presentAgentsByDate } = await computeCapacityPerSlot(region, monday, dayStart, dayEnd, slots);

    // Agents (pour les lignes agent)
    const agents = await fetchAgentsWithPTO(region);

    // Render
    renderGrid(days, slots, demand, cap, agents);
    renderSummaries(days, slots, demand, cap, presentAgentsByDate);

    // Hook export
    els.exportBtn().onclick = ()=> exportCSV(region, days, slots, demand, cap);
  }

  async function init(){
    // Defaults
    els.region().value = await getDefaultRegionFromProfile();
    // ISO week par défaut = semaine courante
    const now = new Date();
    const week = isoWeekNumber(now); // helper existant
    const y = now.getFullYear();
    els.week().value = `${y}-W${String(week).padStart(2,'0')}`;

    els.load().addEventListener('click', load);
  }

  return { init };
})();

async function initWeeklyUI(){
  const panel = document.querySelector('#weekly');
  if (!panel) return;
  await Weekly.init();
}

// =======================
// === WEEKLY (Module) END
// =======================
/* ============================================================
   REGULATION MODULE — à coller TOUT EN BAS de app.js
   Gère : CRUD des règles, toggle d’application, validation, export CSV
   Dépendances : 
     - supabase (client global déjà initialisé)
     - éléments HTML/IDs créés dans l’onglet "Regulation"
   ============================================================ */
(() => {
  const qs  = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // --- Sélecteurs UI
  const el = {
    tabPanel: qs('#regulation'),
    enforceToggle: qs('#enforceRegulationsToggle'),
    addRuleBtn: qs('#addRuleBtn'),
    validateAllBtn: qs('#validateAllBtn'),
    exportViolationsBtn: qs('#exportViolationsBtn'),
    ruleSearch: qs('#ruleSearch'),

    // Summary
    activeRulesCount: qs('#activeRulesCount'),
    violationsCount: qs('#violationsCount'),
    lastValidationAt: qs('#lastValidationAt'),

    // Tables
    rulesTbody: qs('#regulationTableBody'),
    violationsPanel: qs('#violationsPanel'),
    violationsTbody: qs('#violationsTableBody'),

    // Modal Règle
    ruleModal: qs('#ruleModal'),
    ruleForm: qs('#ruleForm'),
    ruleModalTitle: qs('#ruleModalTitle'),
    closeRuleModal: qs('#closeRuleModal'),
    cancelRuleBtn: qs('#cancelRuleBtn'),

    // Champs formulaire
    ruleId: qs('#ruleId'),
    ruleName: qs('#ruleName'),
    ruleType: qs('#ruleType'),
    ruleParam1: qs('#ruleParam1'),
    ruleParam2: qs('#ruleParam2'),
    ruleParam1Label: qs('#ruleParam1Label'),
    ruleParam2Label: qs('#ruleParam2Label'),
    ruleScope: qs('#ruleScope'),
    scopeTargetField: qs('#scopeTargetField'),
    scopeTargetLabel: qs('#scopeTargetLabel'),
    ruleScopeTarget: qs('#ruleScopeTarget'),
    ruleSeverity: qs('#ruleSeverity'),
    ruleActive: qs('#ruleActive'),

    // Confirm delete
    confirmDeleteModal: qs('#confirmDeleteModal'),
    confirmDeleteBtn: qs('#confirmDeleteBtn'),
    cancelDeleteBtn: qs('#cancelDeleteBtn'),
  };

  // --- State
  let rules = [];
  let filteredRules = [];
  let violations = [];
  let pendingDeleteId = null;

  // --- Helpers
  const toBool = (v) => (v === true || v === 'true' || v === 1 || v === '1');
  const fmtDate = (d) => {
    try {
      const x = (d instanceof Date) ? d : new Date(d);
      return x.toLocaleString();
    } catch { return '–'; }
  };
  const downloadTextFile = (filename, text) => {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- Stockage du toggle "enforce"
  const ENFORCE_LOCAL_KEY = 'pm_enforce_regulations';
  const loadEnforceLocal = () => toBool(localStorage.getItem(ENFORCE_LOCAL_KEY));
  const saveEnforceLocal = (v) => localStorage.setItem(ENFORCE_LOCAL_KEY, v ? 'true' : 'false');

  // --- Adaptation labels selon type de règle
  const updateParamLabels = () => {
    const t = el.ruleType.value;
    if (t === 'MAX_HOURS_PER_WEEK') {
      el.ruleParam1Label.textContent = 'Heures max / semaine';
      el.ruleParam2Label.textContent = 'Paramètre 2 (optionnel)';
      el.ruleParam1.type = 'number';
      el.ruleParam2.type = 'number';
      el.ruleParam1.placeholder = 'Ex: 40';
      el.ruleParam2.placeholder = '';
    } else if (t === 'MIN_REST_BETWEEN_SHIFTS') {
      el.ruleParam1Label.textContent = 'Repos minimum (heures)';
      el.ruleParam2Label.textContent = 'Paramètre 2 (optionnel)';
      el.ruleParam1.type = 'number';
      el.ruleParam2.type = 'number';
      el.ruleParam1.placeholder = 'Ex: 11';
      el.ruleParam2.placeholder = '';
    } else if (t === 'NO_OVERLAP_SHIFTS') {
      el.ruleParam1Label.textContent = 'Paramètre 1 (non requis)';
      el.ruleParam2Label.textContent = 'Paramètre 2 (non requis)';
      el.ruleParam1.placeholder = '';
      el.ruleParam2.placeholder = '';
    } else if (t === 'NO_PTO_OVERBOOKING') {
      el.ruleParam1Label.textContent = 'Paramètre 1 (non requis)';
      el.ruleParam2Label.textContent = 'Paramètre 2 (non requis)';
      el.ruleParam1.placeholder = '';
      el.ruleParam2.placeholder = '';
    } else if (t === 'HOLIDAY_BLACKOUT') {
      el.ruleParam1Label.textContent = 'Jour férié (AAAA-MM-JJ) ou pattern';
      el.ruleParam2Label.textContent = 'Paramètre 2 (optionnel)';
      el.ruleParam1.type = 'text';
      el.ruleParam2.type = 'text';
      el.ruleParam1.placeholder = 'Ex: 2025-12-25 ou WE';
      el.ruleParam2.placeholder = '';
    }
  };

  const updateScopeVisibility = () => {
    const s = el.ruleScope.value;
    if (s === 'REGION') {
      el.scopeTargetLabel.textContent = 'Code Région (ex: EMEA)';
      el.scopeTargetField.hidden = false;
    } else if (s === 'AGENT') {
      el.scopeTargetLabel.textContent = 'Agent ID';
      el.scopeTargetField.hidden = false;
    } else {
      el.scopeTargetField.hidden = true;
      el.ruleScopeTarget.value = '';
    }
  };

  // --- CRUD Supabase (tables conseillées)
  // Table "regulations":
  // id uuid (pk) | name text | type text | param1 numeric? | param2 numeric? | scope text | scope_target text | severity text | active boolean | created_at timestamptz default now()
  const fetchRegulations = async () => {
    if (!window.supabase) { console.warn('[Regulation] supabase non trouvé'); return []; }
    const { data, error } = await supabase
      .from('regulations')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) { console.warn('[Regulation] fetchRegulations error:', error.message); return []; }
    return data || [];
  };

  const upsertRule = async (payload) => {
    if (!window.supabase) return { error: new Error('Supabase client manquant') };
    // upsert by id if present
    const { data, error } = await supabase
      .from('regulations')
      .upsert(payload)
      .select()
      .single();
    return { data, error };
  };

  const deleteRule = async (id) => {
    if (!window.supabase) return { error: new Error('Supabase client manquant') };
    const { error } = await supabase.from('regulations').delete().eq('id', id);
    return { error };
  };

  // --- Validation (lecture des shifts ; ajuster nom de table/colonnes si besoin)
  // Table "shifts" attendue : id, agent_id, start_time (timestamptz), end_time (timestamptz)
  const fetchShifts = async () => {
    if (!window.supabase) return [];
    const { data, error } = await supabase
      .from('shifts')
      .select('id,agent_id,start_time,end_time');
    if (error) { console.warn('[Regulation] fetchShifts error:', error.message); return []; }
    return data || [];
  };

  // Optionnel : PTO / holidays si tu as ces tables
  const fetchPTO = async () => {
    if (!window.supabase) return [];
    const { data, error } = await supabase
      .from('pto')
      .select('agent_id,start_date,end_date');
    if (error) return [];
    return data || [];
  };

  // --- Moteur de validation de base (MAX_HOURS_PER_WEEK, MIN_REST_BETWEEN_SHIFTS, NO_OVERLAP_SHIFTS, NO_PTO_OVERBOOKING)
  const hoursBetween = (a, b) => Math.abs((new Date(b) - new Date(a)) / 36e5);
  const getISOWeek = (date) => {
    const d = new Date(date);
    d.setHours(0,0,0,0);
    // jeudi de la semaine
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  };

  const applyScope = (rule, item) => {
    // Scope GLOBAL / REGION / AGENT
    if (rule.scope === 'AGENT' && rule.scope_target) {
      return String(item.agent_id) === String(rule.scope_target);
    }
    if (rule.scope === 'REGION' && rule.scope_target) {
      // Si tu as une table agents avec region_code, tu peux enrichir "item.agent_region"
      // Ici on assume que "item.agent_region" pourrait exister ; sinon on traite comme global
      if (item.agent_region) return String(item.agent_region) === String(rule.scope_target);
    }
    // GLOBAL par défaut
    return true;
  };

  const runValidation = (rulesActive, shifts, ptoList=[]) => {
    const out = [];
    // Préparer shifts triés par agent puis par start_time
    const byAgent = {};
    shifts.forEach(s => {
      if (!byAgent[s.agent_id]) byAgent[s.agent_id] = [];
      byAgent[s.agent_id].push(s);
    });
    Object.values(byAgent).forEach(list => list.sort((a,b) => new Date(a.start_time) - new Date(b.start_time)));

    // PTO map (par agent -> liste de ranges)
    const ptoMap = {};
    ptoList.forEach(p => {
      if (!ptoMap[p.agent_id]) ptoMap[p.agent_id] = [];
      ptoMap[p.agent_id].push([new Date(p.start_date), new Date(p.end_date)]);
    });

    const active = rulesActive.filter(r => r.active);

    // MAX_HOURS_PER_WEEK
    const maxWeekRules = active.filter(r => r.type === 'MAX_HOURS_PER_WEEK' && r.param1);
    if (maxWeekRules.length) {
      const weekHours = {}; // key: agent_id|year|week -> hours
      shifts.forEach(s => {
        const st = new Date(s.start_time), et = new Date(s.end_time);
        const hrs = Math.max(0, (et - st) / 36e5);
        const week = getISOWeek(st);
        const key = `${s.agent_id}|${st.getUTCFullYear()}|${week}`;
        weekHours[key] = (weekHours[key] || 0) + hrs;
      });
      for (const rule of maxWeekRules) {
        for (const key in weekHours) {
          const [agent_id, year, week] = key.split('|');
          const total = weekHours[key];
          if (!applyScope(rule, { agent_id })) continue;
          if (total > Number(rule.param1)) {
            out.push({
              rule: rule.name || 'Max heures / semaine',
              agent_id,
              shift: `Semaine ${week} ${year}`,
              detail: `Total ${total.toFixed(1)}h > ${Number(rule.param1)}h`,
              severity: rule.severity || 'WARN'
            });
          }
        }
      }
    }

    // MIN_REST_BETWEEN_SHIFTS
    const restRules = active.filter(r => r.type === 'MIN_REST_BETWEEN_SHIFTS' && r.param1);
    if (restRules.length) {
      for (const agentId in byAgent) {
        const list = byAgent[agentId];
        for (let i = 1; i < list.length; i++) {
          const prev = list[i-1], cur = list[i];
          const restH = hoursBetween(prev.end_time, cur.start_time);
          for (const rule of restRules) {
            if (!applyScope(rule, { agent_id: agentId })) continue;
            if (restH < Number(rule.param1)) {
              out.push({
                rule: rule.name || 'Repos minimum',
                agent_id: agentId,
                shift: `${fmtDate(cur.start_time)}`,
                detail: `Repos ${restH.toFixed(1)}h < ${Number(rule.param1)}h`,
                severity: rule.severity || 'WARN'
              });
            }
          }
        }
      }
    }

    // NO_OVERLAP_SHIFTS
    const overlapRules = active.filter(r => r.type === 'NO_OVERLAP_SHIFTS');
    if (overlapRules.length) {
      for (const agentId in byAgent) {
        const list = byAgent[agentId];
        for (let i = 1; i < list.length; i++) {
          const prev = list[i-1], cur = list[i];
          if (new Date(cur.start_time) < new Date(prev.end_time)) {
            for (const rule of overlapRules) {
              if (!applyScope(rule, { agent_id: agentId })) continue;
              out.push({
                rule: rule.name || 'Pas de chevauchement',
                agent_id: agentId,
                shift: `${fmtDate(cur.start_time)}`,
                detail: `Chevauchement avec shift précédent`,
                severity: rule.severity || 'BLOCK'
              });
            }
          }
        }
      }
    }

    // NO_PTO_OVERBOOKING
    const ptoRules = active.filter(r => r.type === 'NO_PTO_OVERBOOKING');
    if (ptoRules.length && Object.keys(ptoMap).length) {
      for (const agentId in byAgent) {
        const list = byAgent[agentId];
        const ranges = ptoMap[agentId] || [];
        if (!ranges.length) continue;
        for (const s of list) {
          const st = new Date(s.start_time), et = new Date(s.end_time);
          for (const [pst, pet] of ranges) {
            const overlap = st < pet && et > pst;
            if (overlap) {
              for (const rule of ptoRules) {
                if (!applyScope(rule, { agent_id: agentId })) continue;
                out.push({
                  rule: rule.name || 'Interdiction PTO',
                  agent_id: agentId,
                  shift: `${fmtDate(st)}`,
                  detail: `Shift pendant PTO (${pst.toISOString().slice(0,10)}→${pet.toISOString().slice(0,10)})`,
                  severity: rule.severity || 'BLOCK'
                });
              }
            }
          }
        }
      }
    }

    return out;
  };

  // --- Rendu UI
  const renderRules = () => {
    const rows = (filteredRules.length ? filteredRules : rules).map(r => {
      const statusBadge = r.active ? '<span class="badge success">Actif</span>' : '<span class="badge muted">Inactif</span>';
      const params = [r.param1, r.param2].filter(v => v !== null && v !== '' && v !== undefined).join(' · ') || '—';
      const scope = r.scope === 'GLOBAL' ? 'Global' : `${r.scope} : ${r.scope_target || '—'}`;
      return `
        <tr data-id="${r.id || ''}">
          <td>${r.name || '—'}</td>
          <td>${r.type || '—'}</td>
          <td>${params}</td>
          <td>${scope}</td>
          <td>${statusBadge}</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn js-edit" title="Éditer">✎</button>
              <button class="icon-btn js-delete" title="Supprimer">🗑</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    el.rulesTbody.innerHTML = rows || `<tr><td colspan="6">Aucune règle pour le moment.</td></tr>`;
    attachRowActions();
    el.activeRulesCount.textContent = rules.filter(r => r.active).length;
  };

  const renderViolations = () => {
    if (!violations.length) {
      el.violationsPanel.hidden = true;
      el.violationsTbody.innerHTML = '';
      el.violationsCount.textContent = '0';
      return;
    }
    el.violationsPanel.hidden = false;
    el.violationsCount.textContent = String(violations.length);
    const rows = violations.map(v => `
      <tr>
        <td>${v.rule}</td>
        <td>${v.agent_id}</td>
        <td>${v.shift}</td>
        <td>${v.detail}</td>
        <td>${v.severity}</td>
      </tr>
    `).join('');
    el.violationsTbody.innerHTML = rows;
  };

  // --- Actions lignes (edit/delete)
  const attachRowActions = () => {
    qsa('.js-edit', el.tabPanel).forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const id = tr?.dataset?.id;
        const r = rules.find(x => String(x.id) === String(id));
        openRuleModal(r || null);
      });
    });
    qsa('.js-delete', el.tabPanel).forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        pendingDeleteId = tr?.dataset?.id || null;
        if (el.confirmDeleteModal?.showModal) el.confirmDeleteModal.showModal();
      });
    });
  };

  // --- Modal CRUD
  const resetForm = () => {
    el.ruleForm.reset();
    el.ruleId.value = '';
    el.ruleScope.value = 'GLOBAL';
    updateScopeVisibility();
    el.ruleType.value = '';
    updateParamLabels();
    el.ruleActive.checked = true;
    el.ruleSeverity.value = 'WARN';
  };

  const openRuleModal = (rule=null) => {
    resetForm();
    if (rule) {
      el.ruleModalTitle.textContent = 'Éditer la règle';
      el.ruleId.value = rule.id || '';
      el.ruleName.value = rule.name || '';
      el.ruleType.value = rule.type || '';
      el.ruleParam1.value = (rule.param1 ?? '');
      el.ruleParam2.value = (rule.param2 ?? '');
      el.ruleScope.value = rule.scope || 'GLOBAL';
      updateScopeVisibility();
      el.ruleScopeTarget.value = rule.scope_target || '';
      el.ruleSeverity.value = rule.severity || 'WARN';
      el.ruleActive.checked = toBool(rule.active);
      updateParamLabels();
    } else {
      el.ruleModalTitle.textContent = 'Nouvelle règle';
    }
    if (el.ruleModal?.showModal) el.ruleModal.showModal();
  };

  const closeRuleModal = () => {
    if (el.ruleModal?.close) el.ruleModal.close();
  };

  // --- Recherche
  const applySearch = () => {
    const q = (el.ruleSearch.value || '').toLowerCase().trim();
    if (!q) { filteredRules = []; renderRules(); return; }
    filteredRules = rules.filter(r => {
      const hay = `${r.name||''} ${r.type||''} ${r.scope||''} ${r.scope_target||''}`.toLowerCase();
      return hay.includes(q);
    });
    renderRules();
  };

  // --- Export CSV
  const exportViolationsCSV = () => {
    if (!violations.length) return;
    const headers = ['regle','agent','shift','detail','gravite'];
    const lines = [headers.join(',')].concat(
      violations.map(v => [
        `"${String(v.rule).replace(/"/g,'""')}"`,
        `"${String(v.agent_id).replace(/"/g,'""')}"`,
        `"${String(v.shift).replace(/"/g,'""')}"`,
        `"${String(v.detail).replace(/"/g,'""')}"`,
        `"${String(v.severity).replace(/"/g,'""')}"`
      ].join(','))
    );
    downloadTextFile(`violations_${Date.now()}.csv`, lines.join('\n'));
  };

  // --- Init et events
  const initEvents = () => {
    el.addRuleBtn?.addEventListener('click', () => openRuleModal(null));
    el.closeRuleModal?.addEventListener('click', closeRuleModal);
    el.cancelRuleBtn?.addEventListener('click', closeRuleModal);

    el.ruleType?.addEventListener('change', updateParamLabels);
    el.ruleScope?.addEventListener('change', updateScopeVisibility);

    el.ruleForm?.addEventListener('submit', async (e) => {
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
      const { error } = await upsertRule(payload);
      if (error) {
        console.warn('[Regulation] save error:', error.message);
      }
      closeRuleModal();
      rules = await fetchRegulations();
      renderRules();
    });

    el.confirmDeleteBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (pendingDeleteId) {
        const { error } = await deleteRule(pendingDeleteId);
        if (error) console.warn('[Regulation] delete error:', error.message);
      }
      pendingDeleteId = null;
      el.confirmDeleteModal?.close?.();
      rules = await fetchRegulations();
      renderRules();
    });
    el.cancelDeleteBtn?.addEventListener('click', () => {
      pendingDeleteId = null;
      el.confirmDeleteModal?.close?.();
    });

    el.ruleSearch?.addEventListener('input', applySearch);

    // Toggle enforce (localStorage ; si tu préfères en DB, on l’ajoutera ensuite)
    const initialEnforce = loadEnforceLocal();
    el.enforceToggle.checked = !!initialEnforce;
    el.enforceToggle?.addEventListener('change', () => {
      saveEnforceLocal(!!el.enforceToggle.checked);
    });

    // Validation complète
    el.validateAllBtn?.addEventListener('click', async () => {
      const activeRules = rules.filter(r => r.active);
      const [shifts, pto] = await Promise.all([fetchShifts(), fetchPTO()]);
      violations = runValidation(activeRules, shifts, pto);
      renderViolations();
      el.lastValidationAt.textContent = fmtDate(new Date());
    });

    el.exportViolationsBtn?.addEventListener('click', exportViolationsCSV);
  };

  const init = async () => {
    if (!el.tabPanel) return; // onglet absent
    try {
      rules = await fetchRegulations();
    } catch (e) {
      console.warn('[Regulation] fetchRegulations failed:', e?.message || e);
      rules = [];
    }
    renderRules();
    // Ne lance pas la validation auto pour éviter la charge ; l’utilisateur clique quand il veut
  };

  // Initialise quand le DOM est prêt (et que ton app est chargée)
  document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    init();
  });
})();


/* ---------------- Boot ---------------- */
window.addEventListener("load", requireAuth);
