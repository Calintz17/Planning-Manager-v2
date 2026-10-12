# Learning v2 — public synthetic bench

This folder is experimental and is not loaded by Retail or CSC.
No employee names, actual schedules or private fixtures are included.

Run with Node.js, no external dependency:
```sh
node tests/prototypes/learning-v2/learning.test.cjs
node tests/prototypes/learning-v2/history-policy.test.cjs
node tests/prototypes/learning-v2/simulation.cjs
```

- learning.js: regularized team/person/weekday OFF and shift probabilities, optional recency weights.
- history-policy.js: reference selection by cutoff, validation/source, target roster, employment, context and catalogue; no archive mutation.
- viability-gate.js: refuses any remaining final violation and any new violation.
- history-policy.test.cjs: 15 history/team evolution checks.
- simulation.cjs: four synthetic combined planning scenarios, plus insufficient capacity and regression rejection. This small bounded planner is NOT the CAST production engine. A failed search means no solution found, not a proof of infeasibility.
- learning.test.cjs: probabilities, empty-history fallback, duplicate rejection and leakage exclusions.

A passed bench is not worldwide legal certification. Historical OUT hours, adjacent months, effective-dated contracts and valid schedule provenance remain integration requirements.
The module emits probabilities; it does not itself authorize work beyond constraints.
The six-month selection with 90-day half-life is one supported policy, not a calibrated universal optimum.
See tests/audits/2026-10-12_astra_apprentissage-historique-ruleset-v2.md for actual engine experiments, limits and proposal.
