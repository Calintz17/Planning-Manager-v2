CAST
CELINE Automated Scheduling Tool..

Browser-based workforce planning. Two modules, same idea: kill the manual Excel scheduling and build a plan from workload, available people and local rules.
The engine plans week by week. Monthly is the view, not a monthly work quota.

Retail
- Monthly planning for sales, management and stock, with separate corners.
- Shifts chosen against hourly traffic, with opening and closing coverage by corner.
- Fixed or flexible part-time, absences, rest days and manual shift changes.
- Intraday missions: morning brief, welcome, training and clienteling, plus lunch and breaks.
- Editable traffic: Monthly > Daily > Hourly, with history and draggable hourly profiles.
- English, Japanese, Korean, Simplified Chinese and Traditional Chinese. Translations live in i18n/.
  
Client Service
- Monthly staffing based on workload: forecast volume × handling time.
- CALL, CHAT, MAIL, BACK-OFFICE, FRAUD and CLIENTELING. Priorities, handling times, skills and colors are editable.
- Clickable task permissions on each agent's row. Team Leaders take tasks according to their permissions.
- Intraday tasks in 30-minute slots, around pauses and missions. Calls/chats are shared across eligible agents, with a configurable occupancy target.
- Projected unfinished MAIL, BACK-OFFICE and FRAUD carry forward, including across months. CALL and CHAT never carry forward.
- Traffic by task: Monthly > Daily > Hourly, historical comparisons, editable forecasts and trends. Dashboard bars split by task, with volumes and workload hours kept separate.
- English only.
  
Shared tools
- Dashboard, Monthly, Intraday, Client Advisors, Traffic, Calendar and Settings.
- Custom shifts, opening/closing minimums, late-shift target, opening hours by day, calendar exceptions, contract rules, rest and part-time. Settings autosave.
- Saved monthly plans stay frozen until Recalculate from today. Manual changes are preserved; Reset manual changes clears them.
- Intraday blocks can be added, changed, deleted, moved and resized. Desktop drag controls; tap menus on mobile.
- Download: Excel or PDF. Send: native PDF sharing when supported, otherwise a downloaded PDF and a prefilled email. The email attachment is added manually.
Short on people? CAST does its best with what's there. No gap panels or coverage alerts. Skills stay strict; staffing targets remain subject to availability, manual choices and local rules.

Stack and files
- Plain HTML, CSS and JavaScript: one HTML file per module.
- Supabase: Postgres and browser API. Shared reference tables, retail_ tables for Retail and csc_ tables for CSC state and forecasts.
- GitHub Pages hosting. Logos in logo/, Retail dictionaries in i18n/.
- CDN libraries: supabase-js, xlsx-js-style, html2canvas and jsPDF. Public holidays use the Nager.Date API.

- 
Apply the matching SQL migrations, keep the pages and asset folders together, then publish over HTTPS. GitHub's web editor is enough for routine updates. Initialization scripts can reset settings; use the reviewed migrations for existing data.
Browser uses the public anon key only. Never put service_role in the front end. No per-user authentication yet; current RLS policies are permissive. Selecting a store or region is not access control.

Links
- Repository
- Retail
- Client Service
