# The cleanup on the isolated copy, after the account parts: it applies, and the rights checks still pass.
# Usage: python3 test_cleanup.py   (runs test_accounts.py first, then the cleanup, then the same scope checks)
import subprocess, sys, os, psycopg2, json
H = os.path.dirname(os.path.abspath(__file__)); SQL = os.path.dirname(H)
dsn = 'host=/srv/pgacc port=55432 user=postgres dbname=cast_acc'
r = subprocess.run([sys.executable, H + '/test_accounts.py'], capture_output=True, text=True); print(r.stdout.strip().split('\n')[-1])
db = psycopg2.connect(dsn); db.autocommit = True; c = db.cursor()
c.execute(open(SQL + '/2026-10-18_retail_contract_hours.sql').read())
c.execute(open(SQL + '/2026-10-18_retail_cleanup.sql').read())
c.execute("select count(*) from pg_tables where schemaname='cast_archive'"); print('archived tables', c.fetchone()[0])
c.execute("select count(*) from information_schema.columns where table_schema='public' and column_name in ('work_pct','shift_pref','is_opening','preferred_shift')"); print('dead columns left', c.fetchone()[0])
def as_user(uid, sql):
    c.execute('begin'); c.execute('set local role authenticated'); c.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({'sub': uid}),))
    try: c.execute(sql); out = c.fetchall()
    except Exception as e: out = 'err ' + str(e).split('\n')[0]
    c.execute('rollback'); return out
c.execute("select p.email, p.user_id from retail_profiles p"); U = dict(c.fetchall())
ok = True
for email, exp in [('m1@test.fr', 1), ('dir@test.fr', 3), ('admin@test.fr', 4)]:
    got = as_user(str(U[email]), 'select count(*) from retail_stores')[0][0]; print(email, 'stores', got); ok &= got == exp
print('anon', 'agents', end=' '); c.execute('begin'); c.execute('set local role anon')
try: c.execute('select count(*) from retail_agents'); print('READ'); ok = False
except Exception: print('refused')
c.execute('rollback')
got = as_user(str(U['m1@test.fr']), "update retail_stores set name='x'"); print('manager renames a store:', got); 
sys.exit(0 if ok else 1)
