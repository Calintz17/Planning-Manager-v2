# Sign-in and menus by role, 9.5.0.0 (9.5.0.2: the stub filters regions, countries and stores like the base; 9.5.0.3: flat store list for managers, load error retry) (fictional accounts and stores, Supabase replaced by stub_supabase_auth.js).
# Usage: python3 probe_accounts.py [build.html]. Writes screens/accounts-results.json and screenshots. Exit 1 on failure.
import sys, os, json, shutil, tempfile, http.server, threading, functools
from playwright.sync_api import sync_playwright
B = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(B + '/../../..')
build = sys.argv[1] if len(sys.argv) > 1 else R + '/tests/builds/CAST_RETAIL_TEST.html'
OUT = B + '/screens'; os.makedirs(OUT, exist_ok=True)
U = tempfile.mkdtemp(); shutil.copy(build, U + '/index.html'); shutil.copytree(R + '/logo', U + '/logo')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=U)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
stub = open(B + '/stub_supabase_auth.js').read()

def uid(n): return '00000000-0000-0000-0000-00000000000' + str(n)
DB = {
  'retail_regions': [{'id': 'r1', 'name': 'EMEA', 'city': 'Paris'}, {'id': 'r2', 'name': 'JAPAN', 'city': 'Tokyo'}],
  'retail_countries': [{'id': 'fr', 'region_id': 'r1', 'name': 'France', 'iso_code': 'FR'}, {'id': 'uk', 'region_id': 'r1', 'name': 'United Kingdom', 'iso_code': 'GB'},
                       {'id': 'jp', 'region_id': 'r2', 'name': 'Japan', 'iso_code': 'JP'}],
  'retail_stores': [{'id': 's1', 'country_id': 'fr', 'name': 'Store One'}, {'id': 's2', 'country_id': 'fr', 'name': 'Store Two'},
                    {'id': 's3', 'country_id': 'uk', 'name': 'Store Three'}, {'id': 's4', 'country_id': 'jp', 'name': 'Store Four'}],
  'retail_profiles': [], 'retail_profile_stores': []}
ACC = {}
def acct(n, email, role, region=None, stores=(), active=True, pw_changed=False):
    u = {'id': uid(n), 'email': email, 'user_metadata': {'pw_changed': True} if pw_changed else {}}
    if role: DB['retail_profiles'].append({'user_id': u['id'], 'email': email, 'full_name': email.split('@')[0].replace('.', ' ').title(), 'role': role, 'region_id': region, 'active': active})
    for s in stores: DB['retail_profile_stores'].append({'user_id': u['id'], 'store_id': s})
    ACC[email] = u
acct(1, 'manager.one@test.fr', 'manager', stores=['s1'])
acct(2, 'manager.two@test.fr', 'manager', stores=['s1', 's2'], pw_changed=True)
acct(3, 'manager.wide@test.fr', 'manager', stores=['s1', 's3'])
acct(4, 'director.emea@test.fr', 'director', region='r1')
acct(5, 'admin.cast@test.fr', 'admin', pw_changed=True)
acct(6, 'inactive@test.fr', 'manager', stores=['s1'], active=False)
acct(7, 'noprofile@test.fr', None)
acct(8, 'nostore@test.fr', 'manager')
accounts = [{'email': e, 'password': 'admin', 'user': u} for e, u in ACC.items()]

res = []; fails = []
def check(name, ok, got=''):
    res.append({'test': name, 'pass': bool(ok), 'got': got}); (None if ok else fails.append(name))
STATE = """(() => { const vis = id => { const e = document.getElementById(id); return !!e && !e.hidden && e.offsetParent !== null; };
  const opts = id => [...document.getElementById(id).options].map(o => o.textContent).filter(t => t.indexOf('-') !== 0);
  return { login: document.getElementById('login-gate').classList.contains('show'), gate: document.getElementById('store-gate').classList.contains('show'),
    err: document.getElementById('login-err').textContent, store: typeof currentStoreName === 'string' ? currentStoreName : null,
    region: vis('region-field'),
    country: vis('country-field'), storeField: vis('store-field'), fixedStore: vis('fixed-store') ? document.getElementById('fixed-store-val').textContent : null,
    regions: opts('region-select'), countries: opts('country-select'), stores: opts('store-select'),
    initials: document.getElementById('acct-initials').textContent, dot: document.getElementById('acct-btn').classList.contains('needs-pw'),
    gateSub: document.querySelector('#store-gate .gate-sub').textContent, log: window.__authLog }; })()"""
with sync_playwright() as p:
    b = p.chromium.launch()
    def page(session_email=None, w=1440, dark=False):
        ctx = b.new_context(viewport={'width': w, 'height': 900})
        cfg = {'db': DB, 'accounts': accounts, 'sessionUser': ACC.get(session_email)}
        ctx.add_init_script('window.__AUTH = ' + json.dumps(cfg) + ';' + ("try{localStorage.setItem('cast_theme','dark')}catch(e){}" if dark else ''))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        def route(r):
            u = r.request.url
            if 'supabase-js' in u: return r.fulfill(body=stub, content_type='application/javascript')
            if '127.0.0.1' not in u: return r.abort()
            return r.continue_()
        pg.route('**/*', route); pg.goto('http://127.0.0.1:%d/index.html' % port); pg.wait_for_timeout(900)
        return ctx, pg, errs
    st = lambda pg: pg.evaluate(STATE)
    # 1. No session: sign in screen; wrong password; right password lands on the single store
    ctx, pg, errs = page()
    s = st(pg); check('no session shows sign in', s['login'] and not s['gate'], s)
    pg.screenshot(path=OUT + '/login-light-1440.png')
    pg.fill('#login-email', 'manager.one@test.fr'); pg.fill('#login-pw', 'wrong'); pg.click('#login-btn'); pg.wait_for_timeout(300)
    s = st(pg); check('wrong password: message, stays on sign in', s['login'] and s['err'] == 'Wrong email or password.', s['err'])
    pg.fill('#login-pw', 'admin'); pg.click('#login-btn'); pg.wait_for_timeout(900)
    s = st(pg)
    check('manager 1 store: straight to Store One, no menus', not s['login'] and not s['gate'] and s['store'] == 'Store One'
          and not s['region'] and not s['country'] and not s['storeField'] and s['fixedStore'] == 'Store One', s)
    check('manager 1 store: initials and default password dot', s['initials'] == 'MO' and s['dot'], s['initials'])
    pg.click('#acct-btn'); pg.wait_for_timeout(200); pg.screenshot(path=OUT + '/manager-menu-light-1440.png')
    check('account menu shows email, role, warning', pg.evaluate("[document.getElementById('acct-email').textContent, document.getElementById('acct-role').textContent, !document.getElementById('acct-warn').hidden]") == ['manager.one@test.fr', 'Manager', True])
    # Password change
    pg.click('text=Change password'); pg.wait_for_timeout(200)
    pg.fill('#pw-cur', 'admin'); pg.fill('#pw-new', 'abc'); pg.fill('#pw-new2', 'abc'); pg.click('#pw-save'); pg.wait_for_timeout(200)
    check('password: too short refused', pg.text_content('#pw-err') == 'At least 6 characters.', pg.text_content('#pw-err'))
    pg.fill('#pw-new', 'newpass1'); pg.fill('#pw-new2', 'newpass2'); pg.click('#pw-save'); pg.wait_for_timeout(200)
    check('password: mismatch refused', pg.text_content('#pw-err') == 'The two new passwords are different.')
    pg.fill('#pw-cur', 'bad'); pg.fill('#pw-new2', 'newpass1'); pg.click('#pw-save'); pg.wait_for_timeout(300)
    check('password: wrong current refused', pg.text_content('#pw-err') == 'The current password is wrong.')
    pg.screenshot(path=OUT + '/password-light-1440.png')
    pg.fill('#pw-cur', 'admin'); pg.click('#pw-save'); pg.wait_for_timeout(400)
    s = st(pg); upd = [l for l in s['log'] if l[0] == 'updateUser']
    check('password: saved with pw_changed, dot gone, editor closed', upd and upd[-1][1] == {'password': 'newpass1', 'data': {'pw_changed': True}}
          and not s['dot'] and not pg.evaluate("document.getElementById('pw-editor').classList.contains('open')"), upd)
    # Sign out goes back to sign in after reload
    pg.click('#acct-btn'); pg.click('text=Sign out'); pg.wait_for_timeout(1200)
    s = st(pg); check('sign out: back to sign in', s['login'] and not s['store'], s['login'])
    check('no JavaScript error (flow 1)', not errs, errs[:2]); ctx.close()
    # 2. Manager with 2 stores in one country: only the Store menu, limited to his stores
    ctx, pg, errs = page('manager.two@test.fr'); s = st(pg)
    check('manager 2 stores: gate with Store only', s['gate'] and not s['region'] and not s['country'] and s['storeField'] and s['stores'] == ['Store One', 'Store Two'] and not s['dot'], s)
    check('manager 2 stores: gate text', s['gateSub'] == 'Choose your store.', s['gateSub'])
    pg.screenshot(path=OUT + '/manager-two-gate-light-1440.png')
    pg.select_option('#store-select', label='Store Two'); pg.wait_for_timeout(600); s = st(pg)
    check('manager 2 stores: picks Store Two', not s['gate'] and s['store'] == 'Store Two' and s['storeField'])
    pg.reload(); pg.wait_for_timeout(900); s = st(pg)
    check('manager 2 stores: remembers Store Two after reload', not s['gate'] and s['store'] == 'Store Two', s['store']); ctx.close()
    # 3. Manager with stores in 2 countries: one flat list of his stores, no region or country menu (9.5.0.3)
    ctx, pg, errs = page('manager.wide@test.fr'); s = st(pg)
    check('manager 2 countries: flat store list, no region or country menu', s['gate'] and not s['region'] and not s['country'] and s['storeField'] and s['stores'] == ['Store One', 'Store Three'], s)
    pg.screenshot(path=OUT + '/manager-wide-gate-light-1440.png')
    pg.select_option('#store-select', label='Store Three'); pg.wait_for_timeout(600)
    sc = pg.evaluate("[currentStoreName, currentCountryIso, currentRegionName, currentRegionCity]")
    check('manager 2 countries: Store Three sets its country and region', sc == ['Store Three', 'GB', 'EMEA', 'Paris'], sc)
    pg.select_option('#store-select', label='Store One'); pg.wait_for_timeout(600)
    sc = pg.evaluate("[currentStoreName, currentCountryIso, currentRegionName]")
    check('manager 2 countries: Store One sets France', sc == ['Store One', 'FR', 'EMEA'], sc)
    pg.reload(); pg.wait_for_timeout(900); s = st(pg)
    check('manager 2 countries: remembers Store One after reload', not s['gate'] and s['store'] == 'Store One' and pg.evaluate('currentCountryIso') == 'FR', s['store'])
    check('no JavaScript error (flow 3)', not errs, errs[:2]); ctx.close()
    # 3b. The places cannot be loaded: signed out with a message, signing in again works (Astra 9.5.0.1)
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script('window.__AUTH = ' + json.dumps({'db': DB, 'accounts': accounts, 'sessionUser': ACC['manager.one@test.fr'], 'failOnce': {'retail_regions': 1}}) + ';')
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/*', lambda r: r.fulfill(body=stub, content_type='application/javascript') if 'supabase-js' in r.request.url else (r.continue_() if '127.0.0.1' in r.request.url else r.abort()))
    pg.goto('http://127.0.0.1:%d/index.html' % port); pg.wait_for_timeout(900); s = st(pg)
    check('load error: back to sign in with a message', s['login'] and s['err'] == 'Could not load your account. Try again.', s['err'])
    pg.fill('#login-email', 'manager.one@test.fr'); pg.fill('#login-pw', 'admin'); pg.click('#login-btn'); pg.wait_for_timeout(900); s = st(pg)
    check('load error: signing in again opens the store', not s['login'] and s['store'] == 'Store One' and not pg.evaluate("document.getElementById('login-btn').disabled"), s['store'])
    check('no JavaScript error (flow 3b)', not errs, errs[:2]); ctx.close()
    # 3c. Same when the read throws instead of answering an error (Astra 9.5.0.3 audit, B)
    for tbl in ('retail_regions', 'retail_stores', 'retail_profiles'):
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        ctx.add_init_script('window.__AUTH = ' + json.dumps({'db': DB, 'accounts': accounts, 'sessionUser': ACC['manager.one@test.fr'], 'rejectOnce': {tbl: 1}}) + ';')
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('**/*', lambda r: r.fulfill(body=stub, content_type='application/javascript') if 'supabase-js' in r.request.url else (r.continue_() if '127.0.0.1' in r.request.url else r.abort()))
        pg.goto('http://127.0.0.1:%d/index.html' % port); pg.wait_for_timeout(900); s = st(pg)
        check('network down on ' + tbl + ': sign in with a message, loader hidden', s['login'] and s['err'] == 'Could not load your account. Try again.' and not pg.evaluate("document.getElementById('loader').classList.contains('active')"), s['err'])
        pg.fill('#login-email', 'manager.one@test.fr'); pg.fill('#login-pw', 'admin'); pg.click('#login-btn'); pg.wait_for_timeout(900); s = st(pg)
        check('network down on ' + tbl + ': signing in again opens the store', not s['login'] and s['store'] == 'Store One', s['store'])
        check('no JavaScript error (network down on ' + tbl + ')', not errs, errs[:2]); ctx.close()
    # 4. Director: region fixed, country and store limited to his region
    ctx, pg, errs = page('director.emea@test.fr'); s = st(pg)
    check('director: no region menu (single region), countries of EMEA only', s['gate'] and not s['region'] and s['country'] and s['countries'] == ['France', 'United Kingdom'], s)
    check('director: gate text', s['gateSub'] == 'Choose your store.', s['gateSub'])
    pg.screenshot(path=OUT + '/director-gate-light-1440.png')
    pg.select_option('#country-select', label='United Kingdom'); pg.wait_for_timeout(600); s = st(pg)
    check('director: UK has one store, opens it', not s['gate'] and s['store'] == 'Store Three', s['store']); ctx.close()
    # 5. Admin: as today, all regions
    ctx, pg, errs = page('admin.cast@test.fr'); s = st(pg)
    check('admin: three menus, all regions', s['gate'] and s['region'] and s['regions'] == ['EMEA', 'JAPAN'], s); ctx.close()
    # 6. Refused accounts
    for e, msg in [('inactive@test.fr', 'Your account is not active. Contact your administrator.'),
                   ('noprofile@test.fr', 'Your account is not active. Contact your administrator.'),
                   ('nostore@test.fr', 'No store is linked to your account. Contact your administrator.')]:
        ctx, pg, errs = page(e); s = st(pg)
        check('refused: ' + e, s['login'] and s['err'] == msg and ['signOut'] in s['log'] and not s['gate'], s); ctx.close()
    # 7. Screens: dark mode and phone width
    for w, dark in [(390, False), (390, True), (1440, True)]:
        ctx, pg, errs = page(None, w, dark); tag = ('dark' if dark else 'light') + '-' + str(w)
        pg.screenshot(path=OUT + '/login-' + tag + '.png')
        check('sign in screen fits ' + tag, pg.evaluate('document.documentElement.scrollWidth') <= w); ctx.close()
        ctx, pg, errs = page('manager.one@test.fr', w, dark); pg.click('#acct-btn'); pg.wait_for_timeout(200)
        pg.screenshot(path=OUT + '/manager-menu-' + tag + '.png')
        box = pg.evaluate("(() => { const r = document.getElementById('acct-menu').getBoundingClientRect(); return [r.left, r.right]; })()")
        check('account menu inside the screen ' + tag, box[0] >= 0 and box[1] <= w, box)
        check('no JavaScript error ' + tag, not errs, errs[:2]); ctx.close()
    b.close()
json.dump(res, open(OUT + '/accounts-results.json', 'w'), indent=1)
print(len(res), 'checks,', len(fails), 'failures'); [print('FAIL', f, [r['got'] for r in res if r['test'] == f][0]) for f in fails]
sys.exit(1 if fails else 0)
