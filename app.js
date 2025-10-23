// app.js — Planning Manager V2
// Auth Supabase + Attendance (v3.2) + Agents (directory, skills, status, PTO, export)

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------- Tabs ---------------- */
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.getAttribute("data-tab");
    tabPanels.forEach((p) => p.classList.toggle("visible", p.id === target));
  });
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

/* ---------------- Boot ---------------- */
window.addEventListener("load", requireAuth);

