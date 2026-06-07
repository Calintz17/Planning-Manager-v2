# Planning Manager V1.21

# CORA - Client Operations Rostering Assistant

yo
CORA is a browser-based workforce planning tool for a customer service operation spread across six global hubs. 
It replaces the old manual Excel scheduling with an automatic engine that builds a weekly plan from forecasted workload, agent availability, and regional rules.

The six hubs are Paris (France), New York (USA), Shanghai (China), Seoul (South Korea), Tokyo (Japan), and Singapore.

Each hub has its own agents, its own forecasts, its own regulations, and its own planning. A region selector at the top of the app filters everything: you only ever see data for the region you have selected.

---

## What CORA does

1. You enter (or auto-generate) a forecast of the contact volume for the week.
2. CORA looks at which agents are available, their working percentage, their skills, and the local rules.
3. It produces a weekly schedule and a detailed intraday timeline (who does what, hour by hour).
4. If there are not enough people, it never crashes. It schedules everyone it has, flags the gap with a production alert, and carries the unmet work to the next day.

The interface is split into tabs: Planning (with a Recap dashboard and the Weekly / Intraday views), Agents, Calendar, Settings, and Regulations.

---

## Tech stack

The whole app is intentionally simple. There is no build step, no framework, no package manager.

- **Frontend**: a single HTML file containing all the HTML, CSS, and JavaScript. The current production file is `CORA_v1_21.html`.
- **Backend / database**: Supabase (Postgres + auto-generated API).
- **Hosting**: GitHub Pages, served directly from the repo.
- **External libraries** (loaded from a CDN, nothing installed):
  - `@supabase/supabase-js` - to talk to the database
  - `xlsx-js-style` - to generate the Excel exports
  - Nager.Date public API - to fetch public holidays per country

Everything is edited through the GitHub web interface. There is no local development setup, no terminal, no npm.

### Why a single file?

Deployment happens on a locked-down corporate environment where nothing can be installed. 
A single HTML file edited in the GitHub web UI and served by GitHub Pages is the only workflow that works end to end without any local tooling. 
I don't want a complicated thing
Ideally plug and play
Can't do better with the tools I have

---

## Project links

- **Repository**: https://github.com/Calintz17/Planning-Manager-v2
- **Supabase project**: https://miawersffeosiovqdokw.supabase.co

The Supabase connection uses the public **anon** key only (it is safe to have it in the frontend, that is what it is designed for). The `service_role` key is never used in this app.

---

## How the database is organized

All tables live in Supabase. Every table that holds region-specific data has a `region_id` column so the app can filter by the selected hub. Row Level Security is enabled on every table with an "allow all" policy (single trusted internal app, no per-user auth yet).

| Table | What it stores |
|---|---|
| `regions` | The six hubs (name, city, timezone). The source of truth for the region selector. |
| `agents` | One row per agent: first name, last name, region, active flag, and `work_pct` (100 = full time, 70 = part time, etc.). |
| `agent_tags` | Skills / eligibility per agent (`can_call`, `can_chat`, `can_fraud`, `can_backoffice`, etc.). One row per agent-skill pair. |
| `agent_availability` | Per agent, per day: is the agent working, resting, or absent (`day_status`). |
| `agent_leave` | Holiday / leave periods per agent (start date, end date, type). |
| `forecasts` | Per region, per date: the expected contact volume and average handle time. |
| `historical_volume` | Real past volume per region, per date, per hour, per task. Used to shape the forecast and detect anomalies. |
| `monthly_bo_targets` | Monthly Back-Office and Fraud volume targets, later spread across hours. |
| `tasks` | Task configuration per region: name, priority, filler flag, colors, handle time. |
| `regulations` | Local rules per region stored as key/value pairs (weekly hours, rest days, breaks, etc.). |
| `calendar_overrides` | Manual "this specific day is open / closed" decisions per region. |
| `schedule_overrides` | Manual changes a manager makes on the intraday timeline (drag-and-drop task or break moves), so they survive a reload. |

> Note to investigate: a few task fields (`required_tag`, `morning_only`) exist only in memory in the code, never in the database. They live in the `TASK_DEFAULTS` list inside the HTML file.

---

## Code organisation 

**1. `<style>` Style **
Grouped in clearly labelled sections (Header, Tabs, Layout, Planning table, Shift badges, Forecast, Recap, Calendar, Intraday timeline, etc.). The visual style is fixed and documented separately in the project rules: Apple-like, navy `#1a1a2e` brand color, white cards, soft borders. New UI must match it.

**2. `<body>` Body**
The header with the region selector and week navigation, the tab bar, and one block per tab (Planning, Agents, Calendar, Settings, Regulations), plus a few hidden popups (week picker, leave picker, shift switch, day open/close).

**3. `<script>` Script**
This is the brain of the app. The main groups of functions are:

- **Setup**: Supabase client, constants (`DAY_KEYS`, `REGION_DEFAULTS`), and the in-memory state variables (`agents`, `forecasts`, `availability`, `regulations`, `tasks`, etc.).
- **Init & region**: `init()` loads regions and boots the app; `onRegionChange()` reloads everything when you switch hub.
- **Loaders**: `loadTasks()`, `loadAgentTags()`, `loadRegulations()`, `loadCalendarData()`, `loadHistoricalVolume()`, `loadMonthlyBoTargets()` - each pulls its data from Supabase.
- **Forecast engine**: `buildAutoForecast()` generates the weekly forecast; `buildBoHourlyFromMonthly()` spreads monthly Back-Office/Fraud targets across the hours using the call curve as a shape.
- **Planning render**: `renderForecast()` and the Recap helpers (`buildRecapSummary()`, `recapSummaryHtml()`, anomaly and production-alert banners) build the weekly view and dashboard.
- **Intraday**: the timeline view, including drag-and-drop block swapping saved to `schedule_overrides`.
- **Calendar**: `renderCalendar()`, `loadHolidays()` (Nager.Date), leave management, and per-day open/close overrides.
- **Agents**: add, delete, change working percentage, toggle skill tags.
- **Excel export**: `exportWeekly()`, `exportRecap()`, `exportIntraday()` produce three A4-ready Excel views.
- **Regulations**: load, seed, and save the per-region rules.

---

## The scheduling rules that matter

These are the non-obvious business rules baked into the engine. If you change the code, keep them true.

- **The engine never blocks.** If it needs 4 agents and only has 3, it schedules 3, raises a production alert, and moves on. It always does the best it can with what is available.
- **Strict skills.** An agent is only ever assigned to tasks they have the skill tag for. The engine never silently switches an agent to a task outside their skills. Unmet work carries to the next day instead.
- **Agent presence is separate from opening hours.** Agents start at opening (morning shift) or end at closing (afternoon shift), with no mid-day gap. The engine decides morning vs afternoon based on where the hourly volume is heaviest, not at random.
- **At least one "hot" agent per open hour.** During opening hours, every hour must have at least one Call/Chat agent. Outside opening hours, a lone agent doing "cold" tasks (mail, back office, clienteling) is fine.
- **Weekly hours are strict per region.** Europe is 37.5h/week, the others 40h. Each scheduled block counts as one worked hour except unpaid Lunch and Break.

---

## Regional defaults

Opening hours, rest days, and weekly hours per hub (these are starting defaults; they can be overridden in the Regulations tab).

| Hub | Open | Close | Sat rest | Sun rest | Weekly hours |
|---|---|---|---|---|---|
| Paris | 10 | 18 | yes | yes | 37.5 |
| New York | 10 | 19 | yes | yes | 40 |
| Shanghai | 10 | 20 | no | no | 40 |
| Tokyo | 10 | 20 | no | no | 40 |
| Singapore | 7 | 20 | yes | yes | 40 |
| Seoul | 10 | 19 | yes | yes | 40 |

---

## Tasks

Six task types, in priority order (lower number = handled first when assigning agents). Each has its own color and average handle time in minutes.

| Task | Priority | Filler | Handle time | Skill tag |
|---|---|---|---|---|
| FRAUD | 1 | no | 10 min | can_fraud |
| CALL | 1 | no | 10 min | can_call |
| CHAT | 2 | no | 8 min | can_chat |
| MAIL | 3 | no | 5 min | can_mail |
| BACK-OFFICE | 4 | no | 10 min | can_backoffice |
| CLIENTELING | 5 | yes | 15 min | can_clienteling |

"Filler" means the task is used to fill spare agent time once the higher-priority work is covered.

---

## Version history 


|---|---|
| Build_V1 | First commit: initial HTML structure, color palette, and Supabase integration with an auth modal, across separate index.html / app.js / styles.css / config.js files. |
| Build_V1.1 | Added the Tasks module (CRUD and filters) and the Forecast module with data fetching. |
| Build_V1.2 | Added the Weekly planning module and a PTO drawer. |
| Build_V1.3 | Added the Regulations module with CRUD and validation, plus an attendance/calendar section. |
| Build_V1.4 | Reworked the header, footer, background and button colors, and added a task management UI. |
| Build_V1.5 | Iterated on the forecast (added a forecast test page) and refined the layout across several passes. |
| MVP_v1 | Switched to a single index.html file, deleting the separate app.js, styles.css and config.js. |
| MVP_v1.1 | Added the rotation engine, forecast blocking logic, and reactive opening-hours handling. |
| MVP_v1.2 | Added the auto-forecast and carry-over logic, with a carry-in banner. |
| MVP_v1.3 | Added the intraday view with drag-and-drop schedule overrides. |
| MVP_v1.4 | Refactored task configuration and defaults, and fixed agent tags saving by switching insert to upsert. |
| CORA_V1.5 | Added required tags to task defaults and converted agent tag chips to skill pills. |
| CORA_V1.6 | Added the Recap card and renamed the weekly forecast title. |
| CORA_V1.7 | Removed the Forecast tab and reorganized everything into the Settings tab. |
| CORA_V1.8 | Set the default planning view and reworked the view buttons. |
| CORA_V1.9 | Added the Shifts engine: agent presence handling and Morning / Afternoon scheduling logic. |
| CORA_V1.10 | Added the iOS-style shift switch popover and its styles. |
| CORA_V1.11 | Refined shift badge styling, presence logic, and shift hour calculations. |
| CORA_V1.12 | Added the Excel export button and its core functionality. |
| CORA_V1.13 | Refined the Excel export with extra cell merges and border styles. |
| CORA_V1.14 | Added the calendar navigation and leave declaration forms. |
| CORA_V1.15 | Added the annual calendar view and updated styles. |
| CORA_V1.16 | Added volume anomaly detection and updated styling. |
| CORA_V1.17 | Refactored the anomaly checks, coverage calculations, and production alert logic. |
| CORA_V1.20 | Bumped the in-app version to V1.20 and updated the setup steps. |
| CORA_V1.21 | Rebranded the header to CORA with the logo, and renamed the title. |
| CORA_V1.21.1 | Added the status bar with status text and the copyright credit; current version. |
