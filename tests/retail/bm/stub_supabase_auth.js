// Supabase stand-in for the sign-in tests (9.5.0.0). Set window.__AUTH before the page loads:
// { db: { table: [rows] }, accounts: [{ email, password, user }], sessionUser, failOnce: { table: n } }. Session kept in sessionStorage.
(function () {
  var A = window.__AUTH || {}, DB = A.db || {};
  var log = window.__authLog = [];
  function getSess() { try { return JSON.parse(sessionStorage.getItem('__sess') || 'null'); } catch (e) { return null; } }
  function setSess(u) { try { sessionStorage.setItem('__sess', JSON.stringify(u)); } catch (e) {} }
  if (sessionStorage.getItem('__sess') === null) setSess(A.sessionUser || null);
  // Like the base (row level security): a manager sees his stores, a director his region, an admin everything
  function scope(t, rows) {
    var u = getSess();
    if (u && t === 'retail_review_seen') return rows.filter(function (r) { return r.user_id === u.id; });
    if (u && t === 'retail_plan_reviews') { var ok = storesOf(u).map(function (s) { return s.id; }); return rows.filter(function (r) { return ok.indexOf(r.store_id) !== -1; }); }
    if (!u || ['retail_regions', 'retail_countries', 'retail_stores'].indexOf(t) === -1) return rows;
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
  function profileOf(u) { return u && (DB.retail_profiles || []).find(function (x) { return x.user_id === u.id && x.active !== false; }); }
  // Stores an account may see, like retail_can_access_store
  function storesOf(u) {
    var p = profileOf(u); if (!p) return [];
    var country = function (id) { return (DB.retail_countries || []).find(function (c) { return c.id === id; }) || {}; };
    return (DB.retail_stores || []).filter(function (s) {
      return p.role === 'admin' || (p.role === 'director' ? country(s.country_id).region_id === p.region_id
        : (DB.retail_profile_stores || []).some(function (x) { return x.user_id === u.id && x.store_id === s.id; }));
    });
  }
  // The steps of a validation, with the same rules as tests/sql/2026-10-19_retail_reviews.sql and _cancel.sql
  function rpc(name, a) {
    var u = getSess(), p = profileOf(u), R = DB.retail_plan_reviews = DB.retail_plan_reviews || [];
    var fail = function (m) { return { data: null, error: { message: m } }; };
    var sees = function (sid) { return storesOf(u).some(function (s) { return s.id === sid; }); };
    var canSubmit = function (sid) { return !!p && (p.role === 'admin' || (p.role === 'manager' && sees(sid))); };
    var canReview = function (sid) { return !!p && (p.role === 'admin' || (p.role === 'director' && sees(sid))); };
    var name_ = p ? (p.full_name || p.email) : '', now = new Date().toISOString();
    var step = function (st, c) { return { status: st, by: u.id, name: name_, at: now, comment: c || '' }; };
    log.push(['rpc', name, a && (a.p_decision || a.p_month || a.p_id)]);
    if (name === 'retail_submit_review') {
      if (!canSubmit(a.p_store)) return fail('not allowed');
      if (R.some(function (r) { return r.store_id === a.p_store && r.month === a.p_month && r.status === 'pending'; })) return fail('already pending');
      var rev = R.filter(function (r) { return r.store_id === a.p_store && r.month === a.p_month; }).length + 1;
      var row = { id: 'rv' + (R.length + 1), store_id: a.p_store, month: a.p_month, revision: rev, status: 'pending', submitted_plan: a.p_plan,
        reviewed_plan: null, context: a.p_context, diagnostics: a.p_diagnostics, comment: '', submitted_by: u.id, submitted_by_name: name_,
        submitted_at: now, decided_by: null, decided_by_name: '', decided_at: null, history: [step('pending')] };
      R.push(row); return { data: { id: row.id, revision: rev, status: 'pending' }, error: null };
    }
    var r = R.find(function (x) { return x.id === a.p_id; });
    if (name === 'retail_withdraw_review') {
      if (!r || !canSubmit(r.store_id)) return fail('not allowed');
      if (r.status !== 'pending' || r.revision !== a.p_revision) return fail('changed meanwhile');
      Object.assign(r, { status: 'withdrawn', decided_by: u.id, decided_by_name: name_, decided_at: now, history: (r.history || []).concat([step('withdrawn')]) });
      return { data: { id: r.id, status: 'withdrawn' }, error: null };
    }
    if (name === 'retail_decide_review') {
      if (!r || !canReview(r.store_id)) return fail('not allowed');
      if (r.status !== 'pending' || r.revision !== a.p_revision) return fail('changed meanwhile');
      Object.assign(r, { status: a.p_decision, reviewed_plan: a.p_plan || r.submitted_plan, comment: a.p_comment || '', decided_by: u.id, decision_diagnostics: a.p_diagnostics || null,
        decided_by_name: name_, decided_at: now, history: (r.history || []).concat([step(a.p_decision, a.p_comment)]) });
      return { data: { id: r.id, status: a.p_decision }, error: null };
    }
    if (name === 'retail_cancel_review') {
      if (!r || !canReview(r.store_id)) return fail('not allowed');
      if (r.revision !== a.p_revision || (r.status !== 'pending' && r.status !== 'validated') ||
          R.some(function (x) { return x.store_id === r.store_id && x.month === r.month && x.revision > r.revision; })) return fail('changed meanwhile');
      Object.assign(r, { status: 'cancelled', comment: a.p_comment || '', decided_by: u.id, decided_by_name: name_, decided_at: now,
        history: (r.history || []).concat([step('cancelled', a.p_comment)]) });
      DB.retail_review_seen = (DB.retail_review_seen || []).filter(function (x) { return x.review_id !== r.id; });
      return { data: { id: r.id, status: 'cancelled' }, error: null };
    }
    return { data: null, error: null };
  }
  function Q(t) {
    var rows = scope(t, (DB[t] || []).slice()), single = false, write = false, ins = null, head = false;
    var q = {
      gte: function (k, v) { rows = rows.filter(function (r) { return r[k] != null && r[k] >= v; }); return p; },
      order: function (k, o) { var asc = !o || o.ascending !== false; rows.sort(function (x, y) { return (x[k] > y[k] ? 1 : x[k] < y[k] ? -1 : 0) * (asc ? 1 : -1); }); return p; },
      limit: function (n) { rows = rows.slice(0, n); return p; },
      range: function (a, b) { rows = rows.slice(a, b + 1); return p; },
      select: function (c, o) { head = !!(o && o.head); return p; },
      eq: function (k, v) { rows = rows.filter(function (r) { return r[k] === v; }); return p; },
      in: function (k, vs) { rows = rows.filter(function (r) { return vs.indexOf(r[k]) !== -1; }); return p; },
      maybeSingle: function () { single = true; return p; },
      single: function () { single = true; return p; },
      insert: function (x) { write = true; ins = x; return p; }, upsert: function () { write = true; return p; },
      update: function () { write = true; return p; }, delete: function () { write = true; return p; },
      then: function (ok, err) {
        // A.failOnce = { table: n }: the next n reads of that table fail (network or base error)
        if (!write && A.failOnce && A.failOnce[t] > 0) { A.failOnce[t]--; return Promise.resolve({ data: null, error: { message: 'Failed' } }).then(ok, err); }
        // A.rejectOnce = { table: n }: the next n reads of that table throw (the network is down)
        if (!write && A.rejectOnce && A.rejectOnce[t] > 0) { A.rejectOnce[t]--; return Promise.reject(new Error('network down')).then(ok, err); }
        // Seen marks are kept (one per person), the other writes are only answered
        if (write && ins && t === 'retail_review_seen') { var u = getSess(); (DB[t] = DB[t] || []).push({ review_id: ins.review_id, user_id: u && u.id }); }
        if (head) return Promise.resolve({ data: null, count: rows.length, error: null }).then(ok, err);   // count: 'exact', head: true
        var data = write ? [] : (single ? (rows[0] || null) : rows);
        return Promise.resolve({ data: data, error: null }).then(ok, err);
      }
    };
    var p = new Proxy(q, { get: function (o, k) { return k in o ? o[k] : function () { return p; }; } });
    return p;
  }
  window.supabase = { createClient: function () { return {
    from: function (t) { return Q(t); },
    rpc: function (name, args) { return Promise.resolve(rpc(name, args || {})); },
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
