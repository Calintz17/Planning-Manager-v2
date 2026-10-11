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
1. Open `retail.html` with a stubbed Supabase and the browser clock fixed at **2026-10-31 12:00** (Playwright: `page.clock.set_fixed_time(datetime(2026, 10, 31, 12, 0))` before `goto`). The clock decides which days are past, so results differ without it. `check_rules.js` prints the clock it saw.
2. Evaluate `setup.js`, then optionally `window.OFFICIAL = <official_nov2026_anonymized.json>`, then `check_rules.js`.
3. Every result says which `retail.html` it tested: first 12 characters of its SHA-256.

## Reference run (Claude, 2026-10-12)
`retail.html` 9.2.5, SHA-256 `7256ba6ea4db`, clock 2026-10-31, default limits 5 / 5 / 10:
no breach of days, days in a row, two weeks, rest or weekly hours; store open and closed every day; no empty corner;
2026-11-10: RTW without opening, SHO without closing (one seller in these corners, allowed by the "1 per corner" rule).
November match: day 64.6 %, exact cell 35.6 % (same as 9.2.4 on this bench). Traffic is synthetic, so this is not the real-store score.
