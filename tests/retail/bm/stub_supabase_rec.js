// Supabase stand-in that records every write (9.5.0.4 functional test). Signed in as a test admin, like stub_supabase.js.
// Reads return empty lists (setup.js fills the page); writes return their rows with an id, so saves are confirmed.
// window.__writes: [[table, method, payload, filters]] in order.
(function () {
  var U = { id: 'test-admin', email: 'admin@test.local', user_metadata: { pw_changed: true } };
  var P = { user_id: U.id, email: U.email, full_name: 'Test Admin', role: 'admin', region_id: null, active: true };
  var W = window.__writes = [], n = 0;
  function Q(t) {
    var write = null, payload = null, filters = [];
    function rows() {
      if (!write) return t === 'retail_profiles' ? P : [];
      var list = Array.isArray(payload) ? payload : payload ? [payload] : [{}];
      return list.map(function (r) { return Object.assign({ id: 'rec-' + (++n) }, r); });
    }
    var q = new Proxy(function () {}, { get: function (o, k) {
      if (k === 'then') return function (ok, err) {
        if (write) W.push([t, write, JSON.parse(JSON.stringify(payload || null)), filters]);
        var d = rows(); return Promise.resolve({ data: d, error: null }).then(ok, err);
      };
      if (k === 'catch') return function () { return q; };
      return function () {
        var a = [].slice.call(arguments);
        if (['insert', 'upsert', 'update', 'delete'].indexOf(k) !== -1) { write = k; payload = a[0] || null; }
        else if (k === 'eq' || k === 'in') filters.push([k, a[0], a[1]]);
        return q;
      };
    }, apply: function () { return q; } });
    return q;
  }
  window.supabase = { createClient: function () { return {
    from: function (t) { return Q(t); }, rpc: function () { return Q('_rpc'); },
    channel: function () { return { on: function () { return this; }, subscribe: function () { return this; } }; },
    auth: { getSession: function () { return Promise.resolve({ data: { session: { user: U } } }); },
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
      getUser: function () { return Promise.resolve({ data: { user: U } }); },
      signInWithPassword: function () { return Promise.resolve({ data: { user: U }, error: null }); },
      signOut: function () { return Promise.resolve({ error: null }); },
      updateUser: function () { return Promise.resolve({ data: { user: U }, error: null }); } }
  }; } };
})();
