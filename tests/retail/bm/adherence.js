// Traffic adherence of the generated November (October generated first), measured on the real intraday (lunches and breaks placed).
// Per open day and quarter hour: c = people on the floor, counted in fractions of the quarter hour (stock excluded, lunch and breaks off the floor),
// n = the same total spread like the hourly traffic. Adherence = 100 x (1 - sum|c - n| / sum(c + n)), averaged over the days.
// Floor = hours on the floor during opening hours per person and day. Mix = how often each sales shift is used.
(() => {
  switchPlanningView('monthly');
  function gen(y, m, prev) {
    monthlyRef = new Date(y, m, 1);
    planSnapshot = { storeId: currentStoreId, month: y + '-' + String(m + 1).padStart(2, '0') + '-01', ok: false, plan: null, prevPlan: prev, history: [] };
    renderMonthlyPlanning(); return JSON.parse(JSON.stringify(monthlyResult));
  }
  var O = gen(2026, 9, null), N = gen(2026, 10, O);
  var curve = storeSettings.hourly_curve || [], days = 0, sumA = 0, floorMin = 0, personDays = 0, mix = {}, worst = 100;
  Object.keys(N).sort().forEach(function(ds) {
    if (getDayClosureType(ds)) return;
    renderIntraday(ds); if (!intradayExport) return;
    var hm = dayMinutes(ds), c = [], wt = [];
    var rows = intradayExport.rows.filter(function(r) { var a = agents.find(function(x) { return x.id === r.agentId; }); return a && poolOf(a) !== 'stock'; });
    rows.forEach(function(r) { if (poolOf(agents.find(function(x) { return x.id === r.agentId; })) === 'sales') mix[r.code] = (mix[r.code] || 0) + 1; });
    personDays += rows.length;
    for (var t = hm.open; t < hm.close; t += 15) {
      var ci = hourlyCurveIndex(t);
      wt.push(curve.length && ci >= 0 && ci < curve.length ? Math.max(0, +curve[ci] || 0) : 1);
      // Share of the quarter hour on the floor, same convention as the engine (a 9:50 start counts 10 minutes of the 9:45 slot)
      var t0 = t / 60, t1 = t0 + 0.25;
      function part(a, b) { return Math.max(0, Math.min(b, t1) - Math.max(a, t0)) / 0.25; }
      c.push(rows.reduce(function(sum, r) {
        var away = r.blocks.reduce(function(x, b) { return /^(lun|brk)/.test(b.type) ? x + part(b.start, b.start + b.dur) : x; }, 0);
        return sum + Math.max(0, part(r.startH, r.endH) - away);
      }, 0));
    }
    var C = c.reduce(function(s, x) { return s + x; }, 0), W = wt.reduce(function(s, x) { return s + x; }, 0) || 1, dif = 0;
    c.forEach(function(x, i) { dif += Math.abs(x - C * wt[i] / W); });
    var A = C ? 100 * (1 - dif / (2 * C)) : 0;
    days++; sumA += A; worst = Math.min(worst, A); floorMin += C * 15;
  });
  return JSON.stringify({ days: days, adherence: Math.round(10 * sumA / days) / 10, worstDay: Math.round(10 * worst) / 10, floorHoursPerPersonDay: Math.round(100 * floorMin / 60 / personDays) / 100, mix: mix });
})()
