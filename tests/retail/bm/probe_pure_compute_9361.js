// Claude 2026-10-16, Retail 9.3.61. Run after tests/retail/bm/setup.js in an isolated page: computeMonthlyPlan changes no global state and no screen, and gives the same plan twice.
(() => {
  switchPlanningView('monthly'); monthlyRef = new Date(2026, 10, 1); planSnapshot = null; renderMonthlyPlanning();
  const names = ['planningOverrides','cornerOverrides','availability','agentLeaves','agentPrefs','regulations','storeSettings','RETAIL_SHIFTS','monthlyResult','planSnapshot','fixedWarned','intradayOverrides','addedMissions','calHolidays','calOverrides','agents'];
  const snap = () => JSON.stringify(names.map(n => { try { return eval(n); } catch (e) { return null; } }));
  const html = document.getElementById('planning-monthly-body').innerHTML.length, before = snap();
  const r1 = computeMonthlyPlan({ habits: true }), r2 = computeMonthlyPlan({ habits: false });
  return JSON.stringify({ globalsSame: snap() === before, domSame: document.getElementById('planning-monthly-body').innerHTML.length === html, sameTwice: JSON.stringify(r1.cells) === JSON.stringify(computeMonthlyPlan({ habits: true }).cells) });
})()
