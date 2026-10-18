# Retail tests (state on 18 Oct 2026, 9.5.0.2)
Builds kept in `tests/builds/`: the last three Retail test builds and the last landing page. Older builds stay in Git history.

| Test | Command (from its folder) | What it proves |
|---|---|---|
| Regression, 8 cases | `node regression.cjs <old build> <new build>` (review_9362) | Same cells, no new or bigger mandatory rule |
| Contracts, month boundaries | `node contracts.cjs <build>`, `node boundaries.cjs <build>` (review_9362) | Compare the JSON with the previous build |
| Manager days off | `node manual-off.cjs [build]` (review_9362) | 5 working days a week with the manager's OFF |
| Monthly = Calendar (Astra) | `node manual-matrix.cjs [build]` (review_9405), `node markers.cjs [build]` (review_9406) | An absence, a training or a shift gives the same result from both screens |
| One date per calculation | `node midnight.cjs [build]` (review_9406) | A plan prepared before midnight does not move after |
| Check with a saved context | `node validate-plan-9502.cjs [build]` (review_9502) | validatePlan gives the calculation's answer and ignores later live changes |
| Shared bench | `python3 run_bench.py <build>` | Scores of the synthetic stores |
| Sign in and roles | `python3 probe_accounts_9500.py <build>` | 32 checks with fictional accounts |
| Mobile sign in | `python3 probe_mobile_login_9501.py [build]` | 30 screenshots, sizes and fonts |
| Database rights | `python3 ../../sql/accounts_test/test_accounts.py`, `test_cleanup.py` | 49 checks on an isolated PostgreSQL 16 |
