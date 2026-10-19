# The validation flow in the page (10.0.0.1: status chip, step windows, cancel), with fictional accounts and the stub of the base (stub_supabase_auth.js,
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
# State of the head of the Monthly: the status chip, its menu (opened and closed again), the buttons, the marks, the counts
STATE = """(() => { const vis = id => { const e = document.getElementById(id); return !!e && !e.hidden && e.offsetParent !== null; };
  const c = document.querySelector('#rv-chip-monthly .rv-chip'); let menu = '';
  if (c && vis('rv-chip-monthly')) { c.click(); menu = c.nextElementSibling.innerText.replace(/\\s+/g, ' '); closeReviewMenus(); }
  return { chip: c && vis('rv-chip-monthly') ? c.className.replace('rv-chip rv-st-', '') : '', text: c ? c.innerText.replace(/\\s+/g, ' ') : '', menu: menu,
    send: vis('btn-submit-review'), decide: vis('btn-decide-review'), withdraw: vis('btn-withdraw-review'),
    marked: document.querySelectorAll('#planning-monthly-body td.rv-chg').length, bell: vis('bell-count') ? document.getElementById('bell-count').textContent : '0',
    nav: vis('nav-review-count') ? document.getElementById('nav-review-count').textContent : '0', navShown: !document.getElementById('nav-reviews').hidden,
    banner: !!document.getElementById('review-banner'), rhInPlan: document.querySelectorAll('#planning-monthly-body .c-rh').length,
    toasts: (window.__toasts || []).splice(0), editor: getComputedStyle(document.getElementById('cell-editor')).display !== 'none' }; })()"""
with sync_playwright() as p:
    b = p.chromium.launch()
    def page(email, w=1440, dark=False):
        ctx = b.new_context(viewport={'width': w, 'height': 900 if w > 800 else 844}, is_mobile=w < 800, has_touch=w < 800)
        ctx.add_init_script('window.__AUTH = ' + json.dumps({'db': DB, 'accounts': accounts, 'sessionUser': ACC[email]}) + ';' + SEEN +
                            ("try{localStorage.setItem('cast_theme','dark')}catch(e){}" if dark else "try{localStorage.setItem('cast_theme','light')}catch(e){}"))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.on('dialog', lambda d: (errs.append('native dialog: ' + d.message[:60]), d.accept()))
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
    dlg_open = lambda pg: pg.evaluate("document.getElementById('review-dialog').classList.contains('open')")
    def step(pg, opener, comment=None, alt=False):
        """Open a step (button or menu item), check its window, write the comment, confirm."""
        click(pg, opener); ok = dlg_open(pg)
        if comment is not None: pg.fill('#rvd-comment', comment)
        click(pg, '#rvd-alt' if alt else '#rvd-main'); return ok and not dlg_open(pg)
    def menu_item(pg, label):
        pg.evaluate("document.querySelector('#rv-chip-monthly .rv-chip').click()"); pg.wait_for_timeout(150)
        return "#rv-chip-monthly .rv-menu .mission-menu-item >> text=" + label
    # 1. Manager: sends, is locked, withdraws, sends again
    ctx, pg, errs = page('julie@test.fr'); load_store(pg); s = st(pg)
    check('manager: Send for validation shown, no chip, Validation in the menu', s['send'] and not s['chip'] and s['navShown'] and not s['banner'], s)
    check('the counters left the planning (Client Advisor count below)', s['rhInPlan'] == 0 and pg.evaluate("[...document.querySelectorAll('.ca-card .ca-table thead th')].map(e=>e.textContent).join(' ')").endswith('O C OFF SUN ABS H'),
          pg.evaluate("[...document.querySelectorAll('.ca-card .ca-table thead th')].map(e=>e.textContent).join(' ')"))
    check('Client Advisor count: one row per advisor shown, hours as in 10.0.0.0', pg.evaluate("document.querySelectorAll('.ca-card tbody tr').length === document.querySelectorAll('#mth-table tbody .person-cell').length && document.querySelector('.ca-card summary').innerText.trim() === 'Client Advisor count'"))
    pg.screenshot(path=OUT + '/reviews-manager-draft-1440.png')
    check('send opens a window, then sends', step(pg, '#btn-submit-review'))
    s = st(pg)
    check('manager sends: pending chip, Withdraw button, no Review, Send hidden', s['chip'] == 'pending' and s['withdraw'] and not s['decide'] and not s['send'] and 'Pending validation, sent by Julie M., 19 Oct' in s['text'], s)
    check('the sending holds the plan, its inputs and the check', pg.evaluate("(()=>{const r=window.__AUTH.db.retail_plan_reviews[0];return r.revision===1&&r.submitted_by==='u1'&&Object.keys(r.submitted_plan).length===30&&!!r.context.inputs&&typeof r.context.inputs.monthlyRef==='string'&&!!r.diagnostics.status;})()"))
    pg.screenshot(path=OUT + '/reviews-manager-pending-1440.png')
    click(pg, "td.c-day[data-agent][data-ds='2026-11-12']"); s = st(pg)
    check('pending: a square cannot be changed, the reason is said', not s['editor'] and any('waits for validation' in x for x in s['toasts']), s)
    pg.evaluate("recalcFromToday()"); pg.wait_for_timeout(300); s = st(pg)
    check('pending: Recalculate is stopped too', any('waits for validation' in x for x in s['toasts']), s['toasts'])
    check('manager withdraws through its window', step(pg, '#btn-withdraw-review')); s = st(pg)
    check('withdrawn: chip withdrawn, Send shown again', s['chip'] == 'withdrawn' and s['send'], s)
    click(pg, "td.c-day[data-agent][data-ds='2026-11-12']"); s = st(pg)
    check('after withdrawing the manager can change a square', s['editor'], s)
    pg.evaluate("closeCellEditor()")
    step(pg, '#btn-submit-review'); s = st(pg)
    check('manager sends again: revision 2 pending (in the menu)', s['chip'] == 'pending' and 'Revision 2' in s['menu'] and 'Withdraw' in s['menu'] and 'Cancel' not in s['menu'], s['menu'])
    check('no JavaScript error (manager)', not errs, errs[:2]); DB = db_of(pg); ctx.close()
    # 2. Director of the region: queue, review, one correction, return with a comment
    ctx, pg, errs = page('claire@test.fr'); pg.wait_for_timeout(300)
    pg.evaluate("(async()=>{ await refreshReviewCounts(); })()"); pg.wait_for_timeout(300); s = st(pg)
    check('director: bell 1 and menu count 1', s['bell'] == '1' and s['nav'] == '1', s)
    pg.evaluate("document.getElementById('store-gate').classList.remove('show');document.body.classList.remove('gate-open');switchTab('reviews', document.getElementById('nav-reviews'))"); pg.wait_for_timeout(600)
    rows = pg.evaluate("[...document.querySelectorAll('#review-list tbody tr')].map(r => r.innerText.replace(/\\s+/g,' '))")
    check('director: To review lists Store A November, revision 2, with Open and Cancel', len(rows) == 1 and 'Store A' in rows[0] and 'Julie M.' in rows[0] and 'Pending' in rows[0] and 'Open' in rows[0] and 'Cancel' in rows[0], rows)
    pg.screenshot(path=OUT + '/reviews-director-list-1440.png')
    click(pg, '#review-list .rv-open button'); pg.wait_for_timeout(600)
    check('director: Open goes to the store and the month', pg.evaluate("currentStoreId==='bm' && shownMonthKey()==='2026-11' && document.getElementById('tab-planning').classList.contains('active')"))
    load_store(pg); s = st(pg)
    check('director: pending chip, Review button, Cancel sending in the menu', s['chip'] == 'pending' and s['decide'] and not s['withdraw'] and 'Cancel sending' in s['menu'], s)
    click(pg, "td.c-day[data-agent][data-ds='2026-11-12']"); click(pg, '#ce-body .ce-opt >> text=OFF')
    pg.evaluate("renderMonthlyPlanning()"); pg.wait_for_timeout(300); s = st(pg)
    check('director corrects one square: it is marked, "1 square changed by you"', s['marked'] == 1 and '1 square changed by you' in s['menu'], s)
    pg.screenshot(path=OUT + '/reviews-director-review-1440.png')
    click(pg, '#btn-decide-review')
    check('the review window shows the change count, a comment box, Validate and Return', dlg_open(pg) and pg.evaluate("document.getElementById('rvd-legend').innerText.includes('1 square changed by you') && !document.getElementById('rvd-alt').hidden && !document.getElementById('rvd-fld').hidden"))
    pg.screenshot(path=OUT + '/reviews-director-dialog-1440.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    check('Escape closes the window, nothing is sent', not dlg_open(pg) and pg.evaluate("window.__AUTH.db.retail_plan_reviews[1].status") == 'pending')
    check('director returns with a comment', step(pg, '#btn-decide-review', 'Agent 12 works 6 days in a row, please move one shift.', alt=True)); s = st(pg)
    check('returned: chip returned, comment in the menu, bell 0', s['chip'] == 'returned' and 'please move one shift' in s['menu'] and s['bell'] == '0' and 'Returned by Claire D., 19 Oct' in s['text'], s)
    check('no JavaScript error (director)', not errs, errs[:2]); DB = db_of(pg); ctx.close()
    # 3. Another region sees nothing
    ctx, pg, errs = page('kenji@test.fr'); pg.evaluate("(async()=>{ await refreshReviewCounts(); })()"); pg.wait_for_timeout(300); s = st(pg)
    pg.evaluate("document.getElementById('store-gate').classList.remove('show');document.body.classList.remove('gate-open');switchTab('reviews', document.getElementById('nav-reviews'))"); pg.wait_for_timeout(600)
    check('director of another region: bell 0, empty list', s['bell'] == '0' and pg.evaluate("document.querySelectorAll('#review-list tbody tr').length") == 0, s)
    ctx.close()
    # 4. Manager: the decision is new for him, the director's square is marked, he sends again
    ctx, pg, errs = page('julie@test.fr'); load_store(pg); s = st(pg)
    check('manager: bell 1 (returned), chip returned with the comment and 1 changed square', s['bell'] == '1' and s['chip'] == 'returned' and 'please move one shift' in s['menu'] and s['marked'] == 1, s)
    pg.hover('#rv-chip-monthly .rv-chip'); pg.wait_for_timeout(200)
    check('hover on the chip shows the comment', 'please move one shift' in pg.evaluate("document.getElementById('evt-tip').classList.contains('open') ? document.getElementById('evt-tip').innerText : ''"))
    pg.screenshot(path=OUT + '/reviews-manager-returned-1440.png')
    pg.mouse.move(5, 5)
    click(pg, '#bell-btn'); pg.wait_for_timeout(200); pg.screenshot(path=OUT + '/reviews-manager-bell-1440.png')
    click(pg, '#bell-menu .bell-item'); pg.wait_for_timeout(600); load_store(pg); s = st(pg)
    check('opening the notification marks it seen for him (bell 0)', s['bell'] == '0', s)
    step(pg, '#btn-submit-review'); s = st(pg)
    check('manager sends revision 3', s['chip'] == 'pending' and 'Revision 3' in s['menu'], s['menu'])
    check('no JavaScript error (manager, second visit)', not errs, errs[:2]); DB = db_of(pg); ctx.close()
    # 5. Admin alone: validates his queue, cancels a validation given too fast, sends and cancels for another store
    ctx, pg, errs = page('admin@test.fr'); load_store(pg); s = st(pg)
    check('admin: Review button, Withdraw and Cancel sending in the menu', s['decide'] and 'Withdraw' in s['menu'] and 'Cancel sending' in s['menu'], s)
    check('admin validates through the window', step(pg, '#btn-decide-review', 'Good')); s = st(pg)
    check('validated: green chip, no change since validation, Send hidden (nothing new to send)', s['chip'] == 'validated' and 'No change since validation' in s['menu'] and not s['send'] and 'Validated by Admin T., 19 Oct' in s['text'], s)
    pg.screenshot(path=OUT + '/reviews-admin-validated-1440.png')
    pg.evaluate("(()=>{var ds='2026-11-20',a=agents.find(x=>monthlyResult[ds][x.id]&&monthlyResult[ds][x.id].code==='O');planningOverrides[a.id]=Object.assign({},planningOverrides[a.id],{[ds]:'OFF'});renderMonthlyPlanning();})()"); pg.wait_for_timeout(300); s = st(pg)
    check('a change after validation is counted, Send for validation comes back', '1 change since validation' in s['menu'] and s['send'], s['menu'])
    check('admin cancels the validation (menu, window with a reason)', step(pg, menu_item(pg, 'Cancel validation'), 'Clicked too fast')); s = st(pg)
    rv = pg.evaluate("window.__AUTH.db.retail_plan_reviews.find(r=>r.revision===3)")
    check('cancelled: chip "Validation cancelled", Send shown, history keeps the validation', s['chip'] == 'cancelled' and 'Validation cancelled by Admin T., 19 Oct' in s['text'] and s['send']
          and [h['status'] for h in rv['history']] == ['pending', 'validated', 'cancelled'] and rv['comment'] == 'Clicked too fast', (s, rv['history']))
    pg.evaluate("(async()=>{ var r = await sb.rpc('retail_submit_review', {p_store:'s4', p_month:'2026-11', p_plan:{}, p_context:null, p_diagnostics:null}); window.__r = r; await refreshReviewCounts(); })()"); pg.wait_for_timeout(400)
    s = st(pg)
    check('admin sends for another store and finds it in his own queue', pg.evaluate("!window.__r.error") and s['bell'] == '1' and s['nav'] == '1', s)
    pg.evaluate("reviewFilter='all';switchTab('reviews', document.getElementById('nav-reviews'))"); pg.wait_for_timeout(600)
    rows = pg.evaluate("[...document.querySelectorAll('#review-list tbody tr')].map(r => r.innerText.replace(/\\s+/g,' '))")
    check('All: Cancel only on the last sending still waiting or validated', [r.endswith('OpenCancel') for r in rows] == [('Store Four' in r) for r in rows] and any('Store Four' in r for r in rows), rows)
    pg.screenshot(path=OUT + '/reviews-admin-list-1440.png')
    check('Cancel from the list (window with a reason)', step(pg, "#review-list tr:has-text('Store Four') .rv-open button >> text=Cancel", 'Sent by mistake'))
    check('the list is up to date, Store Four is cancelled', pg.evaluate("window.__AUTH.db.retail_plan_reviews.find(r=>r.store_id==='s4').status") == 'cancelled'
          and pg.evaluate("[...document.querySelectorAll('#review-list tbody tr')].some(r=>r.innerText.includes('Store Four')&&r.innerText.includes('Cancelled')&&!r.innerText.trim().endsWith('Cancel'))"))
    check('no JavaScript error (admin)', not errs, errs[:2]); DB = db_of(pg); ctx.close()
    # 6. Manager: the cancel is new for him, the month is his again
    ctx, pg, errs = page('julie@test.fr'); load_store(pg); s = st(pg)
    check('manager: bell 1 (cancelled), chip cancelled with the reason, he can change the month', s['bell'] == '1' and s['chip'] == 'cancelled' and 'Clicked too fast' in s['menu'] and s['send'], s)
    click(pg, "td.c-day[data-agent][data-ds='2026-11-12']"); s = st(pg)
    check('cancelled: the cell editor opens', s['editor'], s); pg.evaluate("closeCellEditor()")
    pg.evaluate("(async()=>{ switchPlanningView('intraday'); await loadAndRenderIntraday('2026-11-12'); })()"); pg.wait_for_timeout(600)
    check('Intraday on a day of that month shows the same chip, aligned with the corners row', pg.evaluate("!document.getElementById('rv-chip-intraday').hidden && document.querySelector('#rv-chip-intraday .rv-chip').innerText.includes('Validation cancelled')"))
    pg.evaluate("(async()=>{ await loadAndRenderIntraday('2026-12-03'); })()"); pg.wait_for_timeout(600)
    check('Intraday on another month: no chip', pg.evaluate("document.getElementById('rv-chip-intraday').hidden"))
    check('no JavaScript error (manager, third visit)', not errs, errs[:2]); DB = db_of(pg); ctx.close()
    # 7. Screens: phone and dark mode
    DB['retail_plan_reviews'].append({'id': 'rvx', 'store_id': 'bm', 'month': '2026-12', 'revision': 1, 'status': 'pending', 'submitted_plan': {}, 'reviewed_plan': None,
        'comment': '', 'submitted_by': 'u1', 'submitted_by_name': 'Julie M.', 'submitted_at': '2026-10-19T08:00:00Z', 'decided_by': None, 'decided_by_name': '', 'decided_at': None, 'history': []})
    for email, w, dark, tag in [('claire@test.fr', 390, False, 'director-review-390'), ('claire@test.fr', 1440, True, 'director-review-dark-1440'),
                                ('julie@test.fr', 390, True, 'manager-pending-dark-390'), ('julie@test.fr', 320, False, 'manager-pending-320')]:
        ctx, pg, errs = page(email, w, dark); load_store(pg); pg.evaluate("(async()=>{ monthlyRef=new Date(2026,11,1); updateMonthlyLabel(); await loadMonthReview(); renderMonthlyPlanning(); monthReview.submitted_plan=JSON.parse(JSON.stringify(monthlyResult)); renderReviewStatus(); })()"); pg.wait_for_timeout(500)
        pg.screenshot(path=OUT + '/reviews-' + tag + '.png')
        check('screen ' + tag + ': fits, no error', pg.evaluate('document.documentElement.scrollWidth') <= w and not errs, errs[:1])
        pg.evaluate("document.querySelector('#rv-chip-monthly .rv-chip').click()"); pg.wait_for_timeout(200)
        r = pg.evaluate("(()=>{const m=document.querySelector('#rv-chip-monthly .rv-menu').getBoundingClientRect();return [m.left,m.right,innerWidth]})()")
        pg.screenshot(path=OUT + '/reviews-' + tag + '-menu.png')
        check('screen ' + tag + ': the chip menu stays on screen', r[0] >= 0 and r[1] <= r[2], r)
        pg.evaluate("closeReviewMenus(); openReviewDialog(canDecideReview() ? 'decide' : 'withdraw')"); pg.wait_for_timeout(200)
        pg.screenshot(path=OUT + '/reviews-' + tag + '-dialog.png'); ctx.close()
    b.close()
json.dump(res, open(OUT + '/reviews-results.json', 'w'), indent=1)
print(len(res), 'checks,', len(fails), 'failures')
sys.exit(1 if fails else 0)
