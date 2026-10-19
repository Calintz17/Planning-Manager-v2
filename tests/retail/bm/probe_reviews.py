# The validation flow in the page (10.0.0.0), with fictional accounts and the stub of the base (stub_supabase_auth.js,
# which applies the same rules as tests/sql/2026-10-19_retail_reviews.sql). Each person works in his own browser; the
# base state is passed from one to the next. Usage: python3 probe_reviews.py [build]. Writes screens/reviews-*.png and
# screens/reviews-results.json. Exit 1 on failure.
import sys, os, json, shutil, tempfile, http.server, threading, functools, datetime
from playwright.sync_api import sync_playwright
B = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(B + '/../../..')
build = sys.argv[1] if len(sys.argv) > 1 else R + '/tests/builds/CAST_RETAIL_TEST.html'
OUT = B + '/screens'; os.makedirs(OUT, exist_ok=True)
U = tempfile.mkdtemp(); shutil.copy(build, U + '/index.html')
for d in ('logo', 'i18n', 'image homepage'): shutil.copytree(R + '/' + d, U + '/' + d)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=U)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
stub = open(B + '/stub_supabase_auth.js').read(); setup = open(B + '/setup.js').read()
SEEN = "try{localStorage.setItem('cora_help_seen',JSON.stringify({monthly:true,intraday:true,dashboard:true,labor:true,hours:true,breaks:true,corners:true,shifts:true,sunday:true,fairness:true,reinf:true,agents:true,traffic:true,calendar:true}))}catch(e){}"
DB = {
  'retail_regions': [{'id': 'r1', 'name': 'EMEA', 'city': 'Paris'}, {'id': 'r2', 'name': 'JAPAN', 'city': 'Tokyo'}],
  'retail_countries': [{'id': 'fr', 'region_id': 'r1', 'name': 'France', 'iso_code': 'FR'}, {'id': 'jp', 'region_id': 'r2', 'name': 'Japan', 'iso_code': 'JP'}],
  'retail_stores': [{'id': 'bm', 'country_id': 'fr', 'name': 'Store A'}, {'id': 's4', 'country_id': 'jp', 'name': 'Store Four'}],
  'retail_profiles': [], 'retail_profile_stores': [], 'retail_plan_reviews': [], 'retail_review_seen': []}
ACC = {}
def acct(n, email, role, name, region=None, stores=()):
    u = {'id': 'u%d' % n, 'email': email, 'user_metadata': {'pw_changed': True}}
    DB['retail_profiles'].append({'user_id': u['id'], 'email': email, 'full_name': name, 'role': role, 'region_id': region, 'active': True})
    for s in stores: DB['retail_profile_stores'].append({'user_id': u['id'], 'store_id': s})
    ACC[email] = u
acct(1, 'julie@test.fr', 'manager', 'Julie M.', stores=['bm'])
acct(2, 'claire@test.fr', 'director', 'Claire D.', region='r1')
acct(3, 'admin@test.fr', 'admin', 'Admin T.')
acct(4, 'kenji@test.fr', 'director', 'Kenji S.', region='r2')
accounts = [{'email': e, 'password': 'pw', 'user': u} for e, u in ACC.items()]
res = []; fails = []
def check(name, ok, got=''):
    res.append({'test': name, 'pass': bool(ok), 'got': str(got)[:300]}); (None if ok else fails.append(name)); print('OK ' if ok else 'FAIL', name, '' if ok else got)
# The app opens a month frozen (manualMode): the saved planning is kept and only the squares changed by hand move
PREP = setup + ";manualMode=true;agentLeaves.forEach((l,i)=>l.id=l.id||('lv'+i));"
STATE = """(() => { const b = document.getElementById('review-banner'), vis = id => { const e = document.getElementById(id); return !!e && !e.hidden && e.offsetParent !== null; };
  return { banner: b.hidden ? '' : b.className.replace('rv-banner ', ''), text: b.hidden ? '' : b.innerText.replace(/\\s+/g, ' '),
    send: vis('btn-submit-review'), validate: !!b.querySelector('[onclick*=validated]'), withdraw: !!b.querySelector('[onclick*=withdrawReview]'),
    marked: document.querySelectorAll('#planning-monthly-body td.rv-chg').length, bell: vis('bell-count') ? document.getElementById('bell-count').textContent : '0',
    nav: vis('nav-review-count') ? document.getElementById('nav-review-count').textContent : '0', navShown: !document.getElementById('nav-reviews').hidden,
    toasts: (window.__toasts || []).splice(0), editor: getComputedStyle(document.getElementById('cell-editor')).display !== 'none' }; })()"""
with sync_playwright() as p:
    b = p.chromium.launch()
    def page(email, w=1440, dark=False):
        ctx = b.new_context(viewport={'width': w, 'height': 900 if w > 800 else 844}, is_mobile=w < 800, has_touch=w < 800)
        ctx.add_init_script('window.__AUTH = ' + json.dumps({'db': DB, 'accounts': accounts, 'sessionUser': ACC[email]}) + ';' + SEEN +
                            ("try{localStorage.setItem('cast_theme','dark')}catch(e){}" if dark else "try{localStorage.setItem('cast_theme','light')}catch(e){}"))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.on('dialog', lambda d: d.accept())
        pg.clock.set_fixed_time(datetime.datetime(2026, 10, 19, 10, 0))
        pg.route('**/*', lambda r: r.fulfill(body=stub, content_type='application/javascript') if 'supabase-js' in r.request.url
                 else r.fulfill(body='[]', content_type='application/json') if 'nager' in r.request.url
                 else (r.continue_() if '127.0.0.1' in r.request.url else r.abort()))
        pg.goto('http://127.0.0.1:%d/index.html' % port); pg.wait_for_timeout(900)
        return ctx, pg, errs
    def load_store(pg):
        # The stub holds no advisors: the fictional store is put in the page, then its month and review are read
        pg.evaluate(PREP + "window.__toasts=[];if(!window.__wrapped){window.__wrapped=1;var st0=showToast;showToast=function(m,t){window.__toasts.push(String(m));return st0.apply(this,arguments);};};0")
        # A saved planning of the month (as in the base): automatic squares stay put when one square is changed by hand
        pg.evaluate("(async()=>{ planSnapshot={storeId:currentStoreId,month:snapshotMonthKey(),ok:true,plan:{}}; savePlanSnapshot=function(){return Promise.resolve(true);};"
                    " await loadMonthReview(); switchPlanningView('monthly'); renderMonthlyPlanning(); await refreshReviewCounts(); })()"); pg.wait_for_timeout(500)
    st = lambda pg: pg.evaluate(STATE)
    db_of = lambda pg: pg.evaluate("window.__AUTH.db")
    click = lambda pg, sel: (pg.locator(sel).first.evaluate('e => e.click()'), pg.wait_for_timeout(500))
    # 1. Manager: sends, is locked, withdraws, sends again
    ctx, pg, errs = page('julie@test.fr'); load_store(pg); s = st(pg)
    check('manager: Send for validation shown, no banner, Validation in the menu', s['send'] and not s['banner'] and s['navShown'], s)
    pg.screenshot(path=OUT + '/reviews-manager-draft-1440.png')
    click(pg, '#btn-submit-review'); s = st(pg)
    check('manager sends: pending banner with Withdraw, no Validate, Send hidden', s['banner'] == 'rv-pending' and s['withdraw'] and not s['validate'] and not s['send'], s)
    check('the sending holds the plan, its inputs and the check', pg.evaluate("(()=>{const r=window.__AUTH.db.retail_plan_reviews[0];return r.revision===1&&r.submitted_by==='u1'&&Object.keys(r.submitted_plan).length===30&&!!r.context.inputs&&typeof r.context.inputs.monthlyRef==='string'&&!!r.diagnostics.status;})()"))
    pg.screenshot(path=OUT + '/reviews-manager-pending-1440.png')
    click(pg, "td.c-day[data-agent][data-ds='2026-11-12']"); s = st(pg)
    check('pending: a square cannot be changed, the reason is said', not s['editor'] and any('waits for validation' in x for x in s['toasts']), s)
    pg.evaluate("recalcFromToday()"); pg.wait_for_timeout(300); s = st(pg)
    check('pending: Recalculate is stopped too', any('waits for validation' in x for x in s['toasts']), s['toasts'])
    click(pg, '#review-banner [onclick*=withdrawReview]'); s = st(pg)
    check('manager withdraws: withdrawn banner, Send shown again', s['banner'] == 'rv-withdrawn' and s['send'], s)
    click(pg, "td.c-day[data-agent][data-ds='2026-11-12']"); s = st(pg)
    check('after withdrawing the manager can change a square', s['editor'], s)
    pg.evaluate("closeCellEditor()")
    click(pg, '#btn-submit-review'); s = st(pg)
    check('manager sends again: revision 2 pending', s['banner'] == 'rv-pending' and 'Revision 2' in s['text'], s['text'])
    check('no JavaScript error (manager)', not errs, errs[:2]); DB = db_of(pg); ctx.close()
    # 2. Director of the region: queue, review, one correction, return with a comment
    ctx, pg, errs = page('claire@test.fr'); pg.wait_for_timeout(300)
    pg.evaluate("(async()=>{ await refreshReviewCounts(); })()"); pg.wait_for_timeout(300); s = st(pg)
    check('director: bell 1 and menu count 1', s['bell'] == '1' and s['nav'] == '1', s)
    pg.evaluate("document.getElementById('store-gate').classList.remove('show');document.body.classList.remove('gate-open');switchTab('reviews', document.getElementById('nav-reviews'))"); pg.wait_for_timeout(600)
    rows = pg.evaluate("[...document.querySelectorAll('#review-list tbody tr')].map(r => r.innerText.replace(/\\s+/g,' '))")
    check('director: To review lists Store A November, revision 2, sent by Julie M.', len(rows) == 1 and 'Store A' in rows[0] and 'Julie M.' in rows[0] and 'Pending' in rows[0], rows)
    pg.screenshot(path=OUT + '/reviews-director-list-1440.png')
    click(pg, '#review-list .rv-open button'); pg.wait_for_timeout(600)
    check('director: Open goes to the store and the month', pg.evaluate("currentStoreId==='bm' && shownMonthKey()==='2026-11' && document.getElementById('tab-planning').classList.contains('active')"))
    load_store(pg); s = st(pg)
    check('director: pending banner with Validate, Return and a comment box', s['banner'] == 'rv-pending' and s['validate'] and pg.evaluate("!!document.getElementById('rv-comment')"), s)
    click(pg, "td.c-day[data-agent][data-ds='2026-11-12']"); click(pg, '#ce-body .ce-opt >> text=OFF')
    pg.evaluate("renderMonthlyPlanning()"); pg.wait_for_timeout(300); s = st(pg)
    check('director corrects one square: it is marked, "Your changes: 1 squares"', s['marked'] == 1 and '1 square changed by you' in s['text'], s)
    pg.screenshot(path=OUT + '/reviews-director-review-1440.png')
    pg.fill('#rv-comment', 'Agent 12 works 6 days in a row, please move one shift.')
    click(pg, "#review-banner [onclick*=returned]"); s = st(pg)
    check('director returns: returned banner with the comment, bell 0', s['banner'] == 'rv-returned' and 'please move one shift' in s['text'] and s['bell'] == '0', s)
    check('no JavaScript error (director)', not errs, errs[:2]); DB = db_of(pg); ctx.close()
    # 3. Another region sees nothing
    ctx, pg, errs = page('kenji@test.fr'); pg.evaluate("(async()=>{ await refreshReviewCounts(); })()"); pg.wait_for_timeout(300); s = st(pg)
    pg.evaluate("document.getElementById('store-gate').classList.remove('show');document.body.classList.remove('gate-open');switchTab('reviews', document.getElementById('nav-reviews'))"); pg.wait_for_timeout(600)
    check('director of another region: bell 0, empty list', s['bell'] == '0' and pg.evaluate("document.querySelectorAll('#review-list tbody tr').length") == 0, s)
    ctx.close()
    # 4. Manager: the decision is new for him, the director's square is marked, he sends again
    ctx, pg, errs = page('julie@test.fr'); load_store(pg); s = st(pg)
    check('manager: bell 1 (returned), banner returned with the comment and 1 changed square', s['bell'] == '1' and s['banner'] == 'rv-returned' and 'please move one shift' in s['text'] and s['marked'] == 1, s)
    pg.screenshot(path=OUT + '/reviews-manager-returned-1440.png')
    click(pg, '#bell-btn'); pg.wait_for_timeout(200); pg.screenshot(path=OUT + '/reviews-manager-bell-1440.png')
    click(pg, '#bell-menu .bell-item'); pg.wait_for_timeout(600); load_store(pg); s = st(pg)
    check('opening the notification marks it seen for him (bell 0)', s['bell'] == '0', s)
    click(pg, '#btn-submit-review'); s = st(pg)
    check('manager sends revision 3', s['banner'] == 'rv-pending' and 'Revision 3' in s['text'], s['text'])
    check('no JavaScript error (manager, second visit)', not errs, errs[:2]); DB = db_of(pg); ctx.close()
    # 5. Admin alone: sends for the Japan store too, validates both, his own included
    ctx, pg, errs = page('admin@test.fr'); load_store(pg); s = st(pg)
    check('admin: Validate, Return and Withdraw on a pending month', s['validate'] and s['withdraw'], s)
    click(pg, "#review-banner [onclick*=validated]"); s = st(pg)
    check('admin validates: validated banner, no change since validation', s['banner'] == 'rv-validated' and 'No change since validation' in s['text'], s)
    pg.evaluate("(()=>{var ds='2026-11-20',a=agents.find(x=>monthlyResult[ds][x.id]&&monthlyResult[ds][x.id].code==='O');planningOverrides[a.id]=Object.assign({},planningOverrides[a.id],{[ds]:'OFF'});renderMonthlyPlanning();})()"); pg.wait_for_timeout(300); s = st(pg)
    check('a change after validation is counted, the manager keeps the hand', '1 change since validation' in s['text'] and s['send'], s['text'])
    pg.screenshot(path=OUT + '/reviews-admin-validated-1440.png')
    pg.evaluate("(async()=>{ var r = await sb.rpc('retail_submit_review', {p_store:'s4', p_month:'2026-11', p_plan:{}, p_context:null, p_diagnostics:null}); window.__r = r; await refreshReviewCounts(); })()"); pg.wait_for_timeout(400)
    s = st(pg)
    check('admin sends for another store and finds it in his own queue', pg.evaluate("!window.__r.error") and s['bell'] == '1' and s['nav'] == '1', s)
    check('no JavaScript error (admin)', not errs, errs[:2]); DB = db_of(pg); ctx.close()
    # 6. Screens: phone and dark mode
    DB['retail_plan_reviews'].append({'id': 'rvx', 'store_id': 'bm', 'month': '2026-12', 'revision': 1, 'status': 'pending', 'submitted_plan': {}, 'reviewed_plan': None,
        'comment': '', 'submitted_by': 'u1', 'submitted_by_name': 'Julie M.', 'submitted_at': '2026-10-19T08:00:00Z', 'decided_by': None, 'decided_by_name': '', 'decided_at': None})
    for email, w, dark, tag in [('claire@test.fr', 390, False, 'director-review-390'), ('claire@test.fr', 1440, True, 'director-review-dark-1440'),
                                ('julie@test.fr', 390, True, 'manager-pending-dark-390'), ('julie@test.fr', 320, False, 'manager-pending-320')]:
        ctx, pg, errs = page(email, w, dark); load_store(pg); pg.evaluate("(async()=>{ monthlyRef=new Date(2026,11,1); updateMonthlyLabel(); await loadMonthReview(); renderMonthlyPlanning(); monthReview.submitted_plan=JSON.parse(JSON.stringify(monthlyResult)); renderReviewBanner(); })()"); pg.wait_for_timeout(500)
        pg.screenshot(path=OUT + '/reviews-' + tag + '.png')
        check('screen ' + tag + ': fits, no error', pg.evaluate('document.documentElement.scrollWidth') <= w and not errs, errs[:1]); ctx.close()
    b.close()
json.dump(res, open(OUT + '/reviews-results.json', 'w'), indent=1)
print(len(res), 'checks,', len(fails), 'failures')
sys.exit(1 if fails else 0)
