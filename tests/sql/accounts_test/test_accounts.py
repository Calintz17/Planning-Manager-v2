# Account rights test on an isolated local PostgreSQL 16 (Astra: test the refusals through the database, not the menus).
# Usage: python3 test_accounts.py "host=/srv/pgacc port=55432 user=postgres"   (needs psycopg2). Exit 1 on any failure.
import sys, json, psycopg2, os
H = os.path.dirname(os.path.abspath(__file__)); SQL = os.path.dirname(H)
dsn = sys.argv[1] if len(sys.argv) > 1 else 'host=/srv/pgacc port=55432 user=postgres'
admin = psycopg2.connect(dsn + ' dbname=postgres'); admin.autocommit = True
admin.cursor().execute('drop database if exists cast_acc'); admin.cursor().execute('create database cast_acc')
db = psycopg2.connect(dsn + ' dbname=cast_acc'); db.autocommit = True
def run(sql): db.cursor().execute(sql)
run(open(H + '/mock_supabase.sql').read())

# Fixture: 2 regions, 3 countries, 4 stores, 3 agents, 2 corners (all fictional)
ids = {}
def one(sql):
    c = db.cursor(); c.execute(sql); return c.fetchone()[0]
for k, n in [('emea', 'EMEA'), ('japan', 'JAPAN')]:
    ids[k] = one(f"insert into retail_regions(name, city, timezone) values ('{n}', 'x', 'UTC') returning id")
for k, r, n in [('fr', 'emea', 'France'), ('uk', 'emea', 'United Kingdom'), ('jp', 'japan', 'Japan')]:
    ids[k] = one(f"insert into retail_countries(region_id, name, iso_code) values ('{ids[r]}', '{n}', '{k}') returning id")
for k, c, n in [('s1', 'fr', 'Store One'), ('s2', 'fr', 'Store Two'), ('s3', 'uk', 'Store Three'), ('s4', 'jp', 'Store Four')]:
    ids[k] = one(f"insert into retail_stores(country_id, name) values ('{ids[c]}', '{n}') returning id")
for k, s in [('c1', 's1'), ('c2', 's2')]:
    ids[k] = one(f"insert into retail_corners(store_id, code, full_name) values ('{ids[s]}', '{k}', '{k}') returning id")
for k, s in [('a1', 's1'), ('a2', 's2'), ('a3', 's3'), ('a4', 's4')]:
    ids[k] = one(f"insert into retail_agents(first_name, last_name, store_id) values ('Agent', '{k}', '{ids[s]}') returning id")

fails = []; results = []
def check(name, ok, detail=''):
    results.append({'test': name, 'pass': bool(ok), 'detail': str(detail)[:160]})
    if not ok: fails.append(name)
def as_user(uid, sql, role='authenticated'):
    """Run sql as a signed-in user (or anon), always rolled back. Returns ('ok', rows) or ('err', message)."""
    c = db.cursor()
    try:
        c.execute('begin'); c.execute(f'set local role {role}')
        if uid: c.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({'sub': uid, 'role': role}),))
        c.execute(sql)
        out = ('ok', c.fetchall() if c.description else c.rowcount)
    except Exception as e:
        out = ('err', str(e).split('\n')[0])
    c.execute('rollback'); return out
def count(uid, table, role='authenticated'):
    r = as_user(uid, f'select count(*) from {table}', role); return r[1][0][0] if r[0] == 'ok' else r

# Phase 1: part 1 only. The live page (anon) still works, profiles are closed.
run(open(SQL + '/2026-10-18_retail_accounts_part1.sql').read())
run(open(SQL + '/2026-10-18_retail_accounts_part1.sql').read())  # can be replayed
check('part1: anon still reads agents (live page unchanged)', count(None, 'retail_agents', 'anon') == 4)
check('part1: anon cannot read profiles', as_user(None, 'select * from retail_profiles', 'anon')[0] == 'err')
check('part1: anon cannot create an account', as_user(None, "select retail_admin_create_account('x@x.fr','x','admin')", 'anon')[0] == 'err')
def mk(email, role, region=None, stores=()):
    reg = f"'{region}'" if region else 'null'
    st = "array[" + ",".join(f"'{s}'" for s in stores) + "]::text[]" if stores else "'{}'::text[]"
    return one(f"select retail_admin_create_account('{email}', 'admin', '{role}', 'Test', {reg}, {st})")
U = {
  'admin': mk('admin@test.fr', 'admin'),
  'dir': mk('dir@test.fr', 'director', 'EMEA'),
  'm1': mk('m1@test.fr', 'manager', None, ['Store One']),
  'm12': mk('m12@test.fr', 'manager', None, ['Store One', 'Store Two']),
  'off': mk('off@test.fr', 'manager', None, ['Store One']),
}
run(f"update retail_profiles set active = false where user_id = '{U['off']}'")
U['none'] = one("insert into auth.users(id, email) values (gen_random_uuid(), 'none@test.fr') returning id")
check('create: password hash checks out', one(f"select encrypted_password = extensions.crypt('admin', encrypted_password) from auth.users where id = '{U['admin']}'"))
check('create: identity row', one(f"select count(*) from auth.identities where user_id = '{U['admin']}'") == 1)
check('create: duplicate refused', as_user(None, "select retail_admin_create_account('admin@test.fr','x','admin')", 'postgres')[0] == 'err')
check('create: unknown store refused', as_user(None, "select retail_admin_create_account('z@test.fr','x','manager','',null,array['Nope'])", 'postgres')[0] == 'err')
check('create: director without region refused', as_user(None, "select retail_admin_create_account('y@test.fr','x','director')", 'postgres')[0] == 'err')
check('create: signed-in user cannot call it', as_user(U['admin'], "select retail_admin_create_account('w@test.fr','x','admin')")[0] == 'err')
check('profile: reads own row only', as_user(U['m1'], 'select email from retail_profiles') == ('ok', [('m1@test.fr',)]))
check('profile: admin reads all', count(U['admin'], 'retail_profiles') == 5)
check('profile: cannot promote self', as_user(U['m1'], f"update retail_profiles set role = 'admin' where user_id = '{U['m1']}'")[0] == 'err')
check('profile: cannot add a store to self', as_user(U['m1'], f"insert into retail_profile_stores values ('{U['m1']}', '{ids['s4']}')")[0] == 'err')

# Phase 2: the switch
run(open(SQL + '/2026-10-18_retail_accounts_part2.sql').read())
check('switch: anon reads nothing', as_user(None, 'select * from retail_agents', 'anon')[0] == 'err')
check('switch: anon cannot write', as_user(None, f"insert into retail_highlights(store_id, start_date, end_date, text) values ('{ids['s1']}', now(), now(), 'x')", 'anon')[0] == 'err')
check('switch: anon cannot list stores', as_user(None, 'select * from retail_stores', 'anon')[0] == 'err')
exp = {'admin': (2, 3, 4, 4), 'dir': (1, 2, 3, 3), 'm1': (1, 1, 1, 1), 'm12': (1, 1, 2, 2), 'off': (0, 0, 0, 0), 'none': (0, 0, 0, 0)}
for u, (r, c, s, a) in exp.items():
    got = (count(U[u], 'retail_regions'), count(U[u], 'retail_countries'), count(U[u], 'retail_stores'), count(U[u], 'retail_agents'))
    check(f'read scope {u}: regions, countries, stores, agents = {(r, c, s, a)}', got == (r, c, s, a), got)
def w(u, sql): return as_user(U[u], sql)[0]
ins_h = lambda s: f"insert into retail_highlights(store_id, start_date, end_date, text) values ('{ids[s]}', now(), now(), 'x')"
check('m1 writes own store', w('m1', ins_h('s1')) == 'ok')
check('m1 cannot write store two', w('m1', ins_h('s2')) == 'err')
check('m1 cannot move an agent to store two', as_user(U['m1'], f"update retail_agents set store_id = '{ids['s2']}' where id = '{ids['a1']}'")[0] == 'err')
check('m1 cannot touch agent of store two (0 rows)', as_user(U['m1'], f"update retail_agents set last_name = 'x' where id = '{ids['a2']}'") == ('ok', 0))
check('m1 cannot give a corner of store two', w('m1', f"update retail_agents set home_corner_id = '{ids['c2']}' where id = '{ids['a1']}'") == 'err')
check('m1 planning square own agent', w('m1', f"insert into retail_planning_overrides(agent_id, date, value, corner_id) values ('{ids['a1']}', now(), 'O', '{ids['c1']}')") == 'ok')
check('m1 planning square with corner of store two refused', w('m1', f"insert into retail_planning_overrides(agent_id, date, value, corner_id) values ('{ids['a1']}', now(), 'O', '{ids['c2']}')") == 'err')
check('m1 planning square agent of store two refused', w('m1', f"insert into retail_planning_overrides(agent_id, date, value) values ('{ids['a2']}', now(), 'O')") == 'err')
check('m1 leave: agent of store two under store one refused', w('m1', f"insert into retail_agent_leave(agent_id, store_id, start_date, end_date, type) values ('{ids['a2']}', '{ids['s1']}', now(), now(), 'absence')") == 'err')
check('m1 leave own agent', w('m1', f"insert into retail_agent_leave(agent_id, store_id, start_date, end_date, type) values ('{ids['a1']}', '{ids['s1']}', now(), now(), 'absence')") == 'ok')
check('m12 writes store two', w('m12', ins_h('s2')) == 'ok')
check('director writes store three (UK, EMEA)', w('dir', ins_h('s3')) == 'ok')
check('director cannot write store four (Japan)', w('dir', ins_h('s4')) == 'err')
check('director cannot rename a store', as_user(U['dir'], f"update retail_stores set name = 'x' where id = '{ids['s1']}'") == ('ok', 0))
check('admin writes store four', w('admin', ins_h('s4')) == 'ok')
check('admin renames a store', as_user(U['admin'], f"update retail_stores set name = 'Store 1' where id = '{ids['s1']}'") == ('ok', 1))
check('inactive account writes nothing', w('off', ins_h('s1')) == 'err')
check('account without profile writes nothing', w('none', ins_h('s1')) == 'err')
ed = lambda a, s: f"insert into retail_planning_edits(store_id, agent_id, date, field) values ('{ids[s]}', '{ids[a]}', now(), 'value')"
check('edit log: insert own store', w('m1', ed('a1', 's1')) == 'ok')
c = db.cursor(); c.execute('begin'); c.execute('set local role authenticated')
c.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({'sub': U['m1']}),))
c.execute(ed('a1', 's1')); c.execute('reset role'); c.execute('select actor_id::text from retail_planning_edits order by changed_at desc limit 1')
check('edit log: signed by the server', c.fetchone()[0] == U['m1']); c.execute('rollback')
check('edit log: cannot read', as_user(U['m1'], 'select * from retail_planning_edits')[0] == 'err')
check('edit log: cannot sign as someone else', w('m1', f"insert into retail_planning_edits(store_id, agent_id, date, field, actor_id) values ('{ids['s1']}', '{ids['a1']}', now(), 'value', '{U['admin']}')") == 'err')
check('edit log: other store refused', w('m1', ed('a2', 's2')) == 'err')
check('unused region tables: manager refused', count(U['m1'], 'retail_tasks') == 0 and w('m1', f"insert into retail_tasks(region_id, name) values ('{ids['emea']}', 'x')") == 'err')
check('old functions closed', as_user(U['m1'], "select seed_defaults_for_current_user('x')")[0] == 'err')
check('no truncate', as_user(U['admin'], 'truncate retail_highlights')[0] == 'err')
run(open(SQL + '/2026-10-18_retail_accounts_part2.sql').read())
check('switch can be replayed, same scope after', count(U['m1'], 'retail_stores') == 1 and as_user(None, 'select * from retail_agents', 'anon')[0] == 'err')

json.dump(results, open(H + '/results.json', 'w'), indent=1)
print(len(results), 'checks,', len(fails), 'failures'); [print('FAIL', f) for f in fails]
sys.exit(1 if fails else 0)
