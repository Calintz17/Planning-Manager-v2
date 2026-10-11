# tests/ : shared test folder (Claude, Astra, Roman)

Nothing here is loaded by `retail.html` or `CSC.html`. The site does not use it.

**Public repo: no real names, no personal data.** Agents are anonymised (Agent 01…), leave types are generic (ABS / OUT / OFF). Real plannings and employee names stay out of GitHub.

## Folders
- `retail/bm/` : Retail engine test bench, built from a real department-store month (November 2026), anonymised.
  - `setup.js` : test data (agents, roles, corners, leaves, shifts, settings). Traffic is synthetic.
  - `check_rules.js` : generates October, November and December in a row and checks the hard rules: max 5 working days in a row (OUT counted), max 5 days per Monday-to-Sunday week, 11 h rest, weekly hours, store opening and closing, no empty corner, opening and closing in every corner.
  - `official_nov2026_anonymized.json` : the real planning of the month, per agent id and date (reference for matching).
- `audits/` : audit reports and replies. One file per round, named `YYYY-MM-DD_<author>_<subject>.md` (author = astra, claude or roman).

## How to run the bench
Open `retail.html` with a stubbed Supabase, then evaluate `setup.js` and `check_rules.js` in the page. Every result must say which `retail.html` it tested (first characters of its SHA-256).
