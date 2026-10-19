# Rights of the validation flow (10.0.0.0) on the isolated local PostgreSQL 16, through the database (Astra's acceptance
# list). Runs test_accounts.py first (it builds the copy with the accounts), then the reviews SQL, then the checks.
# Usage: python3 test_reviews.py   Exit 1 on any failure. All data is fictional.
import subprocess, sys, os, json, psycopg2
H = os.path.dirname(os.path.abspath(__file__)); SQL = os.path.dirname(H)
dsn = 'host=/srv/pgacc port=55432 user=postgres dbname=cast_acc'
r = subprocess.run([sys.executable, H + '/test_accounts.py'], capture_output=True, text=True)
print('accounts:', r.stdout.strip().split('\n')[-1])
db = psycopg2.connect(dsn); db.autocommit = True
c = db.cursor()
c.execute(open(SQL + '/2026-10-19_retail_reviews.sql').read())
c.execute(open(SQL + '/2026-10-19_retail_reviews.sql').read())   # can be run again
c.execute(open(SQL + '/2026-10-19_retail_reviews_cancel.sql').read())   # 10.0.0.1: cancel and history
c.execute(open(SQL + '/2026-10-19_retail_reviews_cancel.sql').read())
c.execute(open(SQL + '/2026-10-19_retail_reviews_decision_check.sql').read())   # 10.0.0.2: decision check, twice
c.execute(open(SQL + '/2026-10-19_retail_reviews_decision_check.sql').read())
def one(sql):
    c.execute(sql); return c.fetchone()[0]
U = {}; c.execute('select email, user_id from retail_profiles'); [U.__setitem__(e.split('@')[0], str(u)) for e, u in c.fetchall()]
S = {}; c.execute('select name, id from retail_stores'); [S.__setitem__(n, str(i)) for n, i in c.fetchall()]
A = {}; c.execute('select last_name, id from retail_agents'); [A.__setitem__(n, str(i)) for n, i in c.fetchall()]
# a director of another region, for the refusals
c.execute("select retail_admin_create_account('dirjp@test.fr', 'x', 'director', 'Dir JP', 'JAPAN', '{}')"); U['dirjp'] = str(c.fetchone()[0])
fails = []; results = []
def check(name, ok, detail=''):
    results.append({'test': name, 'pass': bool(ok), 'detail': str(detail)[:200]}); (None if ok else fails.append(name))
def as_user(uid, sql, keep=False, role='authenticated'):
    """Run sql as a signed-in user. keep=True commits (for steps of the flow)."""
    k = db.cursor()
    try:
        k.execute('begin'); k.execute('set local role ' + role)
        if uid: k.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({'sub': uid}),))
        k.execute(sql); out = ('ok', k.fetchall() if k.description else k.rowcount)
        k.execute('commit' if keep else 'rollback')
    except Exception as e:
        out = ('err', str(e).split('\n')[0]); k.execute('rollback')
    return out
PLAN = json.dumps({'2026-11-02': {A['a1']: {'code': 'O'}}})
def submit(u, store, month='2026-11', keep=True):
    return as_user(U[u], f"select retail_submit_review('{S[store]}', '{month}', '{PLAN}'::jsonb, '{{\"v\":1}}'::jsonb, '{{}}'::jsonb)", keep)
def rid(store, rev, month='2026-11'): return one(f"select id from retail_plan_reviews where store_id='{S[store]}' and month='{month}' and revision={rev}")
ov = lambda u, d: as_user(U[u], f"insert into retail_planning_overrides(agent_id, date, value) values ('{A['a1']}', '{d}', 'OFF') on conflict (agent_id, date) do update set value = 'C'")

# anon and direct writes
check('anon cannot read reviews', as_user(None, 'select * from retail_plan_reviews', role='anon')[0] == 'err')
check('anon cannot send', as_user(None, f"select retail_submit_review('{S['Store One']}', '2026-11', '{{}}'::jsonb)", role='anon')[0] == 'err')
check('nobody inserts a review directly', as_user(U['admin'], f"insert into retail_plan_reviews(store_id, month, revision, status, submitted_plan) values ('{S['Store One']}', '2026-11', 9, 'validated', '{{}}')")[0] == 'err')
# send
check('director cannot send', submit('dir', 'Store One', keep=False)[0] == 'err')
check('manager cannot send for a store not his', submit('m1', 'Store Two', keep=False)[0] == 'err')
check('inactive account cannot send', submit('off', 'Store One', keep=False)[0] == 'err')
check('manager edits his month before sending', ov('m1', '2026-11-03')[0] == 'ok')
s1 = submit('m1', 'Store One')
check('manager sends his store', s1[0] == 'ok' and s1[1][0][0]['revision'] == 1, s1)
check('author and name come from the server', one(f"select submitted_by::text = '{U['m1']}' and submitted_by_name = 'Test' from retail_plan_reviews where id = '{rid('Store One', 1)}'"))
check('a second sending while one is pending is refused', submit('m12', 'Store One', keep=False)[0] == 'err')
check('manager cannot change status directly', as_user(U['m1'], f"update retail_plan_reviews set status = 'validated' where id = '{rid('Store One', 1)}'")[0] == 'err')
# the month lock
check('pending: manager cannot change a square of that month', ov('m1', '2026-11-03')[0] == 'err')
check('pending: nor a leave crossing that month', as_user(U['m1'], f"insert into retail_agent_leave(agent_id, store_id, start_date, end_date, type) values ('{A['a1']}', '{S['Store One']}', '2026-10-30', '2026-11-02', 'absence')")[0] == 'err')
check('pending: nor an intraday mission', as_user(U['m1'], f"insert into retail_intraday_missions(store_id, date, agent_id, mission_type, start_min) values ('{S['Store One']}', '2026-11-05', '{A['a1']}', 'wel', 600)")[0] == 'err')
check('pending: nor the saved planning of the month', as_user(U['m1'], f"insert into retail_planning_snapshot(store_id, month, plan) values ('{S['Store One']}', '2026-11-01', '{{}}')")[0] == 'err')
check('pending: nor a planning event', as_user(U['m1'], f"insert into retail_planning_events(store_id, category, start_date, end_date) values ('{S['Store One']}', 'local', '2026-11-10', '2026-11-10')")[0] == 'err')
check('pending: nor delete a square of that month', as_user(U['m1'], f"delete from retail_planning_overrides where agent_id = '{A['a1']}' and date = '2026-11-03'") == ('ok', 0))
check('pending: the manager still changes another month', ov('m1', '2026-12-03')[0] == 'ok')
check('pending: the manager still reads the month', as_user(U['m1'], f"select count(*) from retail_planning_overrides where agent_id = '{A['a1']}'")[0] == 'ok')
check('pending: the director can correct a square', ov('dir', '2026-11-04')[0] == 'ok')
check('pending: the admin can correct a square', ov('admin', '2026-11-05')[0] == 'ok')
# decide
r1 = rid('Store One', 1)
dec = lambda u, rev, d='validated', keep=True: as_user(U[u], f"select retail_decide_review('{r1}', {rev}, '{d}', '{PLAN}'::jsonb, 'Looks good')", keep)
check('manager cannot validate', dec('m1', 1, keep=False)[0] == 'err')
check('director of another region cannot validate', dec('dirjp', 1, keep=False)[0] == 'err')
check('wrong revision: changed meanwhile, nothing written', dec('dir', 7, keep=False)[0] == 'err' and one(f"select status from retail_plan_reviews where id = '{r1}'") == 'pending')
d1 = dec('dir', 1, 'returned')
check('director returns with a comment', d1[0] == 'ok' and one(f"select status || '|' || comment || '|' || decided_by::text from retail_plan_reviews where id = '{r1}'") == f"returned|Looks good|{U['dir']}", d1)
check('a second decision on the same sending: conflict', dec('admin', 1, keep=False)[0] == 'err')
check('returned: the manager edits again', ov('m1', '2026-11-03')[0] == 'ok')
# withdraw and send again
s2 = submit('m1', 'Store One')
check('second sending: revision 2, revision 1 and its comment kept', s2[0] == 'ok' and s2[1][0][0]['revision'] == 2 and one(f"select comment from retail_plan_reviews where id = '{r1}'") == 'Looks good', s2)
r2 = rid('Store One', 2)
check('another manager of the same store may withdraw too', as_user(U['m12'], f"select retail_withdraw_review('{r2}', 2)", False)[0] == 'ok')   # m12 also manages Store One
check('a manager of another store cannot withdraw', as_user(U['dirjp'], f"select retail_withdraw_review('{r2}', 2)", False)[0] == 'err')
check('withdraw with the wrong revision: refused', as_user(U['m1'], f"select retail_withdraw_review('{r2}', 1)", False)[0] == 'err')
w = as_user(U['m1'], f"select retail_withdraw_review('{r2}', 2)", True)
check('manager withdraws, the month is free again', w[0] == 'ok' and ov('m1', '2026-11-06')[0] == 'ok', w)
check('a withdrawn sending cannot be validated', as_user(U['dir'], f"select retail_decide_review('{r2}', 2, 'validated', null, '')")[0] == 'err')
# admin alone: sends, sees it, validates his own sending
sa = submit('admin', 'Store Four')
ra = rid('Store Four', 1)
check('admin sends for any store', sa[0] == 'ok', sa)
check('admin sees his own sending in the pending list', as_user(U['admin'], f"select count(*) from retail_plan_reviews where status = 'pending' and submitted_by = '{U['admin']}'")[1][0][0] == 1)
va = as_user(U['admin'], f"select retail_decide_review('{ra}', 1, 'validated', '{PLAN}'::jsonb, '')", True)
check('admin validates his own sending, with his own name', va[0] == 'ok' and one(f"select decided_by::text from retail_plan_reviews where id = '{ra}'") == U['admin'], va)
check('director of EMEA does not see the Japan sending', as_user(U['dir'], f"select count(*) from retail_plan_reviews where id = '{ra}'")[1][0][0] == 0)
check('manager sees only his stores', as_user(U['m1'], 'select count(*) from retail_plan_reviews')[1][0][0] == 2)
# seen, for each person
check('manager marks a decision as seen', as_user(U['m1'], f"insert into retail_review_seen(review_id) values ('{r1}')", True)[0] == 'ok')
check('seen is per person (the other manager still has it new)', as_user(U['m12'], f"select count(*) from retail_review_seen where review_id = '{r1}'")[1][0][0] == 0)
check('nobody marks for someone else', as_user(U['m1'], f"insert into retail_review_seen(review_id, user_id) values ('{r1}', '{U['m12']}')")[0] == 'err')
check('nobody marks a review he cannot see', as_user(U['m1'], f"insert into retail_review_seen(review_id) values ('{ra}')")[0] == 'err')
# validate is never refused for the rules
s3 = submit('m1', 'Store One')
r3 = rid('Store One', 3)
v3 = as_user(U['dir'], f"select retail_decide_review('{r3}', 3, 'validated', null, '')", True)
check('validate is accepted, the sent copy becomes the reviewed one when none is given', v3[0] == 'ok' and one(f"select reviewed_plan = submitted_plan from retail_plan_reviews where id = '{r3}'"), v3)
check('after validation the manager keeps the hand', ov('m1', '2026-11-07')[0] == 'ok')
# two decisions at the same time, from two connections: one wins, the other gets "changed meanwhile"
import threading, time
s4 = submit('m1', 'Store One'); r4 = rid('Store One', 4)
def conn(uid):
    k = psycopg2.connect(dsn); k.autocommit = False; q = k.cursor(); q.execute('set role authenticated')
    q.execute("select set_config('request.jwt.claims', %s, false)", (json.dumps({'sub': uid}),)); return k, q
ka, qa = conn(U['dir']); kb, qb = conn(U['admin'])
qa.execute(f"select retail_decide_review('{r4}', 4, 'validated', null, 'first')")
out = {}
def second():
    try: qb.execute(f"select retail_decide_review('{r4}', 4, 'returned', null, 'second')"); kb.commit(); out['b'] = 'ok'
    except Exception as e: kb.rollback(); out['b'] = 'err ' + str(e).split(chr(10))[0]
th = threading.Thread(target=second); th.start(); time.sleep(0.8)
waited = th.is_alive(); ka.commit(); th.join(5)
check('two decisions at once: the second waits, then gets a conflict, the first stays', waited and out.get('b', '').startswith('err') and 'changed meanwhile' in out['b']
      and one(f"select status || comment from retail_plan_reviews where id = '{r4}'") == 'validatedfirst', out)
ka.close(); kb.close()
check('one decision function only, with the check argument', one("select count(*) from pg_proc where proname = 'retail_decide_review'") == 1)
# cancel (10.0.0.1): the director takes back a validation or a sending sent too fast
canc = lambda u, r, rev, keep=True: as_user(U[u], f"select retail_cancel_review('{r}', {rev}, 'Clicked too fast')", keep)
check('history: each step is kept with its author', one(f"select string_agg(e->>'status' || ':' || (e->>'by'), ',' order by ord) from retail_plan_reviews, jsonb_array_elements(history) with ordinality t(e, ord) where id = '{r4}'") == f"pending:{U['m1']},validated:{U['dir']}")
check('manager cannot cancel', canc('m1', r4, 4, False)[0] == 'err')
check('director of another region cannot cancel', canc('dirjp', r4, 4, False)[0] == 'err')
check('cancel with the wrong revision: refused', canc('dir', r4, 3, False)[0] == 'err')
check('an older sending cannot be cancelled', canc('dir', r3, 3, False)[0] == 'err')
as_user(U['m1'], f"insert into retail_review_seen(review_id) values ('{r4}')", True)
c4 = canc('dir', r4, 4)
check('director cancels a validation: cancelled, reason and author kept, validation kept in the history',
      c4[0] == 'ok' and one(f"select status || '|' || comment || '|' || decided_by::text || '|' || jsonb_array_length(history) || '|' || (history->1->>'comment') from retail_plan_reviews where id = '{r4}'") == f"cancelled|Clicked too fast|{U['dir']}|3|first", c4)
check('cancel: the store sees it as new again', one(f"select count(*) from retail_review_seen where review_id = '{r4}'") == 0)
check('a cancelled sending cannot be validated or cancelled again', as_user(U['dir'], f"select retail_decide_review('{r4}', 4, 'validated', null, '')")[0] == 'err' and canc('dir', r4, 4, False)[0] == 'err')
check('cancelled: the manager changes the month and sends again (revision 5)', ov('m1', '2026-11-08')[0] == 'ok' and submit('m1', 'Store One')[0] == 'ok' and rid('Store One', 5))
r5 = rid('Store One', 5)
check('pending: the manager is locked again', ov('m1', '2026-11-09')[0] == 'err')
d5 = as_user(U['dir'], f"select retail_decide_review('{r5}', 5, 'returned', null, 'redo', '{{\"status\":\"ok\",\"mandatory\":0}}'::jsonb)", False)
check('the decision keeps the check of the reviewed copy (a record, not a veto)', d5[0] == 'ok', d5)
c5 = canc('admin', r5, 5)
check('admin cancels a sending sent too fast, the month is free again', c5[0] == 'ok' and ov('m1', '2026-11-09')[0] == 'ok', c5)
json.dump(results, open(H + '/results_reviews.json', 'w'), indent=1)
print(len(results), 'checks,', len(fails), 'failures'); [print('FAIL', f, [r['detail'] for r in results if r['test'] == f]) for f in fails]
sys.exit(1 if fails else 0)
