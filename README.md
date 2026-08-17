# CORA - Client Operations Rostering Assistant

Browser-based workforce planning tool. Two modules, same idea : kill the manual Excel scheduling and let an engine build the plan from workload, agent availability, and local rules.

Two flavors :
- **CSC** (`index.html`) - the call center module. Six global hubs : Paris, New York, Shanghai, Seoul, Tokyo, Singapore. Plans calls, chats, mails, back-office, fraud, clienteling.
- **Retail** (`retail.html`) - the boutique module. Same engine spirit, but for store floors : sales, management, stock. Navy for retail, red for CSC, an iOS-style toggle in the footer jumps between the two.

Each region / store has its own agents, its own traffic, its own rules, its own planning. You only ever see the scope you selected.

---

## What it does

1. You feed it the traffic (call volume for CSC, footfall for Retail), or let it auto-forecast.
2. It looks at who's available, their working %, their skills, and the local rules.
3. It spits out a weekly plan and an hour-by-hour intraday timeline.
4. Not enough people ? It doesn't crash. It schedules what it has, flags the gap, and moves the unmet work to the next day. Always does its best with what's there.

Tabs : Planning (Dashboard + Weekly + Intraday), Agents, Calendar, Settings, Regulations.

---

## Tech stack

Dead simple on purpose. No build step, no framework, no npm.

- **Front** : one single HTML file per module. All the HTML, CSS and JS inside. That's it.
- **Back** : Supabase (Postgres + auto API). Retail tables are prefixed `retail_`, CSC tables aren't. Same project.
- **Hosting** : GitHub Pages, straight from the repo.
- **Libs** (CDN, nothing installed) : `supabase-js` to talk to the DB, `xlsx-js-style` for the Excel exports, Nager.Date for public holidays.

Everything is edited through the GitHub web UI. No terminal, no local setup. Locked-down corporate laptop, can't install anything, so a single file served by GitHub Pages is the only thing that works end to end. Plug and play. Can't do better with the tools I have, and honestly I don't want more complicated.

Anon public key only. `service_role` never touches the front.

---

## Links

- Repo : https://github.com/Calintz17/Planning-Manager-v2
- Supabase : https://miawersffeosiovqdokw.supabase.co

---

## Rules that matter

The non-obvious stuff baked into the engine. Touch the code, keep these true.

- **Never blocks.** Needs 4, has 3 ? Schedules 3, raises an alert, moves on.
- **Strict skills / pills.** An agent only ever does tasks they're tagged for. No silent switching. Unmet work carries to the next day.
- **Everything is weekly.** No monthly quota, that was a myth I killed. The month view is just display, the engine thinks in weeks.
- **Presence, not gaps.** Agents open (morning) or close (afternoon), no mid-day hole. The engine picks morning vs afternoon based on where the traffic is heaviest.
- **Rest days : exactly 2 a week.** Min and max. Placed on the quiet days.
- **Holidays are neutral.** They don't eat rest days, they're offered on top.
- **Absences replace a worked day**, not a rest day.

---

## Retail specifics

The retail module has its own flavor on top of the shared idea.

- **Three pools** : management, sales, stock. Each ventilated week by week on the traffic.
- **Shifts** : Opening (O), Middle (M), Closing (C), Sunday/holiday (D). Stock has its own : OS / MS / CS.
- **70-30 closing bias.** More people on the close than the open, because that's where the traffic sits.
- **Part-time, two kinds.** Fixed : works set contractual days and hours. Flexible (volant) : the engine spreads them on the busiest days at their % of a full week. Half a day can land in the mix, shown as a diagonal half-cell.
- **Intraday missions** : morning brief, lunch, welcome. Drag to move, click the bar to add one, hover to remove.
- **Excel exports** : monthly and intraday, A4-ready, colors matching the screen.
- **Half-hour opening times** : stores can close at 19:30, not just on the hour.

---

## Database

All in Supabase, RLS on every table with an allow-all policy (single trusted internal app, no per-user auth yet). CSC tables plain, retail tables prefixed `retail_`.

Core tables : regions / countries / stores (the hierarchy), agents (with `work_pct`), agent skills, availability, leave, traffic (daily + monthly), tasks, regulations, calendar overrides, planning overrides, shift config, store settings, intraday overrides, intraday missions, highlights.

---

## Still on the horizon

- Data seeding : all regions, stores, and traffic loaded for real.
- Accounts system : Supabase auth, per-manager scopes, RLS isolation. Waiting on IT certification (touches data and accounts).
- Auto-email the weekly + intraday plan to each agent. Depends on accounts.
- Multi-store / multi-corner (think Galeries Lafayette : one store, several corners sharing stock but with dedicated agents). Next big chantier.
- A dead-code / cleanup pass, and a design refresh on the date and time pop-ups.
