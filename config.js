// config.js
// ⚠️ Clé "anon" = OK côté navigateur. NE PAS utiliser la service_role ici.

export const CONFIG = {
  SUPABASE_URL: "https://miawersffeosiovqdokw.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pYXdlcnNmZmVvc2lvdnFkb2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMDY4NTYsImV4cCI6MjA3Njc4Mjg1Nn0.ixCX8Zh8QLxJrnV7ncpNSCv3KtL0ao0PqsFmA6xYYyA",
  SYNC_FORECAST: true
};

// Rend l’objet dispo globalement pour app.js / ForecastStore
window.CONFIG = CONFIG;
