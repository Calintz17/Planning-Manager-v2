// app.js — Étape 2 : Auth Supabase + seed par défaut

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
// Import Supabase client depuis CDN ESM (pas de build nécessaire)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// -------------- UI: Tabs -----------------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const target = btn.getAttribute('data-tab');
    tabPanels.forEach(p => {
      p.classList.toggle('visible', p.id === target);
    });
  });
});

// -------------- Auth Modal -----------------
const authModal = document.getElementById('auth-modal');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const forgotLink = document.getElementById('forgot-link');
const authError = document.getElementById('auth-error');

const emailEl = document.getElementById('auth-email');
const passEl = document.getElementById('auth-password');
const regionEl = document.getElementById('auth-region');

// Helper: ensure profile exists (set default_region)
async function ensureProfile(userId, email, defaultRegion) {
  // Upsert: profiles(id=email’s user id)
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, email, default_region: defaultRegion }, { onConflict: 'id' });
  if (error) throw error;
}

async function seedDefaultsIfEmpty(regionCode) {
  // Appelle la fonction SQL pour semer tasks/rules/forecast totals si besoin
  const { error } = await supabase.rpc('seed_defaults_for_current_user', { p_region: regionCode });
  if (error) {
    // Ce n’est pas bloquant si déjà seedé, on log juste
    console.warn('seed_defaults_for_current_user:', error.message);
  }
}

// Liste d’agents par défaut (comme demandé)
const DEFAULT_AGENTS = {
  US: [
    'CARMICHAEL Keiani','AKOPIAN Ani','KEILITZ Madeline','YOUNG Nicole','TAVAREZ Valerie','SYRDAHL Victoria','BAMBA Nimatul'
  ],
  CN: [
    'XIAO Nadia','YANG Joyce','RONG Grace','CHENG Lily','LIAO Adam','WANG Nicole','YANG Yilia','HE Krystal'
  ],
  JP: [
    'SHIONOIRI Ayumi','ADACHI Kazue','YAMADA Kyohei','MISHINA Shinobu','KURIMOTO Kaori','MATSUURA Minato'
  ],
  KR: [
    'KIM Dooyeon','KIM Bella','RYOO Jiyeon','SONG Chaerin','YANG Inseok','LEE Lina'
  ],
  EMEA: [
    'PONS Silvia','BIDAU Julien','NGOUALLOU Elisabeth','BEAUVOIS Brice','CAFAGNA Olivia','SHEFFIELD Duncan',
    'VOGEL Leander','NGANZAMI EBALE Naomi','VAZZA Pierluigi','BENMOKTHTAR Safia','RIZZO Stéphane','GEISSLEIR Simone'
  ],
  SEAO: [
    'CHIA Michell','UNGSUNANTAWIWAT Noppawan','YODPANICH Pichaya','SOON Shanice'
  ],
};

// Ajoute les agents par défaut s’il n’y en a aucun pour l’owner
async function seedAgentsIfEmpty(regionCode) {
  const { data, error } = await supabase
    .from('agents')
    .select('id')
    .limit(1);
  if (error) { console.error(error); return; }
  if (data && data.length > 0) return; // déjà des agents, on ne touche pas

  const lists = Object.entries(DEFAULT_AGENTS);
  for (const [code, names] of lists) {
    for (const name of names) {
      const { error: e2 } = await supabase.rpc('add_agent_for_current_user', {
        p_full_name: name, p_region: code
      });
      if (e2) console.warn('add_agent_for_current_user:', name, e2.message);
    }
  }
}

// Gestion des sessions
async function refreshSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function requireAuth() {
  const session = await refreshSession();
  if (!session) {
    authModal.classList.add('visible');
    authModal.setAttribute('aria-hidden', 'false');
  } else {
    authModal.classList.remove('visible');
    authModal.setAttribute('aria-hidden', 'true');
  }
}

loginBtn.addEventListener('click', async () => {
  authError.textContent = '';
  const email = emailEl.value.trim();
  const password = passEl.value;
  const region = regionEl.value; // code choisi dans le modal

  if (!email || !password) {
    authError.textContent = 'Please enter email and password.';
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { authError.textContent = error.message; return; }

  const user = data.user;
  try {
    await ensureProfile(user.id, user.email, region);
    localStorage.setItem('pmv2_default_region', region);
    await seedDefaultsIfEmpty(region);
    await seedAgentsIfEmpty(region);
  } catch (e) {
    console.error(e);
  }

  await requireAuth();
});

signupBtn.addEventListener('click', async () => {
  authError.textContent = '';
  const email = emailEl.value.trim();
  const password = passEl.value;
  const region = regionEl.value;

  if (!email || !password) {
    authError.textContent = 'Please enter email and password.';
    return;
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) { authError.textContent = error.message; return; }

  // Après signUp, l’utilisateur peut devoir confirmer son email selon tes settings
  const session = await refreshSession();
  if (!session) {
    authError.textContent = 'Check your inbox to confirm your email, then log in.';
    return;
  }

  const user = session.user;
  try {
    await ensureProfile(user.id, user.email, region);
    localStorage.setItem('pmv2_default_region', region);
    await seedDefaultsIfEmpty(region);
    await seedAgentsIfEmpty(region);
  } catch (e) {
    console.error(e);
  }

  await requireAuth();
});

forgotLink.addEventListener('click', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const email = emailEl.value.trim();
  if (!email) { authError.textContent = 'Enter your email first.'; return; }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/index.html'
  });
  if (error) { authError.textContent = error.message; return; }
  alert('Password reset email sent.');
});

// Au chargement
window.addEventListener('load', async () => {
  await requireAuth();
});

