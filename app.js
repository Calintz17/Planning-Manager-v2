/* ============================================================
   APP.JS — ROMAN Planning Manager (no-auth edition)
   - Tabs handler unique
   - Modules: Attendance, Agents/PTO, Weekly Planner, Forecast, Regulation, Tasks (CRUD DB)
   - DB contract (SQL no-auth que je livrerai ensuite) :
     tables: regions, agents, agent_skills, agent_pto,
             tasks, task_mix,
             forecast_totals, forecast_monthly, forecast_weekly, forecast_daily, forecast_hourly,
             regulation_rules,
             regulations (validation engine), shifts, pto (engine),
             forecast_values (optionnel pour sync des grilles Forecast)
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

  const showTab = (id) => {
    panels.forEach(p => p.toggleAttribute('hidden', p.id !== id));
    btns.forEach(b => {
      const on = (b.dataset.tab === id);
      b.classList.toggle('active', on);
      if (b.hasAttribute('aria-selected')) b.setAttribute('aria-selected', String(on));
    });
    try {
      if (id === 'attendance') initAttendanceUI?.();
      if (id === 'agents') initAgentsUI?.();
      if (id === 'weekly') initWeeklyUI?.();
      if (id === 'forecast-section') ForecastStore?.init?.();
    } catch (e) { console.error('Tab init error:', e); }
  };

  btns.forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  const initial = btns.find(b => b.classList.contains('active'))?.dataset.tab || panels[0]?.id;
  if (initial) showTab(initial);

  try { ForecastStore?.init?.(); } catch(e){}
});

/* ======================================================================
   HELPERS
   ====================================================================== */
const getDefaultRegion = () => localStorage.getItem("pmv2_default_region") || "EMEA";
const setDefaultRegion = (r) => localStorage.setItem("pmv2_default_region", r);

function firstDayOfCurrentMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}
function isoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

/* ======================================================================
   ATTENDANCE — couverture mensuelle & export
   ====================================================================== */
const attRegionSel   = document.getElementById("att-region");
const attStartInput  = document.getElementById("att-start");
const attCalcBtn     = document.getElementById("att-calc");
const adherenceLabel = document.getElementById("adherence-label");
const adherenceFill  = document.getElementById("adherence-fill");
const attTable       = document.getElementById("att-table");
const attWarnings    = document.getElementById("att-warnings");

async function fetchAgentsWithPTO(region) {
  const [{ data: agents, error: e1 }, { data: pto, error: e2 }] = await Promise.all([
    supabase.from("agents").select("id, full_name, region, status").eq("region", region).order("full_name",{ascending:true}),
    supabase.from("agent_pto").select("agent_id, start_date, end_date, half_day_start, half_day_end"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const byId = {};
  (agents || []).forEach(a => byId[a.id] = { ...a, pto: [] });
  (pto || []).forEach(p => { if (byId[p.agent_id]) byId[p.agent_id].pto.push(p); });
  return Object.values(byId);
}
async function fetchRegulations(region) {
  const { data, error } = await supabase
    .from("regulation_rules")
    .select("rule_key, value_text, enabled")
    .eq("region", region)
    .eq("enabled", true);
  if (error) throw error;
  const map = {};
  (data||[]).forEach(r => map[r.rule_key] = r.value_text);

  const yesNo = (v) => (String(v||'').trim() === '1' || String(v||'').toLowerCase() === 'yes');

  return {
    maxHoursPerDay:     parseFloat(map["Max Hours per Day"] ?? "8"),
    maxHoursPerWeek:    parseFloat(map["Max Hours per Week"] ?? "37.5"),
    lunchMin:           (parseFloat(map["Lunch Duration (minutes)"] ?? "60") || 60),
    breaksPerDay:       parseInt(map["Breaks per Day (count)"] ?? "2", 10),
    breakMin:           parseInt(map["Break Duration (minutes)"] ?? "15", 10),
    minRestHours:       parseFloat(map["Min Rest Between Shifts (hours)"] ?? "11"),
    saturdayWork:       yesNo(map["Saturday Work"]),
    sundayWork:         yesNo(map["Sunday Work"]),
    openHH:             map["Client facing opening hour is"] || "10:00",
    closeHH:            map["Client facing closing hour is"] || "18:00",
    minArrival:         map["Minimum arrival date for advisor"] || "09:00",
    maxDeparture:       map["Maximum arrival date for advisor is"] || "21:00",
    trainingOnlyClosed: yesNo(map["Training can only be done when the client service is closed"]),
    canWorkOutsideOpen: yesNo(map["Advisor can work in the window outside of the client facing hours"]),
  };
}
async function fetchTaskMix(region){
  // % par canal (somme ~ 100)
  const { data, error } = await supabase
    .from('task_mix')
    .select('call_pct, mail_pct, chat_pct, clienteling_pct, fraud_pct, backoffice_pct')
    .eq('region', region).single();
  if (error && error.code !== 'PGRST116') { console.warn(error); }
  return {
    Call: (data?.call_pct ?? 30) / 100,
    Mail: (data?.mail_pct ?? 28) / 100,
    Chat: (data?.chat_pct ?? 0) / 100,
    Clienteling: (data?.clienteling_pct ?? 4) / 100,
    Fraud: (data?.fraud_pct ?? 2) / 100,
    "Back Office": (data?.backoffice_pct ?? 36) / 100,
  };
}
async function fetchForecastPieces(region, y, m, d) {
  const weekday0 = new Date(y, m - 1, d).getDay(); // 0..6
  const weekday = ((weekday0 + 6) % 7) + 1; // 1..7 (Mon..Sun)
  const week = isoWeekNumber(new Date(y, m - 1, d));

  const [ft, fm, fw, fd, tasks, mix] = await Promise.all([
    supabase.from("forecast_totals").select("total_volume").eq("region", region).single(),
    supabase.from("forecast_monthly").select("month_index, share_percent").eq("region", region).eq("month_index", m).maybeSingle(),
    supabase.from("forecast_weekly").select("week_index, share_percent").eq("region", region).eq("week_index", week).maybeSingle(),
    supabase.from("forecast_daily").select("weekday, share_percent").eq("region", region).eq("weekday", weekday).maybeSingle(),
    supabase.from("tasks").select("name, avg_handle_time_min, enabled").eq("region", region).eq("enabled", true),
    fetchTaskMix(region),
  ]);

  if (ft.error) throw ft.error;
  const total = ft.data?.total_volume ?? 0;
  const monthlyShare = (fm.data?.share_percent ?? 100/12) / 100;
  const weeklyShare  = (fw.data?.share_percent ?? (100/52)) / 100;
  const dailyShare   = (fd.data?.share_percent ?? (100/7)) / 100;

  return {
    totalVolume: total,
    monthlyShare,
    weeklyShare,
    dailyShare,
    taskMix: mix,                       // % par canal, constant par région
    tasks: tasks.data || [],            // AHT par tâche
  };
}
function agentIsOffThatDate(agent, dateISO) {
  for (const p of agent.pto || []) if (dateISO >= p.start_date && dateISO <= p.end_date) return true;
  return false;
}
function computeNetCapacityPerAgentMin(reg) {
  const workMin = reg.maxHoursPerDay * 60;
  const breaks  = reg.breaksPerDay * reg.breakMin;
  return Math.max(0, workMin - reg.lunchMin - breaks);
}
function sumDemandMinutes(totalVolumeDay, taskMix, tasks) {
  const AHT = {}; tasks.forEach(t => AHT[t.name] = t.avg_handle_time_min);
  const keys = ["Call","Mail","Chat","Clienteling","Fraud","Back Office"];
  let minutes = 0;
  for (const k of keys) {
    const pct = taskMix[k] ?? 0;
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
    const demandMin = sumDemandMinutes(totalDay, f.taskMix, f.tasks);
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
      let cls = off ? "cell-pto" : "cell-present";
      tbody += `<td class="${cls}"></td>`;
    }
    tbody += `</tr>`;
  }
  tbody += `</tbody>`;
  attTable.innerHTML = thead + tbody;

  const warnDays = results.filter(r => r.required > r.available);
  attWarnings.innerHTML = warnDays.length
    ? warnDays.map(w => `<span class="warn-flag">/!\\ D${w.day}</span>`).join(" ")
    : "All days fully staffed";

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
  attRegionSel.value = getDefaultRegion();
  attStartInput.value = firstDayOfCurrentMonthISO();
  await runAttendance();
  attRegionSel.addEventListener("change", async () => {
    setDefaultRegion(attRegionSel.value);
    await runAttendance();
  });
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

/* ======================================================================
   AGENTS (Directory + PTO Drawer)
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

async function initAgentsUI() {
  if (!agRegionSel) return;
  agRegionSel.value = getDefaultRegion();
  await renderAgentsTable();
  agRegionSel.addEventListener("change", async ()=> {
    setDefaultRegion(agRegionSel.value);
    await renderAgentsTable();
  });
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
    .order("full_name",{ascending:true});
  if (error) throw error;

  const { data: skills, error: e2 } = await supabase.from("agent_skills").select("*");
  if (e2) throw e2;

  const byId = {};
  (data||[]).forEach(a => byId[a.id] = {
    ...a,
    skills: { can_call:true, can_mail:true, can_chat:true, can_clienteling:true, can_fraud:true, can_backoffice:true }
  });
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
  if (!agTableBody) return;
  agTableBody.innerHTML = `<tr><td colspan="12">Loading…</td></tr>`;
  const region = agRegionSel.value;
  const rows = await fetchAgents(region);

  if (!rows.length) {
    agTableBody.innerHTML = `<tr><td colspan="12">No agents yet.</td></tr>`;
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
  agTableBody.innerHTML = html;

  // Bind events
  agTableBody.querySelectorAll("tr").forEach(tr => {
    const id = tr.getAttribute("data-id");

    // name edit
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
        const { error } = await supabase.from("agent_skills").upsert({ agent_id: id, ...payload }, { onConflict: "agent_id" });
        if (error) console.error(error);
      });
    });

    // PTO drawer open
    tr.querySelector(".mini.primary").addEventListener("click", () => openPtoDrawer(id, tr.querySelector(".ag-name").textContent.trim()));
    // PTO mini calendar
    tr.querySelector(".mini.secondary").addEventListener("click", async () => {
      await openPtoDrawer(id, tr.querySelector(".ag-name").textContent.trim());
    });
    // delete agent
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
  const { data, error } = await supabase.from("agents").insert({ full_name: name, region }).select("id").single();
  if (error) { alert(error.message); return; }
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

/* PTO Drawer */
async function openPtoDrawer(agentId, agentName) {
  PTO_DRAWER.agentId = agentId;
  PTO_DRAWER.agentName = agentName;
  PTO_DRAWER.title.textContent = `PTO for ${agentName}`;
  PTO_DRAWER.start.value = ""; PTO_DRAWER.end.value = "";
  PTO_DRAWER.halfStart.value = ""; PTO_DRAWER.halfEnd.value = "";

  await refreshPtoList();
  await renderPtoMiniCalendar();

  PTO_DRAWER.el.classList.add("open");
  PTO_DRAWER.el.setAttribute("aria-hidden", "false");
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
    const label = `${p.start_date} ${p.half_day_start||'Full'} → ${p.end_date} ${p.half_day_end||'Full'}`;
    return `<li data-id="${p.id}">${label} <button class="mini danger" data-del="${p.id}">Delete</button></li>`;
  }).join("") || `<li class="muted">No PTO yet.</li>`;

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
  const half_day_end   = PTO_DRAWER.halfEnd.value || null;
  if (!start_date) { alert("Select a start date"); return; }
  const { error } = await supabase.from("agent_pto").insert({
    agent_id: PTO_DRAWER.agentId, start_date, end_date, half_day_start, half_day_end
  });
  if (error) { alert(error.message); return; }
  await refreshPtoList();
  await renderPtoMiniCalendar();
}
async function renderPtoMiniCalendar() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(); // 0..11
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
        return (p.half_day_start || p.half_day_end) ? "half" : "full";
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

/* ======================================================================
   TASKS (CRUD DB — pas de localStorage)
   ====================================================================== */
window.Tasks = (() => {
  const $ = (s, r=document) => r.querySelector(s);

  const els = {
    tbody:   () => $("#tasksTbody"),
    region:  () => $("#task-region"),
    search:  () => $("#task-search"),
    fPrio:   () => $("#task-filter-priority"),
    createBtn:() => $("#createTaskBtn"),
    counters:() => $("#task-counters"),
  };

  let region = getDefaultRegion();
  let rows = [];

  const escapeHtml = (s='') => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };

  const load = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, region, name, priority, avg_handle_time_min, enabled")
      .eq("region", region)
      .order("name",{ascending:true});
    if (error) throw error;
    rows = data || [];
  };

  const render = () => {
    const tb = els.tbody(); if (!tb) return;
    const q = (els.search()?.value || '').trim().toLowerCase();
    const fp = (els.fPrio()?.value || '');
    const list = rows.filter(r => {
      const hay = `${r.name} ${r.priority}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (fp) {
        const pmap = { 'high':'P1', 'med':'P2', 'low':'P3' };
        if (pmap[fp] !== r.priority) return false;
      }
      return true;
    });

    tb.innerHTML = list.map(r => `
      <tr data-id="${r.id}">
        <td><input type="text" value="${escapeHtml(r.name)}" data-field="name" /></td>
        <td>
          <select data-field="priority">
            <option value="P1" ${r.priority==='P1'?'selected':''}>High (P1)</option>
            <option value="P2" ${r.priority==='P2'?'selected':''}>Medium (P2)</option>
            <option value="P3" ${r.priority==='P3'?'selected':''}>Low (P3)</option>
            <option value="Mandatory" ${r.priority==='Mandatory'?'selected':''}>Mandatory</option>
          </select>
        </td>
        <td><input type="number" min="0" step="1" value="${Number(r.avg_handle_time_min)||0}" data-field="avg_handle_time_min" /></td>
        <td>
          <label class="switch">
            <input type="checkbox" ${r.enabled?'checked':''} data-field="enabled" />
            <span class="slider"></span>
          </label>
        </td>
        <td class="row-actions">
          <button type="button" class="mini danger" data-action="delete">Delete</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="5" class="muted">No tasks.</td></tr>`;

    // bind
    tb.querySelectorAll('tr').forEach(tr => {
      const id = tr.getAttribute('data-id');
      tr.querySelectorAll('input[data-field], select[data-field]').forEach(inp => {
        const handler = debounce(async ()=>{
          const field = inp.dataset.field;
          let value = inp.type === 'checkbox' ? inp.checked : inp.value;
          if (field === 'avg_handle_time_min') value = Number(value)||0;
          const payload = {}; payload[field] = value;
          await supabase.from('tasks').update(payload).eq('id', id);
        }, 250);
        inp.addEventListener('input', handler);
        inp.addEventListener('change', handler);
      });
      tr.querySelector('[data-action="delete"]').addEventListener('click', async ()=>{
        if (!confirm('Delete task ?')) return;
        await supabase.from('tasks').delete().eq('id', id);
        await refresh();
      });
    });

    const cnt = els.counters();
    if (cnt) {
      const enabled = rows.filter(r => r.enabled).length;
      cnt.innerHTML = [
        `<span class="counter">Region: <b>${region}</b></span>`,
        `<span class="counter">Tasks: <b>${rows.length}</b></span>`,
        `<span class="counter">Enabled: <b>${enabled}</b></span>`
      ].join(' ');
    }
  };

  const refresh = async () => { await load(); render(); };

  const init = async () => {
    const rSel = els.region();
    region = getDefaultRegion();
    if (rSel) {
      rSel.value = region;
      rSel.addEventListener('change', async ()=>{
        region = rSel.value; setDefaultRegion(region);
        await refresh();
      });
    }
    els.search()?.addEventListener('input', render);
    els.fPrio()?.addEventListener('change', render);
    els.createBtn()?.addEventListener('click', async ()=>{
      const name = prompt('New task name (ex: QA Review) ?');
      if (!name) return;
      const safe = name.trim();
      const payload = { region, name: safe, priority:'P3', avg_handle_time_min:5, enabled:true, color_hex:'#999999' };
      await supabase.from('tasks').insert(payload);
      await refresh();
    });
    await refresh();
  };

  return { init, getConfig: async (reg)=> {
    const { data } = await supabase.from('tasks').select('name, avg_handle_time_min, enabled').eq('region', reg);
    return data||[];
  }};
})();

/* ======================================================================
   FORECAST STORE (localStorage + sync optionnel forecast_values)
   ====================================================================== */
window.ForecastStore = (() => {
  const PREFIX = 'roman_forecast_v3:';
  const REGION_DEFAULT = 'EMEA';
  const $ = (s, r=document) => r.querySelector(s);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const HOURS24 = Array.from({length:24}, (_,h)=>String(h));

  let region = REGION_DEFAULT;
  let state = null;

  const key = (reg) => `${PREFIX}${reg || REGION_DEFAULT}`;
  const blankState = () => ({
    total: '',
    monthly: Object.fromEntries(MONTHS.map(m => [m, ''])),
    weekly:  Object.fromEntries(Array.from({length:53}, (_,i)=>[String(i+1), ''])),
    daily:   Object.fromEntries(DAYS.map(d => [d, { day:'', Call:'', Mail:'', Chat:'', Clienteling:'', Fraud:'', BackOffice:'' }])),
    hourly:  Object.fromEntries(HOURS24.map(h=>[h, '']))
  });
  const mergeBlank = (obj) => {
    const base = blankState();
    return {
      total: obj?.total ?? base.total,
      monthly: { ...base.monthly, ...(obj?.monthly||{}) },
      weekly:  { ...base.weekly,  ...(obj?.weekly||{}) },
      daily:   { ...base.daily,   ...(obj?.daily||{}) },
      hourly:  { ...base.hourly,  ...(obj?.hourly||{}) }
    };
  };
  const load = (reg) => {
    const raw = localStorage.getItem(key(reg));
    if (!raw) return blankState();
    try { return mergeBlank(JSON.parse(raw)); } catch { return blankState(); }
  };
  const save = () => localStorage.setItem(key(region), JSON.stringify(state));

  const escapeHtml = (s='') => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const escapeAttr = escapeHtml;
  const tableHtml = (head, rows) => {
    const thead = `<thead><tr>${head.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
    return `<table class="table">${thead}${tbody}</table>`;
  };
  const inputHtml = (name, value) => {
    const val = (value ?? '') === '' ? '' : String(value);
    return `<input type="number" step="0.01" name="${escapeAttr(name)}" value="${escapeAttr(val)}" />`;
  };
  const wireInputs = (root) => {
    root.querySelectorAll('input[name]').forEach(inp => {
      inp.addEventListener('input', onInputChange);
      inp.addEventListener('change', onInputChange);
    });
  };
  const sumPercent = (arr) => {
    const n = arr.reduce((acc,v)=> acc + (parseFloat(v)||0), 0);
    return (Math.round(n * 100) / 100).toFixed(2);
  };
  const debounce = (fn, ms) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };

  const maybeSync = debounce(async (field, value) => {
    const C = window.CONFIG || {};
    if (!C.SYNC_FORECAST || !C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) return;
    try {
      const url = `${C.SUPABASE_URL}/rest/v1/forecast_values`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': C.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${C.SUPABASE_ANON_KEY}`,
          'Content-Type':'application/json',
          'Prefer':'resolution=merge-duplicates'
        },
        body: JSON.stringify([{ region, field, value, updated_at: new Date().toISOString() }])
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) { console.warn('Supabase sync failed (soft):', e);
    }
  }, 250);

  const renderTotal = () => {
    const inp = $('#fc-total'); if (!inp) return;
    inp.value = state.total ?? '';
    inp.oninput = () => { state.total = inp.value; save(); maybeSync('total', inp.value); };
  };
  const renderMonthly = () => {
    const host = document.getElementById('fc-monthly'); if (!host) return;
    host.innerHTML = tableHtml(
      ['Month', ...MONTHS],
      [['Share %', ...MONTHS.map(m => inputHtml(`monthly.${m}`, state.monthly[m]))]]
    );
    wireInputs(host);
    const sumSpan = document.getElementById('fc-monthly-sum'); if (sumSpan) sumSpan.textContent = `Sum: ${sumPercent(Object.values(state.monthly))}%`;
  };
  const renderWeekly = () => {
    const host = document.getElementById('fc-weekly'); if (!host) return;
    const head = ['Week', ...Array.from({length:53}, (_,i)=>String(i+1))];
    const row  = ['Share %', ...Array.from({length:53}, (_,i)=>inputHtml(`weekly.${i+1}`, state.weekly[String(i+1)]))];
    host.innerHTML = tableHtml(head, [row]);
    wireInputs(host);
    const sumSpan = document.getElementById('fc-weekly-sum'); if (sumSpan) sumSpan.textContent = `Sum (guide): ${sumPercent(Object.values(state.weekly))}%`;
  };
  const renderDaily = () => {
    const host = document.getElementById('fc-daily'); if (!host) return;
    const t1Head = ['Day','%'];
    const t1Rows = DAYS.map(d => [ d, inputHtml(`daily.${d}.day`, state.daily[d]?.day) ]);
    host.innerHTML = `
      <div class="forecast-table" style="margin-bottom:8px">${tableHtml(t1Head, t1Rows)}</div>
    `;
    wireInputs(host);
    const sumSpan = document.getElementById('fc-daily-check'); 
    if (sumSpan) {
      const daySum = sumPercent(DAYS.map(d => state.daily[d]?.day));
      sumSpan.textContent = `Day% sum: ${daySum}%`;
    }
  };
  const renderHourly = () => {
    const host = document.getElementById('fc-hourly'); if (!host) return;
    const head = ['Hour', ...HOURS24];
    const row  = ['Share %', ...HOURS24.map(h => inputHtml(`hourly.${h}`, state.hourly[h]))];
    host.innerHTML = tableHtml(head, [row]);
    wireInputs(host);
    const sumSpan = document.getElementById('fc-hourly-sum'); if (sumSpan) sumSpan.textContent = `Sum: ${sumPercent(Object.values(state.hourly))}%`;
  };
  const onInputChange = (e) => {
    const inp = e.target;
    const path = inp.name.split('.');
    if (!path.length) return;
    let ref = state;
    for (let i=0;i<path.length-1;i++){ const k = path[i]; if (ref[k] == null) ref[k] = {}; ref = ref[k]; }
    ref[path[path.length-1]] = inp.value;
    save(); maybeSync(inp.name, inp.value);
    if (path[0]==='monthly') { const s = document.getElementById('fc-monthly-sum'); if (s) s.textContent = `Sum: ${sumPercent(Object.values(state.monthly))}%`; }
    if (path[0]==='weekly')  { const s = document.getElementById('fc-weekly-sum');  if (s) s.textContent = `Sum (guide): ${sumPercent(Object.values(state.weekly))}%`; }
    if (path[0]==='daily')   { const s = document.getElementById('fc-daily-check'); if (s) { const daySum = sumPercent(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => state.daily[d]?.day)); s.textContent = `Day% sum: ${daySum}%`; } }
    if (path[0]==='hourly')  { const s = document.getElementById('fc-hourly-sum');  if (s) s.textContent = `Sum: ${sumPercent(Object.values(state.hourly))}%`; }
  };

  const renderAll = () => { renderTotal(); renderMonthly(); renderWeekly(); renderDaily(); renderHourly(); };

  let _inited = false;
  const init = () => {
    const panel = document.getElementById('forecast-section');
    if (!panel) return;
    if (_inited) { _refreshRegion(); return; }
    _inited = true;

    const rSel = document.getElementById('fc-region');
    const prev = localStorage.getItem(`${PREFIX}last_region`) || getDefaultRegion();
    if (rSel) {
      rSel.value = prev;
      rSel.addEventListener('change', () => {
        localStorage.setItem(`${PREFIX}last_region`, rSel.value);
        region = rSel.value; state = load(region); renderAll();
      });
    }
    region = rSel?.value || prev;
    state = load(region);
    renderAll();
  };
  const _refreshRegion = () => {
    const rSel = document.getElementById('fc-region');
    const current = rSel?.value || getDefaultRegion();
    if (current !== region) { region = current; state = load(region); renderAll(); }
  };

  return { init };
})();

/* ======================================================================
   WEEKLY (timeline 30 min, demande vs capacité)
   ====================================================================== */
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
  const parseWeekInput = (val) => {
    const [y, w] = val.split('-W').map(x=>parseInt(x,10));
    return isoWeekToDate(y, w);
  };
  function isoWeekToDate(year, week) {
    const simple = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = simple.getUTCDay() || 7;
    const thursday = new Date(simple);
    thursday.setUTCDate(simple.getUTCDate() + (4 - dayOfWeek));
    const monday = new Date(thursday);
    monday.setUTCDate(thursday.getUTCDate() - 3 + (week - 1) * 7);
    return monday;
  }
  function addDays(date, n){ const d = new Date(date); d.setUTCDate(d.getUTCDate()+n); return d; }
  function ymd(date){ return date.toISOString().slice(0,10); }
  function minutesBetween(hhmmStart, hhmmEnd){
    const [sh, sm] = hhmmStart.split(':').map(Number);
    const [eh, em] = hhmmEnd.split(':').map(Number);
    return (eh*60+em) - (sh*60+sm);
  }
  function hhmmAdd(hhmm, deltaMin){
    let [h,m] = hhmm.split(':').map(Number);
    let total = h*60+m + deltaMin; if (total<0) total=0;
    const nh = Math.floor(total/60), nm = total%60;
    return `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`;
  }

  async function fetchHourlyShares(region){
    // Prend forecast_hourly (% 24h, au pas de 30min si tu seeds avec 08:00, 08:30, ..., 19:30)
    const { data, error } = await supabase
      .from('forecast_hourly')
      .select('hhmm, share_percent')
      .eq('region', region)
      .order('hhmm');
    if (error) throw error;
    const map = new Map();
    (data||[]).forEach(r => map.set(r.hhmm, parseFloat(r.share_percent)||0));
    // fallback : plat 100 réparti uniformément sur la fenêtre si rien
    if (!map.size){
      for (let h=10; h<=18; h++){
        map.set(`${String(h).padStart(2,'0')}:00`, +(100/18).toFixed(2));
        map.set(`${String(h).padStart(2,'0')}:30`, +(100/18).toFixed(2));
      }
    }
    return map;
  }
  async function computeDemandPerSlot(region, mondayUTC, dayStart, dayEnd, slots){
    const demand = {};
    const hourly = await fetchHourlyShares(region);
    for (let i=0; i<7; i++){
      const d = addDays(mondayUTC, i);
      const dateISO = ymd(d);
      const y = d.getUTCFullYear(), m = d.getUTCMonth()+1, day = d.getUTCDate();
      const f = await fetchForecastPieces(region, y, m, day);
      const totalDay = f.totalVolume * f.monthlyShare * f.weeklyShare * f.dailyShare;

      // fraction horaire visible (normalisation à la fenêtre)
      const dayKeys = Array.from(hourly.keys()).filter(h=> h>=dayStart && h<dayEnd);
      const sumVisible = dayKeys.reduce((s,k)=> s+(hourly.get(k)||0), 0) || 1;

      for (const hhmm of slots){
        if (!dayKeys.includes(hhmm)) continue;
        const pct = (hourly.get(hhmm)||0) / sumVisible;
        // Répartition de la demande (min) via mix + AHT
        const demandMinutesDay = sumDemandMinutes(totalDay, f.taskMix, f.tasks);
        demand[`${dateISO}|${hhmm}`] = demandMinutesDay * pct;
      }
    }
    return demand;
  }
  async function computeCapacityPerSlot(region, mondayUTC, dayStart, dayEnd, slots){
    const regs = await fetchRegulations(region);
    const netCapPerAgentMin = computeNetCapacityPerAgentMin(regs);
    const workWindowMin = Math.max(30, minutesBetween(dayStart, dayEnd));
    const perAgentPerMinute = netCapPerAgentMin / workWindowMin;

    const agents = await fetchAgentsWithPTO(region);
    const cap = {};
    const presentAgentsByDate = {};
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
    return { cap, presentAgentsByDate };
  }
  function buildWeekSlots(mondayUTC, dayStart, dayEnd){
    const days = Array.from({length:7}, (_,i)=> addDays(mondayUTC, i));
    const slots = [];
    let cursor = dayStart;
    while (cursor < dayEnd){ slots.push(cursor); cursor = hhmmAdd(cursor, 30); }
    return { days, slots };
  }
  function renderGrid(days, slots, demand, cap, agents){
    const $grid = els.grid(); if (!$grid) return;
    let thead = `<thead><tr><th class="first-col">Row</th>`;
    slots.forEach((s)=> thead += `<th class="slot-col ${s.endsWith(':00') ? 'hour-marker' : ''}">${s}</th>`);
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
    agents.forEach(a=>{
      let row = `<tr><td class="first-col">${a.full_name}</td>`;
      for (let i=0; i<7; i++){
        const dateISO = ymd(days[i]);
        const off = agentIsOffThatDate(a, dateISO);
        const cls = off ? 'pto' : 'present';
        slots.forEach(()=>{ row += `<td><div class="cell ${cls}"></div></td>`; });
      }
      row += `</tr>`;
      tbody += row;
    });

    $grid.innerHTML = thead + `<tbody>${tbody}</tbody>`;
  }
  function renderSummaries(days, slots, demand, cap, presentAgentsByDate){
    const agentsAvg = Math.round(
      Object.values(presentAgentsByDate).reduce((a,b)=>a+b,0) / Math.max(1,Object.values(presentAgentsByDate).length)
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
    els.agentsCount().textContent = `${agentsAvg}`;
    els.coverageAvg().textContent = `${coverage}%`;
    els.understaffed().textContent = `${gaps}`;
  }
  function exportCSV(region, days, slots, demand, cap){
    let csv = `Region,${region}\n`;
    csv += `Slot,Date,Time,Demand_Min,Capacity_Min\n`;
    let idx=1;
    for (let i=0; i<7; i++){
      const dateISO = ymd(days[i]);
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
  async function load(){
    const region = els.region().value;
    const weekVal = els.week().value;
    const dayStart = els.dayStart().value || '09:00';
    const dayEnd   = els.dayEnd().value || '18:00';
    if (!weekVal){ alert('Select an ISO week'); return; }
    const monday = parseWeekInput(weekVal);
    const { days, slots } = buildWeekSlots(monday, dayStart, dayEnd);
    const demand = await computeDemandPerSlot(region, monday, dayStart, dayEnd, slots);
    const { cap, presentAgentsByDate } = await computeCapacityPerSlot(region, monday, dayStart, dayEnd, slots);
    const agents = await fetchAgentsWithPTO(region);
    renderGrid(days, slots, demand, cap, agents);
    renderSummaries(days, slots, demand, cap, presentAgentsByDate);
    els.exportBtn().onclick = ()=> exportCSV(region, days, slots, demand, cap);
  }
  async function init(){
    els.region().value = getDefaultRegion();
    const now = new Date();
    const week = isoWeekNumber(now);
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

/* ======================================================================
   REGULATION (CRUD + Validation Engine)
   ====================================================================== */
(() => {
  const qs  = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const el = {
    tabPanel: qs('#regulation'),
    enforceToggle: qs('#enforceRegulationsToggle'),
    addRuleBtn: qs('#addRuleBtn'),
    validateAllBtn: qs('#validateAllBtn'),
    exportViolationsBtn: qs('#exportViolationsBtn'),
    ruleSearch: qs('#ruleSearch'),
    activeRulesCount: qs('#activeRulesCount'),
    violationsCount: qs('#violationsCount'),
    lastValidationAt: qs('#lastValidationAt'),
    rulesTbody: qs('#regulationTableBody'),
    violationsPanel: qs('#violationsPanel'),
    violationsTbody: qs('#violationsTableBody'),
    ruleModal: qs('#ruleModal'),
    ruleForm: qs('#ruleForm'),
    ruleModalTitle: qs('#ruleModalTitle'),
    closeRuleModal: qs('#closeRuleModal'),
    cancelRuleBtn: qs('#cancelRuleBtn'),
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
    confirmDeleteModal: qs('#confirmDeleteModal'),
    confirmDeleteBtn: qs('#confirmDeleteBtn'),
    cancelDeleteBtn: qs('#cancelDeleteBtn'),
  };

  let rules = [];
  let filteredRules = [];
  let violations = [];
  let pendingDeleteId = null;

  const toBool = (v) => (v === true || v === 'true' || v === 1 || v === '1');
  const fmtDate = (d) => { try { const x = (d instanceof Date) ? d : new Date(d); return x.toLocaleString(); } catch { return '–'; } };

  const fetchRegulations = async () => {
    if (!window.supabase) return [];
    const { data, error } = await supabase.from('regulations').select('*').order('created_at', { ascending: true });
    if (error) { console.warn('[Regulation] fetchRegulations error:', error.message); return []; }
    return data || [];
  };
  const upsertRule = async (payload) => {
    const { data, error } = await supabase.from('regulations').upsert(payload).select().single();
    return { data, error };
  };
  const deleteRule = async (id) => {
    const { error } = await supabase.from('regulations').delete().eq('id', id);
    return { error };
  };
  const fetchShifts = async () => {
    const { data, error } = await supabase.from('shifts').select('id,agent_id,start_time,end_time');
    if (error) { console.warn('[Regulation] fetchShifts error:', error.message); return []; }
    return data || [];
  };
  const fetchPTO = async () => {
    const { data, error } = await supabase.from('pto').select('agent_id,start_date,end_date');
    if (error) return [];
    return data || [];
  };

  const hoursBetween = (a, b) => Math.abs((new Date(b) - new Date(a)) / 36e5);
  const getISOWeek = (date) => {
    const d = new Date(date);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  };
  const applyScope = (rule, item) => {
    if (rule.scope === 'AGENT'  && rule.scope_target) return String(item.agent_id) === String(rule.scope_target);
    if (rule.scope === 'REGION' && rule.scope_target) return true; // si besoin, enrichir item.agent_region
    return true;
  };
  const runValidation = (rulesActive, shifts, ptoList=[]) => {
    const out = [];
    const byAgent = {};
    shifts.forEach(s => { if (!byAgent[s.agent_id]) byAgent[s.agent_id] = []; byAgent[s.agent_id].push(s); });
    Object.values(byAgent).forEach(list => list.sort((a,b) => new Date(a.start_time) - new Date(b.start_time)));

    const ptoMap = {};
    ptoList.forEach(p => { if (!ptoMap[p.agent_id]) ptoMap[p.agent_id] = []; ptoMap[p.agent_id].push([new Date(p.start_date), new Date(p.end_date)]); });

    const active = rulesActive.filter(r => r.active);

    // MAX_HOURS_PER_WEEK
    const maxWeekRules = active.filter(r => r.type === 'MAX_HOURS_PER_WEEK' && r.param1);
    if (maxWeekRules.length) {
      const weekHours = {};
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
            out.push({ rule: rule.name || 'Max heures / semaine', agent_id, shift: `Semaine ${week} ${year}`, detail: `Total ${total.toFixed(1)}h > ${Number(rule.param1)}h`, severity: rule.severity || 'WARN' });
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
              out.push({ rule: rule.name || 'Repos minimum', agent_id: agentId, shift: `${new Date(cur.start_time).toLocaleString()}`, detail: `Repos ${restH.toFixed(1)}h < ${Number(rule.param1)}h`, severity: rule.severity || 'WARN' });
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
              out.push({ rule: rule.name || 'Pas de chevauchement', agent_id: agentId, shift: `${new Date(cur.start_time).toLocaleString()}`, detail: `Chevauchement avec shift précédent`, severity: rule.severity || 'BLOCK' });
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
                out.push({ rule: rule.name || 'Interdiction PTO', agent_id: agentId, shift: `${st.toLocaleString()}`, detail: `Shift pendant PTO (${pst.toISOString().slice(0,10)}→${pet.toISOString().slice(0,10)})`, severity: rule.severity || 'BLOCK' });
              }
            }
          }
        }
      }
    }
    return out;
  };

  const renderRules = () => {
    const list = filteredRules.length ? filteredRules : rules;
    el.rulesTbody.innerHTML = list.map(r => {
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
              <button class="mini js-edit" title="Éditer">Edit</button>
              <button class="mini danger js-delete" title="Supprimer">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="6">Aucune règle pour le moment.</td></tr>`;
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
    el.violationsTbody.innerHTML = violations.map(v => `
      <tr>
        <td>${v.rule}</td>
        <td>${v.agent_id}</td>
        <td>${v.shift}</td>
        <td>${v.detail}</td>
        <td>${v.severity}</td>
      </tr>
    `).join('');
  };
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
  const updateParamLabels = () => {
    const t = el.ruleType.value;
    if (t === 'MAX_HOURS_PER_WEEK') {
      el.ruleParam1Label.textContent = 'Heures max / semaine';
      el.ruleParam2Label.textContent = 'Paramètre 2 (optionnel)';
      el.ruleParam1.type = 'number'; el.ruleParam2.type = 'number';
      el.ruleParam1.placeholder = 'Ex: 40'; el.ruleParam2.placeholder = '';
    } else if (t === 'MIN_REST_BETWEEN_SHIFTS') {
      el.ruleParam1Label.textContent = 'Repos minimum (heures)';
      el.ruleParam2Label.textContent = 'Paramètre 2 (optionnel)';
      el.ruleParam1.type = 'number'; el.ruleParam2.type = 'number';
      el.ruleParam1.placeholder = 'Ex: 11'; el.ruleParam2.placeholder = '';
    } else if (t === 'NO_OVERLAP_SHIFTS' || t === 'NO_PTO_OVERBOOKING') {
      el.ruleParam1Label.textContent = 'Paramètre 1 (non requis)';
      el.ruleParam2Label.textContent = 'Paramètre 2 (non requis)';
      el.ruleParam1.placeholder = ''; el.ruleParam2.placeholder = '';
    } else if (t === 'HOLIDAY_BLACKOUT') {
      el.ruleParam1Label.textContent = 'Jour férié (AAAA-MM-JJ) ou pattern';
      el.ruleParam2Label.textContent = 'Paramètre 2 (optionnel)';
      el.ruleParam1.type = 'text'; el.ruleParam2.type = 'text';
      el.ruleParam1.placeholder = 'Ex: 2025-12-25 ou WE'; el.ruleParam2.placeholder = '';
    }
  };
  const updateScopeVisibility = () => {
    const s = el.ruleScope.value;
    if (s === 'REGION') {
      el.scopeTargetLabel.textContent = 'Code Région (ex: EMEA)'; el.scopeTargetField.hidden = false;
    } else if (s === 'AGENT') {
      el.scopeTargetLabel.textContent = 'Agent ID'; el.scopeTargetField.hidden = false;
    } else {
      el.scopeTargetField.hidden = true; el.ruleScopeTarget.value = '';
    }
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
  const closeRuleModal = () => { el.ruleModal?.close?.(); };
  const applySearch = () => {
    const q = (el.ruleSearch.value || '').toLowerCase().trim();
    if (!q) { filteredRules = []; renderRules(); return; }
    filteredRules = rules.filter(r => {
      const hay = `${r.name||''} ${r.type||''} ${r.scope||''} ${r.scope_target||''}`.toLowerCase();
      return hay.includes(q);
    });
    renderRules();
  };
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
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url; link.download = `violations_${Date.now()}.csv`; link.click();
    URL.revokeObjectURL(url);
  };
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
      if (error) console.warn('[Regulation] save error:', error.message);
      closeRuleModal();
      rules = await fetchRegulations();
      renderRules();
    });
    el.confirmDeleteBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (pendingDeleteId) { await deleteRule(pendingDeleteId); }
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

    const initialEnforce = localStorage.getItem('pm_enforce_regulations') === 'true';
    el.enforceToggle.checked = !!initialEnforce;
    el.enforceToggle?.addEventListener('change', () => {
      localStorage.setItem('pm_enforce_regulations', el.enforceToggle.checked ? 'true' : 'false');
    });
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
    if (!el.tabPanel) return;
    try { rules = await fetchRegulations(); } catch (e) { rules = []; }
    renderRules();
  };
  document.addEventListener('DOMContentLoaded', () => { initEvents(); init(); });
})();

/* ======================================================================
   BOOT — initialise les panneaux visibles par défaut
   ====================================================================== */
window.addEventListener("load", async () => {
  try {
    await initAttendanceUI();
    await initAgentsUI();
    await Weekly.init();
    ForecastStore.init();
    window.Tasks?.init?.();
  } catch (e) {
    console.error(e);
  }
});

