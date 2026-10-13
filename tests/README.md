# tests/ : shared test folder (Claude, Astra, Roman)

Nothing here is loaded by `retail.html` or `CSC.html`. The site does not use it.

**Public repo: no real names, no personal data.** Agents are anonymised (Agent 01…), leave types are generic (ABS / OUT / OFF). Real plannings and employee names stay out of GitHub.

## Folders
- `retail/bm/` : Retail engine test bench, built from a real department-store month (November 2026), anonymised.
  - `setup.js` : test data (agents, roles, corners, leaves, shifts, settings). Traffic is synthetic.
  - `check_rules.js` : generates October, November and December in a row and lists every breach with its dates. Limits come from the settings (Max working days / week, Max days in a row, Max days over 2 weeks, Max hours / week, rest between shifts, unpaid lunch). November store and corner coverage. If `window.OFFICIAL` holds the official JSON, it also gives the November match (day and exact cell). Needs `retail.html` 9.2.5 or later.
  - `official_nov2026_anonymized.json` : the real planning of the month, per agent id and date (reference for matching).
- `builds/` : versions proposed by Claude or Astra, before Roman validates them. Never loaded by the site. Name: `CAST_vX_Y_Z_RETAIL.html` or `CAST_VX.Y.Z_CSC.html`, one version number per file. Roman alone copies a validated build into `retail.html` or `CSC.html`.
- `audits/` : audit reports and replies. One file per round, named `YYYY-MM-DD_<author>_<subject>.md` (author = astra, claude or roman).


## How to run the bench
`python3 tests/retail/bm/run_bench.py tests/builds/CAST_v9_2_7_RETAIL.html` (Python Playwright with Chromium).
The runner prints the SHA-256 it computed, fixes the browser clock at 2026-10-31 12:00, stubs Supabase (`stub_supabase.js`), loads `setup.js` and the official JSON, then runs `check_rules.js` for four settings: base 5/5/10, 6/12/11 at 45 h (stress), a fixed contract with no hours, and a fixed 5 x 08:00-18:00 contract already in the database. On the base it also saves two contracts through the real agent editor: 5 x 08:00-18:00 must be refused with no write, 4 days with no hours must be saved.
`retail.html` on main is the live version, not the candidate: always name the build file you test.
Results also give the November functional compatibility (coverage, rest, shift mix, corners; weights 40/30/20/10 proposed) next to the exact match.
Results have three states: a breach, "to fix" (a fixed contract above Labor rules, kept as the manager set it) and "not checkable" (daily rest next to an OUT day, whose hours are unknown). Not checkable is never counted as valid.

## Reference run (Claude, 2026-10-12)
`tests/builds/CAST_v9_2_7_RETAIL.html`, SHA-256 `60d631e04b7a`:
- base 5/5/10: no breach; in November every corner has an opener and a closer every day, and someone on the floor every quarter hour of the opening (lunch and breaks taken in turn, 0 empty quarter); 14 daily rests not checkable (next to OUT); agent editor: 5 x 08:00-18:00 refused, 0 write; 4 days with no hours saved;
- 6/12/11 at 45 h (stress): no breach of days, rest or hours; 2026-11-01 RTW and SHO empty, PRF without opening, LG without closing (only day of its week in November, the team already used its days in October: left to the manager), so LG and PRF also have empty quarters that day;
- fixed 4 days, no hours: accepted, no breach, no corner gap;
- fixed 5 x 08:00-18:00 already saved: listed "to fix" and 45 h weeks reported (the contract is kept, never cut silently); 6 November corners without opening, so 2 hours without anyone in each.
- November match on this bench (base): day 64.3 %, cell 35.1 % (codes and corners only, synthetic traffic: not the private real-store score).
