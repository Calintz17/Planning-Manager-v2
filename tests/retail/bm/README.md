# Retail tests (state on 19 Oct 2026, 9.5.0.4)
One test build: `tests/builds/CAST_RETAIL_TEST.html`, replaced at each version. The live page `retail.html` is the
reference to compare with. Older builds stay in Git history. All data here is fictional.

| Test | Command | What it proves |
|---|---|---|
| Regression, 8 cases | `node checks/regression.cjs <old build> <new build>` | Same cells, no new or bigger mandatory rule |
| Contracts, month boundaries | `node checks/contracts.cjs <build>`, `node checks/boundaries.cjs <build>` | Compare `checks/results/<build>-*.json` of the two builds |
| Manager days off | `node checks/manual-off.cjs [build]` | 5 working days a week with the manager's OFF |
| Monthly = Calendar | `node checks/manual-matrix.cjs [build]`, `node checks/markers.cjs [build]` | An absence, a training or a shift gives the same result from both screens |
| One date per calculation | `node checks/midnight.cjs [build]` | A plan prepared before midnight does not move after |
| Check with a saved context | `node checks/validate-plan.cjs [build]` | validatePlan gives the calculation's answer and ignores later live changes |
| Save and reload | `node checks/round2.cjs [build]` | The saved planning comes back the same |
| Functional, many months and odd cases | `node checks/functional.cjs <old build> <new build>` | 3 stores x 4 months x 2 clocks, plus short staff, no manager, closed days, manual mixes, saved planning kept or recalculated: same cells, rules and status, a cell for every advisor and day |
| Click-through of the main actions | `python3 probe_ui_flows.py <old build> <new build>` | Each step (cell, event, month, intraday mission, advisor, absence, settings, week, language, theme, account) gives the same screen, writes, message, and no error, desktop and phone |
| Shared bench | `python3 run_bench.py <build>` | Scores of the synthetic stores (compare with the live page) |
| Sign in and roles | `python3 probe_accounts.py [build]` | 39 checks with fictional accounts (flat store list for managers, retry after a load error) |
| Mobile sign in | `python3 probe_mobile_login.py [build]` | Screenshots, sizes and fonts |
| Database rights | `python3 ../../sql/accounts_test/test_accounts.py`, `test_cleanup.py` | 49 checks on an isolated PostgreSQL 16 |

Screenshots and probe results go to `screens/`, check results to `checks/results/`.
