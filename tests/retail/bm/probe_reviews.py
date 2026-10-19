# The validation flow in the page (10.0.0.2: status in the place of the send button, reviewed copy, counts), with fictional accounts and the stub of the base (stub_supabase_auth.js,
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
# State of the head of the Monthly: the status button (in the place of Send for validation), its menu (opened and
# closed again), the marks, the counts
STATE = """(() => { const vis = id => { const e = document.getElementById(id); return !!e && !e.hidden && e.offsetParent !== null; };
  const c = document.querySelector('#rv-status .rv-chip'); let menu = '';
  if (c && vis('rv-status')) { c.click(); menu = c.nextElementSibling.innerText.replace(/\\s+/g, ' '); closeReviewMenus(); }
  return { chip: c && vis('rv-status') ? c.className.replace('rv-chip rv-st-', '') : '', text: c ? c.innerText.replace(/\\s+/g, ' ').trim() : '', menu: menu,
    dot: !!document.querySelector('#rv-status .rv-dot'), send: vis('btn-submit-review'),
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
    def menu_item(pg, label):
        pg.evaluate("document.querySelector('#rv-status .rv-chip').click()"); pg.wait_for_timeout(150)
        return "#rv-status .rv-menu .mission-menu-item >> text=" + label
    def step(pg, opener, comment=None, alt=False):
        """Open a step (button or menu item), check its window, write the comment, confirm."""
        click(pg, opener); ok = dlg_open(pg)
        if comment is not None: pg.fill('#rvd-comment', comment)
        click(pg, '#rvd-alt' if alt else '#rvd-main'); return ok and not dlg_open(pg)
    reviews = lambda pg: pg.evaluate("window.__AUTH.db.retail_plan_reviews")
    # 1. Manager: sends, is locked, withdraws, sends again
    ctx, pg, errs = page('julie@test.fr'); load_store(pg); s = st(pg)
    check('manager: Send for validation shown, no status yet, Validation in the menu', s['send'] and not s['chip'] and s['navShown'] and not s['banner'], s)
    check('the counters left the planning; Client Advisor count in full words', s['rhInPlan'] == 0 and pg.evaluate("[...document.querySelectorAll('.ca-card .ca-table thead th')].map(e=>e.textContent).join(' ')").endswith('Opening Closing Off Sundays Absence Worked hours'),
          pg.evaluate("[...document.querySelectorAll('.ca-card .ca-table thead th')].map(e=>e.textContent).join(' ')"))
    check('Client Advisor count: one row per advisor shown', pg.evaluate("document.querySelectorAll('.ca-card tbody tr').length === document.querySelectorAll('#mth-table tbody .person-cell').length && document.querySelector('.ca-card summary').innerText.trim() === 'Client Advisor count'"))
    pg.evaluate("document.querySelectorAll('#planning-coverage-body details').forEach(d=>d.open=true)")
    pg.locator('.ca-table tbody tr:nth-child(3) td:nth-child(4)').hover(); pg.wait_for_timeout(100)
    hl = pg.evaluate("[document.querySelectorAll('.ca-table .col-hl').length, document.querySelectorAll('.ca-table tbody tr').length + 1]")
    pg.locator('#mth-summary tbody tr:nth-child(2) td.c-day >> nth=4').hover(); pg.wait_for_timeout(100)
    hl2 = pg.evaluate("document.querySelectorAll('#mth-summary .col-hl').length")
    check('pointer guide: the column lights in the Client Advisor count and in Coverage', hl[0] == hl[1] and hl2 > 1, (hl, hl2))
    check('the counts start under the first day of the Monthly', abs(pg.evaluate("document.querySelector('.ca-table thead th.ca-n').getBoundingClientRect().left - document.querySelector('#mth-table thead th.c-day').getBoundingClientRect().left")) < 1)
    pg.mouse.move(5, 5)
    pg.screenshot(path=OUT + '/reviews-manager-draft-1440.png')
    check('send opens a window, then sends', step(pg, '#btn-submit-review'))
    s = st(pg)
    check('manager sends: the button becomes "Pending" with its arrow, Withdraw in its menu', s['chip'] == 'pending' and s['text'] == 'Pending' and not s['send'] and 'Withdraw' in s['menu'] and 'Pending validation, sent by Julie M., 19 Oct' in s['menu'], s)
    check('the sending holds the plan shown, its inputs and the check', pg.evaluate("(()=>{const r=window.__AUTH.db.retail_plan_reviews[0];return r.revision===1&&r.submitted_by==='u1'&&JSON.stringify(r.submitted_plan)===JSON.stringify(monthlyResult)&&!!r.context.inputs&&typeof r.context.inputs.monthlyRef==='string'&&!!r.diagnostics.status;})()"))
    pg.screenshot(path=OUT + '/reviews-manager-pending-1440.png')
    click(pg, "td.c-day[data-agent][data-ds='2026-11-12']"); s = st(pg)
    check('pending: a square cannot be changed, the reason is said', not s['editor'] and any('waits for validation' in x for x in s['toasts']), s)
    pg.evaluate("recalcFromToday()"); pg.wait_for_timeout(300); s = st(pg)
    check('pending: Recalculate is stopped too', any('waits for validation' in x for x in s['toasts']), s['toasts'])
    check('manager withdraws from the menu, through its window', step(pg, menu_item(pg, 'Withdraw...'))); s = st(pg)
    check('withdrawn: "Withdrawn", Send again in the menu', s['chip'] == 'withdrawn' and s['text'] == 'Withdrawn' and 'Send again' in s['menu'], s)
    click(pg, "td.c-day[data-agent][data-ds='2026-11-12']"); s = st(pg)
    check('after withdrawing the manager can change a square', s['editor'], s)
    pg.evaluate("closeCellEditor()")
    step(pg, menu_item(pg, 'Send again...')); s = st(pg)
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
    load_store(pg); pg.wait_for_timeout(300); s = st(pg)
    check('opened: the bell dot goes, the queue count stays until decided', s['bell'] == '0' and s['nav'] == '1', s)
    check('director: "Pending", Validate or return and Cancel sending in the menu', s['chip'] == 'pending' and 'Validate or return' in s['menu'] and 'Cancel sending' in s['menu'] and 'Withdraw' not in s['menu'], s)
    click(pg, "td.c-day[data-agent][data-ds='2026-11-12']"); click(pg, '#ce-body .ce-opt >> text=OFF')
    pg.evaluate("renderMonthlyPlanning()"); pg.wait_for_timeout(300); s = st(pg)
    check('director corrects one square: it is marked, "1 square changed by you"', s['marked'] == 1 and '1 square changed by you' in s['menu'], s)
    pg.screenshot(path=OUT + '/reviews-director-review-1440.png')
    click(pg, menu_item(pg, 'Validate or return...'))
    check('the review window shows the change count, a comment box, Validate and Return', dlg_open(pg) and pg.evaluate("document.getElementById('rvd-legend').innerText.includes('1 square changed by you') && !document.getElementById('rvd-alt').hidden && !document.getElementById('rvd-fld').hidden"))
    pg.screenshot(path=OUT + '/reviews-director-dialog-1440.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    check('Escape closes the window, nothing is sent', not dlg_open(pg) and pg.evaluate("window.__AUTH.db.retail_plan_reviews[1].status") == 'pending')
    check('director returns with a comment', step(pg, menu_item(pg, 'Validate or return...'), 'Agent 12 works 6 days in a row, please move one shift.', alt=True)); s = st(pg)
    rv = reviews(pg)[1]
    check('returned: "Returned", the comment in the menu', s['chip'] == 'returned' and 'please move one shift' in s['menu'] and 'Returned by Claire D., 19 Oct' in s['menu'], s)
    check('the decision holds the sent copy plus his one change, and its check', sum(1 for ds in rv['submitted_plan'] for k in rv['submitted_plan'][ds] if json.dumps(rv['submitted_plan'][ds][k], sort_keys=True) != json.dumps(rv['reviewed_plan'][ds].get(k), sort_keys=True)) == 1
          and rv.get('decision_diagnostics', {}).get('edits') == 1, rv.get('decision_diagnostics'))
    check('no JavaScript error (director)', not errs, errs[:2]); DB = db_of(pg); ctx.close()
    # 3. Another region sees nothing
    ctx, pg, errs = page('kenji@test.fr'); pg.evaluate("(async()=>{ await refreshReviewCounts(); })()"); pg.wait_for_timeout(300); s = st(pg)
    pg.evaluate("document.getElementById('store-gate').classList.remove('show');document.body.classList.remove('gate-open');switchTab('reviews', document.getElementById('nav-reviews'))"); pg.wait_for_timeout(600)
    check('director of another region: bell 0, empty list', s['bell'] == '0' and pg.evaluate("document.querySelectorAll('#review-list tbody tr').length") == 0, s)
    ctx.close()
    # 4. Manager: the decision is new for him, the director's square is marked, he sends again
    ctx, pg, errs = page('julie@test.fr'); load_store(pg); s = st(pg)
    check('manager: bell 1 (returned), "Returned" with the comment and 1 changed square', s['bell'] == '1' and s['chip'] == 'returned' and 'please move one shift' in s['menu'] and s['marked'] == 1, s)
    pg.hover('#rv-status .rv-chip'); pg.wait_for_timeout(200)
    check('hover on the status shows the comment', 'please move one shift' in pg.evaluate("document.getElementById('rv-tip').hidden ? '' : document.getElementById('rv-tip').textContent"))
    pg.screenshot(path=OUT + '/reviews-manager-returned-1440.png')
    pg.mouse.move(5, 5)
    click(pg, '#bell-btn'); pg.wait_for_timeout(200); pg.screenshot(path=OUT + '/reviews-manager-bell-1440.png')
    click(pg, '#bell-menu .bell-item'); pg.wait_for_timeout(600); load_store(pg); s = st(pg)
    check('opening the notification marks it seen for him (bell 0)', s['bell'] == '0', s)
    step(pg, menu_item(pg, 'Send again...')); s = st(pg)
    check('manager sends revision 3', s['chip'] == 'pending' and 'Revision 3' in s['menu'], s['menu'])
    check('no JavaScript error (manager, second visit)', not errs, errs[:2]); DB = db_of(pg); ctx.close()
    # 5. Admin alone: validates his queue, cancels a validation given too fast, sends and cancels for another store
    ctx, pg, errs = page('admin@test.fr'); load_store(pg); s = st(pg)
    check('admin: Validate or return, Withdraw and Cancel sending in the menu', 'Validate or return' in s['menu'] and 'Withdraw' in s['menu'] and 'Cancel sending' in s['menu'], s)
    pg.evaluate("agents.push(Object.assign({}, agents[9], { id: 'new-employee', first_name: 'New', last_name: 'Person' })); renderMonthlyPlanning();"); pg.wait_for_timeout(300)
    check('admin validates through the window', step(pg, menu_item(pg, 'Validate or return...'), 'Good')); s = st(pg)
    rv = [r for r in reviews(pg) if r['revision'] == 3][0]
    check('a person added after the sending does not slip into the validated copy', all('new-employee' not in rv['reviewed_plan'][ds] for ds in rv['reviewed_plan']) and rv['reviewed_plan'] == rv['submitted_plan'])
    pg.evaluate("agents = agents.filter(a => a.id !== 'new-employee'); renderMonthlyPlanning();"); pg.wait_for_timeout(300); s = st(pg)
    ls = pg.evaluate("(async()=>{ var rv = window.__AUTH.db.retail_plan_reviews.find(r => r.revision === 3), e = rv.decision_diagnostics.evening; eveningLearned = null; await loadEveningShare(); var same = storeEveningShare(); monthlyRef = new Date(2026, 11, 1); eveningLearned = null; await loadEveningShare(); var dec = storeEveningShare(); monthlyRef = new Date(2026, 10, 1); return [e.evening, e.sellers, same, dec, (150 + e.evening) / (300 + e.sellers)]; })()")
    check('the validation keeps its evening count; December learns from it, November not from itself', ls[1] > 0 and ls[2] == 0.5 and abs(ls[3] - ls[4]) < 1e-9, ls)
    check('validated: "Validated", no dot, no Send again (nothing new to send)', s['chip'] == 'validated' and s['text'] == 'Validated' and not s['dot'] and 'No change since validation' in s['menu'] and 'Send again' not in s['menu'] and 'Validated by Admin T., 19 Oct' in s['menu'], s)
    pg.screenshot(path=OUT + '/reviews-admin-validated-1440.png')
    pg.evaluate("(()=>{var ds='2026-11-20',a=agents.find(x=>monthlyResult[ds][x.id]&&monthlyResult[ds][x.id].code==='O');planningOverrides[a.id]=Object.assign({},planningOverrides[a.id],{[ds]:'OFF'});renderMonthlyPlanning();})()"); pg.wait_for_timeout(300); s = st(pg)
    check('a change after validation: a dot on "Validated", Send again in the menu', s['dot'] and '1 change since validation' in s['menu'] and 'Send again' in s['menu'], s['menu'])
    pg.screenshot(path=OUT + '/reviews-admin-validated-changed-1440.png')
    check('admin cancels the validation (menu, window with a reason)', step(pg, menu_item(pg, 'Cancel validation...'), 'Clicked too fast')); s = st(pg)
    rv = [r for r in reviews(pg) if r['revision'] == 3][0]
    check('cancelled: "Cancelled", the history keeps the validation', s['chip'] == 'cancelled' and 'Validation cancelled by Admin T., 19 Oct' in s['menu'] and 'Send again' in s['menu']
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
    # 6. Manager: the cancel is new for him, the month is his again; no status on the Intraday
    ctx, pg, errs = page('julie@test.fr'); load_store(pg); s = st(pg)
    check('manager: bell 1 (cancelled), "Cancelled" with the reason, he can change the month', s['bell'] == '1' and s['chip'] == 'cancelled' and 'Clicked too fast' in s['menu'] and 'Send again' in s['menu'], s)
    click(pg, "td.c-day[data-agent][data-ds='2026-11-12']"); s = st(pg)
    check('cancelled: the cell editor opens', s['editor'], s); pg.evaluate("closeCellEditor()")
    pg.evaluate("(async()=>{ switchPlanningView('intraday'); await loadAndRenderIntraday('2026-11-12'); })()"); pg.wait_for_timeout(600)
    check('Intraday: no status', pg.evaluate("!document.querySelector('#intraday-card .rv-chip')"))
    check('no JavaScript error (manager, third visit)', not errs, errs[:2]); DB = db_of(pg); ctx.close()
    # 7. Many sendings: the queue is counted exactly, the list goes by pages; a long comment stays a short preview
    big = json.loads(json.dumps(DB))
    for k in range(130):
        big['retail_plan_reviews'].append({'id': 'bulk%d' % k, 'store_id': 's4', 'month': '2027-%02d' % (k % 12 + 1), 'revision': k + 2, 'status': 'pending' if k < 60 else 'validated',
            'submitted_plan': {}, 'reviewed_plan': None, 'comment': '', 'submitted_by': 'u3', 'submitted_by_name': 'Admin T.', 'submitted_at': '2026-10-%02dT08:00:00Z' % (k % 18 + 1),
            'decided_by': None, 'decided_by_name': '', 'decided_at': None, 'history': []})
    rv3 = [r for r in big['retail_plan_reviews'] if r['store_id'] == 'bm' and r['revision'] == 3][0]; rv3['comment'] = 'Long comment. ' * 150
    keep = DB; DB = big
    ctx, pg, errs = page('admin@test.fr'); load_store(pg); s = st(pg)
    check('60 waiting: the queue says 60 (exact count, not the 50 loaded)', s['nav'] == '60', s['nav'])
    pg.hover('#rv-status .rv-chip'); pg.wait_for_timeout(200)
    tip = pg.evaluate("(()=>{const r=document.getElementById('rv-tip').getBoundingClientRect();return [r.top,r.bottom,r.height,innerHeight,document.getElementById('rv-tip').hidden]})()")
    check('a 2,000-character comment: a short preview inside the screen', not tip[4] and tip[1] <= tip[3] and tip[2] <= 80, tip)
    pg.mouse.move(5, 5); pg.focus('#rv-status .rv-chip'); pg.wait_for_timeout(100)
    check('the preview also shows on keyboard focus, Escape hides it', pg.evaluate("!document.getElementById('rv-tip').hidden") and (pg.keyboard.press('Escape') or True) and pg.evaluate("document.getElementById('rv-tip').hidden"))
    pg.evaluate("reviewFilter='all';reviewPage=1;switchTab('reviews', document.getElementById('nav-reviews'))"); pg.wait_for_timeout(600)
    n1 = pg.evaluate("document.querySelectorAll('#review-list tbody tr').length"); click(pg, '.rv-more button'); pg.wait_for_timeout(400)
    n2 = pg.evaluate("document.querySelectorAll('#review-list tbody tr').length")
    check('136 sendings: 100 shown, Show more gives the rest', n1 == 100 and n2 == len(big['retail_plan_reviews']) and not pg.evaluate("!!document.querySelector('.rv-more')"), (n1, n2))
    check('no JavaScript error (many sendings)', not errs, errs[:2]); ctx.close(); DB = keep
    # 8. Screens: phone and dark mode
    DB['retail_plan_reviews'].append({'id': 'rvx', 'store_id': 'bm', 'month': '2026-12', 'revision': 1, 'status': 'pending', 'submitted_plan': {}, 'reviewed_plan': None,
        'comment': '', 'submitted_by': 'u1', 'submitted_by_name': 'Julie M.', 'submitted_at': '2026-10-19T08:00:00Z', 'decided_by': None, 'decided_by_name': '', 'decided_at': None, 'history': []})
    for email, w, dark, tag in [('claire@test.fr', 390, False, 'director-review-390'), ('claire@test.fr', 1440, True, 'director-review-dark-1440'),
                                ('julie@test.fr', 390, True, 'manager-pending-dark-390'), ('julie@test.fr', 320, False, 'manager-pending-320')]:
        ctx, pg, errs = page(email, w, dark); load_store(pg); pg.evaluate("(async()=>{ monthlyRef=new Date(2026,11,1); updateMonthlyLabel(); await loadMonthReview(); renderMonthlyPlanning(); monthReview.submitted_plan=JSON.parse(JSON.stringify(monthlyResult)); renderReviewStatus(); })()"); pg.wait_for_timeout(500)
        pg.screenshot(path=OUT + '/reviews-' + tag + '.png')
        check('screen ' + tag + ': fits, no error', pg.evaluate('document.documentElement.scrollWidth') <= w and not errs, errs[:1])
        pg.evaluate("document.querySelector('#rv-status .rv-chip').click()"); pg.wait_for_timeout(200)
        r = pg.evaluate("(()=>{const m=document.querySelector('#rv-status .rv-menu').getBoundingClientRect();return [m.left,m.right,innerWidth]})()")
        pg.screenshot(path=OUT + '/reviews-' + tag + '-menu.png')
        check('screen ' + tag + ': the status menu stays on screen', r[0] >= 0 and r[1] <= r[2], r)
        pg.evaluate("closeReviewMenus(); openReviewDialog(canDecideReview() ? 'decide' : 'withdraw')"); pg.wait_for_timeout(200)
        pg.screenshot(path=OUT + '/reviews-' + tag + '-dialog.png'); ctx.close()
    b.close()
json.dump(res, open(OUT + '/reviews-results.json', 'w'), indent=1)
print(len(res), 'checks,', len(fails), 'failures')
sys.exit(1 if fails else 0)
