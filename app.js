// app.js — Planning Manager V2
// Auth Supabase + Seed par défaut + Onglet Attendance (v3.2 complet)

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ----------------------- Tabs (navigation) ----------------------- */
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

/* ----------------------- Auth Modal ----------------------- */
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
  US: [
    "CARMICHAEL Keiani","AKOPIAN Ani","KEILITZ Madeline","YOUNG Nicole","TAVAREZ Valerie","SYRDAHL Victoria","BAMBA Nimatul"
  ],
  CN: [
    "XIAO Nadia","YANG Joyce","RONG Grace","CHENG Lily","LIAO Adam","WANG Nicole","YANG Yilia","HE Krystal"
  ],
  JP: [
    "SHIONOIRI Ayumi","ADACHI Kazue","YAMADA Kyohei","MISHINA Shinobu","KURIMOTO Kaori","MATSUURA Minato"
  ],
  KR: [
    "KIM Dooyeon","KIM Bella","RYOO Jiyeon","SONG Chaerin","YANG Inseok","LEE Lina"
  ],
  EMEA: [
    "PONS Silvia","BIDAU Julien","NGOUALLOU Elisabeth","BEAUVOIS Brice","CAFAGNA Olivia","SHEFFIELD Duncan",
    "VOGEL Leander","NGANZAMI EBALE Naomi","VAZZA Pierluigi","BENMOKTHTAR Safia","RIZZO Stéphane","GEISSLEIR Simone"
  ],
  SEAO: [
    "CHIA Michell","UNGSUNANTAWIWAT Noppawan","YODPANICH Pichaya","SOON Shanice"
  ],
};

async function seedAgentsIfEmpty() {
  const { data, error } = await supabase.from("agents").select("id").limit(1);
  if (error) { console.error(error); return; }
  if (data && data.length > 0) return; // déjà des agents

  for (const [code, names] of Object.entries(DEFAULT_AGENTS)) {
    for (const name of names) {
      const { error: e2 } = await supabase.rpc("add_agent_for_current_user", {
        p_full_name: name,
        p_region: code,
      });
      if (e2) console.warn("add_agent_for_current_user:", name, e2.message);
    }
  }
}

async function refreshSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function requireAuth() {
  const session = await refreshSession();
  if (!session) {
    authModal.classList.add("visible");
    authModal.setAttribute("aria-hidden", "false");
  } else {
    authModal.classList.remove("visible");
    authModal.setAttribute("aria-hidden", "true");
    initAttendanceUI(); // Initialise l’onglet Attendance une fois connecté
  }
}

loginBtn.addEventListener("click", async () => {
  authError.textContent = "";
  const email = emailEl.value.trim();
  const password = passEl.value;
  const region = regionEl.value;

  if (!email || !password) {
    authError.textContent = "Please enter email and password.";
    return;
  }

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

  if (!email || !password) {
    authError.textContent = "Please enter email and password.";
    return;
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) { authError.textContent = error.message; return; }

  const session = await refreshSession();
  if (!session) {
    authError.textContent = "Check your inbox to confirm your email, then log in.";
    return;
  }

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

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/index.html",
  });
  if (error) { authError.textContent = error.message; return; }
  alert("Password reset email sent.");
});

/* ----------------------- Attendance (v3.2) ----------------------- */
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
    supabase
      .from("agents")
      .select("id, full_name, region, status")
      .eq("region", region)
      .order("full_name", { ascending: true }),
    supabase
      .from("agent_pto")
      .select("agent_id, start_date, end_date, half_day_start, half_day_end"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const byId = {};
  (agents || []).forEach((a) => { byId[a.id] = { ...a, pto: [] }; });
  (pto || []).forEach((p) => { if (byId[p.agent_id]) byId[p.agent_id].pto.push(p); });
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
  const dOnly = dateISO; // ISO yyyy-mm-dd déjà
  for (const p of agent.pto || []) {
    if (dOnly >= p.start_date && dOnly <= p.end_date) {
      return true; // demi-journée: on marquera demi plus bas
    }
  }
  return false;
}

function computeNetCapacityPerAgentMin(reg) {
  const workMin = reg.maxHoursPerDay * 60;
  const breaks = reg.breaksPerDay * reg.breakMin;
  const net = Math.max(0, workMin - reg.lunchMin - breaks);
  return net; // minutes productives / agent / jour
}

function sumDemandMinutes(totalVolumeDay, dailyTaskPct, tasks) {
  const AHT = {};
  tasks.forEach((t) => { AHT[t.name] = t.avg_handle_time_min; });
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
  const month = start.getMonth() + 1; // 1..12
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

  // Head
  let thead = `<thead><tr><th class="first-col">Agent</th>`;
  for (const c of results) {
    const flag = c.required > c.available ? `<span class="warn-flag">/!\\</span>` : "";
    thead += `<th>
      <div class="day-head">${c.day}</div>
      ${flag}
      <div class="req-available">${c.available}/${c.required}</div>
    </th>`;
  }
  thead += `</tr></thead>`;

  // Body
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

  // Warnings
  const warnDays = results.filter(r => r.required > r.available);
  attWarnings.innerHTML = warnDays.length
    ? warnDays.map(w => `<span class="warn-flag">/!\\ D${w.day}</span>`).join(" ")
    : "All days fully staffed ✅";

  // Export CSV
  const exportBtn = document.getElementById("att-export");
  exportBtn.onclick = () => exportAttendanceToCSV(region, results, agents);
}

function renderAdherenceSummary(results) {
  if (!results.length) { adherenceLabel.textContent = "– %"; adherenceFill.style.width = "0%"; return; }
  const avg = Math.round(results.reduce((s, r) => s + r.adherence, 0) / results.length);
  adherenceLabel.textContent = `${avg}%`;
  adherenceFill.style.width = `${Math.min(100, Math.max(0, avg))}%`;
}

async function initAttendanceUI() {
  const def = await getDefaultRegionFromProfile();
  if (attRegionSel) attRegionSel.value = def;
  if (attStartInput) attStartInput.value = firstDayOfCurrentMonthISO();

  await runAttendance();
  attCalcBtn?.addEventListener("click", async () => { await runAttendance(); });
}

async function runAttendance() {
  const region = attRegionSel.value;
  const startISO = attStartInput.value;
  const calc = await calcAttendance(region, startISO);
  renderAttendanceGrid(region, calc);
  renderAdherenceSummary(calc.results);
}

/* ----------------------- Export CSV ----------------------- */
function exportAttendanceToCSV(region, results, agents) {
  let csv = `Region,${region}\n\n`;
  csv += "Agent";
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
  for (const c of results) {
    csv += `${c.day},${c.available},${c.required},${c.adherence}%\n`;
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance_${region}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ----------------------- Boot ----------------------- */
window.addEventListener("load", async () => {
  await requireAuth();
});
