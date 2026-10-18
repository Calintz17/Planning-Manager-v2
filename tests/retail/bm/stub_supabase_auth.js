// Supabase stand-in for the sign-in tests (9.5.0.0). Set window.__AUTH before the page loads:
// { db: { table: [rows] }, accounts: [{ email, password, user }], sessionUser }. Session kept in sessionStorage.
(function () {
  var A = window.__AUTH || {}, DB = A.db || {};
  var log = window.__authLog = [];
  function getSess() { try { return JSON.parse(sessionStorage.getItem('__sess') || 'null'); } catch (e) { return null; } }
  function setSess(u) { try { sessionStorage.setItem('__sess', JSON.stringify(u)); } catch (e) {} }
  if (sessionStorage.getItem('__sess') === null) setSess(A.sessionUser || null);
  // Like the base (row level security): a manager sees his stores, a director his region, an admin everything
  function scope(t, rows) {
    var u = getSess(); if (!u || ['retail_regions', 'retail_countries', 'retail_stores'].indexOf(t) === -1) return rows;
    var p = (DB.retail_profiles || []).find(function (x) { return x.user_id === u.id && x.active !== false; });
    if (!p) return [];
    if (p.role === 'admin') return rows;
    var country = function (id) { return (DB.retail_countries || []).find(function (c) { return c.id === id; }) || {}; };
    var stores = (DB.retail_stores || []).filter(function (s) {
      return p.role === 'director' ? country(s.country_id).region_id === p.region_id
        : (DB.retail_profile_stores || []).some(function (x) { return x.user_id === u.id && x.store_id === s.id; });
    });
    if (t === 'retail_stores') return rows.filter(function (r) { return stores.some(function (s) { return s.id === r.id; }); });
    if (t === 'retail_countries') return rows.filter(function (r) { return stores.some(function (s) { return s.country_id === r.id; }); });
    return rows.filter(function (r) { return (p.role === 'director' && r.id === p.region_id) || stores.some(function (s) { return country(s.country_id).region_id === r.id; }); });
  }
  function Q(t) {
    var rows = scope(t, (DB[t] || []).slice()), single = false, write = false;
    var q = {
      select: function () { return p; },
      eq: function (k, v) { rows = rows.filter(function (r) { return r[k] === v; }); return p; },
      in: function (k, vs) { rows = rows.filter(function (r) { return vs.indexOf(r[k]) !== -1; }); return p; },
      maybeSingle: function () { single = true; return p; },
      single: function () { single = true; return p; },
      insert: function () { write = true; return p; }, upsert: function () { write = true; return p; },
      update: function () { write = true; return p; }, delete: function () { write = true; return p; },
      then: function (ok, err) {
        var data = write ? [] : (single ? (rows[0] || null) : rows);
        return Promise.resolve({ data: data, error: null }).then(ok, err);
      }
    };
    var p = new Proxy(q, { get: function (o, k) { return k in o ? o[k] : function () { return p; }; } });
    return p;
  }
  window.supabase = { createClient: function () { return {
    from: function (t) { return Q(t); },
    rpc: function () { return Q('_rpc'); },
    channel: function () { return { on: function () { return this; }, subscribe: function () { return this; } }; },
    auth: {
      getSession: function () { var u = getSess(); return Promise.resolve({ data: { session: u ? { user: u } : null } }); },
      getUser: function () { return Promise.resolve({ data: { user: getSess() } }); },
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
      signInWithPassword: function (c) {
        log.push(['signIn', c.email]);
        var a = (A.accounts || []).find(function (x) { return x.email === c.email && x.password === c.password; });
        if (!a) return Promise.resolve({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } });
        setSess(a.user);
        return Promise.resolve({ data: { user: a.user, session: { user: a.user } }, error: null });
      },
      signOut: function () { log.push(['signOut']); setSess(null); return Promise.resolve({ error: null }); },
      updateUser: function (attrs) {
        log.push(['updateUser', attrs]);
        var u = getSess(); if (u) { u.user_metadata = Object.assign({}, u.user_metadata, attrs.data || {}); setSess(u); }
        return Promise.resolve({ data: { user: u }, error: null });
      }
    }
  }; } };
})();
