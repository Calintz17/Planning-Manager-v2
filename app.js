// app.js

// 1) Gestion des tabs (pas de scroll horizontal)
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

// 2) Modal Auth (bloquant tant qu’on n’est pas connecté)
const authModal = document.getElementById('auth-modal');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const forgotLink = document.getElementById('forgot-link');
const authError = document.getElementById('auth-error');

loginBtn.addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const region = document.getElementById('auth-region').value;

  authError.textContent = '';

  // Étape 2 : on appellera Supabase ici pour "signInWithPassword"
  // Pour l’instant, on simule la connexion si le champ est rempli.
  if (!email || !password) {
    authError.textContent = 'Please enter email and password.';
    return;
  }

  // TODO (Étape 2) : remplacer par la vraie auth Supabase
  // On stocke la région par défaut côté client (on la persistera en base à l’étape 2)
  localStorage.setItem('pmv2_default_region', region);

  // Ferme le modal
  authModal.classList.remove('visible');
  authModal.setAttribute('aria-hidden', 'true');
});

signupBtn.addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const region = document.getElementById('auth-region').value;

  authError.textContent = '';

  if (!email || !password) {
    authError.textContent = 'Please enter email and password.';
    return;
  }

  // TODO (Étape 2) : remplacer par la vraie "signUp" Supabase
  localStorage.setItem('pmv2_default_region', region);

  // Simule la création de compte puis ferme le modal
  authModal.classList.remove('visible');
  authModal.setAttribute('aria-hidden', 'true');
});

forgotLink.addEventListener('click', (e) => {
  e.preventDefault();
  // TODO (Étape 2) : appeler "resetPasswordForEmail" via Supabase
  alert('Password reset (simulé). Nous brancherons Supabase à l’étape 2.');
});

// 3) Au chargement : forcer le modal visible (on exigera la connexion réelle à l’étape 2)
window.addEventListener('load', () => {
  authModal.classList.add('visible');
  authModal.setAttribute('aria-hidden', 'false');
});
