// Hard-rule check: generates October, November and December 2026 in a row, then lists every breach with its dates.
// Run it with run_bench.py (browser clock fixed at 2026-10-31 12:00). Limits are read from the settings.
// Optional: window.OFFICIAL = official_nov2026_anonymized.json gives the November match (K3 day, K4 exact cell).
(() => {
  var clock = toDateStr(new Date());
  switchPlanningView('monthly');
  function gen(y, m, prev) {
    monthlyRef = new Date(y, m, 1);
    planSnapshot = { storeId: currentStoreId, month: y + '-' + String(m + 1).padStart(2, '0') + '-01', ok: false, plan: null, prevPlan: prev, history: [] };
    renderMonthlyPlanning();
    return JSON.parse(JSON.stringify(monthlyResult));
  }
  var O = gen(2026, 9, null), N = gen(2026, 10, O), D = gen(2026, 11, N);
  var all = Object.assign({}, O, N, D), days = Object.keys(all).sort();
  var lim = dayLimits(), weekMin = regulations.weekly_hours * 60, gapMin = (regulations.rest_gap_hours || 0) * 60, from = '2026-10-05', to = '2026-12-27';
  function res(a, ds) { return (all[ds] || {})[a.id]; }
  function busy(a, ds) { var r = res(a, ds); return isOnsite(a, ds, r) || (r && r.code === 'OUT') || agentOnLeave(a.id, ds) === 'out'; }
  function monday(ds) { var d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toDateStr(d); }
  var out = { clock: clock, limits: lim, weekDays: {}, runOver: [], weekOver: [], twoWeeksOver: [], restShort: [], restUnknown: 0, fixedToFix: [], hoursOver: [], nov: {} };
  agents.forEach(function(a) {
    var name = (a.first_name + ' ' + a.last_name).trim(), run = 0, runStart = '', wk = {}, hk = {}, prev = null;
    days.forEach(function(ds) {
      var k = monday(ds), r = res(a, ds);
      if (busy(a, ds)) {
        if (!run) runStart = ds; run++;
        if (run === lim.row + 1) out.runOver.push(name + ' ' + runStart + '>' + ds);
        wk[k] = (wk[k] || 0) + 1;
      } else run = 0;
      var wh = isOnsite(a, ds, r) ? workHoursOf(a, ds, r) : null;
      if (wh) {
        hk[k] = (hk[k] || 0) + paidMinOf(wh.start, wh.end);
        if (prev && (new Date(ds) - new Date(prev.ds)) / 864e5 === 1 && 1440 + wh.start - prev.end < gapMin) out.restShort.push(name + ' ' + ds);
        prev = { ds: ds, end: wh.end };
      } else prev = null;
      // Day next to an OUT day: OUT has no known hours, so the daily rest cannot be checked (unknown, not valid)
      if (wh && [-1, 1].some(function(k) { var x = new Date(ds + 'T12:00:00'); x.setDate(x.getDate() + k); var xs = toDateStr(x); return !isOnsite(a, xs, res(a, xs)) && busy(a, xs); })) out.restUnknown++;
    });
    // A fixed contract above Labor rules is kept as the manager set it: listed as to fix, never as compliant
    var fxIssue = fixedScheduleIssue((agentPrefs[a.id] || {}).fixed_schedule, retailStatusOf(a));
    if (fxIssue) out.fixedToFix.push(name + ': ' + fxIssue);
    var ks = Object.keys(wk).sort();
    ks.forEach(function(k, i) {
      if (k < from || k > to) return;
      out.weekDays[wk[k]] = (out.weekDays[wk[k]] || 0) + 1;
      if (wk[k] > lim.week) out.weekOver.push(name + ' ' + k + ':' + wk[k]);
      var nx = new Date(k + 'T12:00:00'); nx.setDate(nx.getDate() + 7); nx = toDateStr(nx);
      if (nx <= to && wk[k] + (wk[nx] || 0) > lim.twoWeeks) out.twoWeeksOver.push(name + ' ' + k + '+' + nx + ':' + (wk[k] + (wk[nx] || 0)));
    });
    Object.keys(hk).forEach(function(k) { if (k >= from && k <= to && weekMin > 0 && hk[k] > weekMin + 1e-6) out.hoursOver.push(name + ' ' + k + ':' + hk[k] / 60 + 'h'); });
  });
  // November: store and corner coverage
  var x = { noOpen: [], noClose: [], cornerEmpty: [], cornerNoOpen: [], cornerNoClose: [] };
  Object.keys(N).sort().forEach(function(ds) {
    if (getDayClosureType(ds)) return;
    var hm = dayMinutes(ds), o = 0, c = 0, cor = {};
    agents.forEach(function(a) {
      var r = N[ds][a.id]; if (!isOnsite(a, ds, r) || poolOf(a) === 'stock') return;
      var wh = workHoursOf(a, ds, r), cv = coverOfHours(wh.start, wh.end, hm);
      if (cv.open) o++; if (cv.close) c++;
      if (poolOf(a) !== 'sales') return;
      var cc = r.corner || (storeCorners.find(function(q) { return q.id === a.home_corner_id; }) || {}).code; if (!cc) return;
      cor[cc] = cor[cc] || { o: 0, c: 0 }; if (cv.open) cor[cc].o++; if (cv.close) cor[cc].c++;
    });
    if (!o) x.noOpen.push(ds); if (!c) x.noClose.push(ds);
    storeCorners.forEach(function(q) { var z = cor[q.code]; if (!z) x.cornerEmpty.push(ds + ' ' + q.code); else { if (!z.o) x.cornerNoOpen.push(ds + ' ' + q.code); if (!z.c) x.cornerNoClose.push(ds + ' ' + q.code); } });
  });
  out.nov = x;
  // November match with the official planning
  if (window.OFFICIAL) {
    var tot = 0, day = 0, cell = 0;
    Object.keys(OFFICIAL).forEach(function(id) {
      var a = agents.find(function(q) { return q.id === id; }); if (!a) return;
      Object.keys(OFFICIAL[id]).forEach(function(ds) {
        var r = N[ds] && N[ds][id]; if (!r) return;
        var o = OFFICIAL[id][ds], ours = isOnsite(a, ds, r) ? 'W' : r.code === 'OUT' ? 'OUT' : r.code === 'A' ? 'A' : 'OFF';
        var want = o === 'OFF' ? 'OFF' : o === 'ABS' ? 'A' : o === 'FO' ? 'OUT' : 'W';
        tot++; if (ours !== want) return; day++;
        if (want !== 'W') { cell++; return; }
        var p = o.split('-'), sh = p[0], cn = (p[1] || '').replace('HP', 'PRF').replace('SHOES', 'SHO');
        if (o === 'CL-G') { sh = 'C'; cn = 'LG'; }
        if (cn === 'OPS') { sh += 'S'; cn = ''; }
        var myCorner = r.corner || (storeCorners.find(function(q) { return q.id === a.home_corner_id; }) || {}).code;
        if (r.code === sh && (!cn || myCorner === cn)) cell++;
      });
    });
    out.match = { cells: tot, dayPct: Math.round(1000 * day / tot) / 10, exactPct: Math.round(1000 * cell / tot) / 10 };
  }
  return JSON.stringify(out);
})()
