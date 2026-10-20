# 10.0.0.8: the server writes who changed a planning square and when (local PostgreSQL 16, fictional data).
# Runs test_accounts.py first (it builds the copy with the accounts). Usage: python3 test_override_author.py
import subprocess, sys, os, json, psycopg2
H = os.path.dirname(os.path.abspath(__file__)); SQL = os.path.dirname(H)
dsn = 'host=/srv/pgacc port=55432 user=postgres dbname=cast_acc'
r = subprocess.run([sys.executable, H + '/test_accounts.py'], capture_output=True, text=True)
print('accounts:', r.stdout.strip().split('\n')[-1])
db = psycopg2.connect(dsn); db.autocommit = True; c = db.cursor()
c.execute(open(SQL + '/2026-10-20_retail_override_author.sql').read())
c.execute(open(SQL + '/2026-10-20_retail_override_author.sql').read())   # can be run again
U = {}; c.execute('select email, user_id, full_name from retail_profiles'); rows = c.fetchall(); [U.__setitem__(e.split('@')[0], (str(u), n)) for e, u, n in rows]
A = {}; c.execute('select last_name, id from retail_agents'); [A.__setitem__(n, str(i)) for n, i in c.fetchall()]
fails = []
def check(name, ok, detail=''):
    print('OK  ' if ok else 'FAIL', name, '' if ok else detail); (None if ok else fails.append(name))
def as_user(uid, sql):
    k = db.cursor()
    try:
        k.execute('begin'); k.execute('set local role authenticated')
        k.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({'sub': uid}),))
        k.execute(sql); out = ('ok', k.fetchall() if k.description else k.rowcount); k.execute('commit')
    except Exception as e:
        out = ('err', str(e).split('\n')[0]); k.execute('rollback')
    return out
m1, m1name = U['m1']; adm, admname = U['admin']
ag = as_user(m1, "select id from retail_agents where retail_can_access_agent(id) limit 1")[1][0][0]
out = as_user(m1, f"insert into retail_planning_overrides (agent_id, date, value, changed_by_name) values ('{ag}', '2026-11-12', 'SP 480-1290', 'Someone else') returning changed_by, changed_by_name, changed_at")
check('a manager saves a square: his account, his name and the time are written', out[0] == 'ok' and str(out[1][0][0]) == m1 and out[1][0][1] == m1name and out[1][0][2] is not None, out)
check('the page cannot write another name', out[0] == 'ok' and out[1][0][1] != 'Someone else', out)
t1 = out[1][0][2]
out = as_user(adm, f"insert into retail_planning_overrides (agent_id, date, value) values ('{ag}', '2026-11-12', 'OFF') on conflict (agent_id, date) do update set value = excluded.value returning changed_by, changed_by_name, changed_at")
check('a later change by someone else: the new name and a later time', out[0] == 'ok' and str(out[1][0][0]) == adm and out[1][0][1] == admname and out[1][0][2] >= t1, out)
c.execute("select id, store_id from retail_corners limit 50"); corners = c.fetchall()
cid = as_user(m1, f"select c.id from retail_corners c join retail_agents a on a.store_id = c.store_id where a.id = '{ag}' limit 1")
if cid[0] == 'ok' and cid[1]:
    out = as_user(m1, f"insert into retail_corner_overrides (agent_id, date, corner_id) values ('{ag}', '2026-11-12', '{cid[1][0][0]}') on conflict (agent_id, date) do update set corner_id = excluded.corner_id returning changed_by_name")
    check('a corner changed by hand: the name is written too', out[0] == 'ok' and out[1][0][0] == m1name, out)
else:
    out = as_user(m1, f"insert into retail_corner_overrides (agent_id, date, corner_id) values ('{ag}', '2026-11-12', null) on conflict (agent_id, date) do update set corner_id = excluded.corner_id returning changed_by_name")
    check('a corner changed by hand: the name is written too', out[0] == 'ok' and out[1][0][0] == m1name, out)
out = as_user(m1, "select public.retail_stamp_override()")
check('nobody can call the stamp function directly', out[0] == 'err', out)
out = as_user(None, f"insert into retail_planning_overrides (agent_id, date, value) values ('{ag}', '2026-11-13', 'O')")
check('without an account nothing is written', out[0] == 'err', out)
print(len(fails), 'failures'); sys.exit(1 if fails else 0)
