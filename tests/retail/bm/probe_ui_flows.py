# Click-through of the main actions (9.5.0.4 functional test), on two builds with the same fictional data.
# After each step: what the screen shows (hash of the page), the writes sent to the base, the message shown and the
# JavaScript errors. Two builds that only differ by code clean-up must give the same answers at every step.
# Usage: python3 probe_ui_flows.py <old build> <new build>. Writes screens/ui-flows.json. Exit 1 on any difference.
import sys, os, json, shutil, tempfile, http.server, threading, functools, datetime
from playwright.sync_api import sync_playwright
B = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(B + '/../../..')
stub = open(B + '/stub_supabase_rec.js').read(); setup = open(B + '/setup.js').read()
SEEN = "try{localStorage.setItem('cora_help_seen',JSON.stringify({monthly:true,intraday:true,dashboard:true,labor:true,hours:true,breaks:true,corners:true,shifts:true,sunday:true,fairness:true,reinf:true,agents:true,traffic:true,calendar:true}))}catch(e){}"
STATE = """(() => { const h = s => { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return x; };
  // Left out: the validation controls (10.0.0.0) and the counters, which moved from the planning to the Client
  // Advisor count (10.0.0.1; their values are compared apart). The line under the title is read on its own.
  const main = document.getElementById('main').cloneNode(true);
  const meta = ['monthly-meta', 'intraday-meta'].map(id => (document.getElementById(id) || {}).textContent || '').join('|');
  main.querySelectorAll('#btn-submit-review, #btn-decide-review, #btn-withdraw-review, #review-banner, .rv-chip-wrap, .bell-wrap, #tab-reviews, .c-rh, .ca-card, #monthly-meta, #intraday-meta, colgroup').forEach(e => e.remove());
  main.querySelectorAll('.plan-tabs').forEach(e => e.replaceWith(...e.childNodes));
  const open = [...document.querySelectorAll('.modal-overlay.open, #cell-editor, #leave-popup, #week-picker-popup, .more-menu.open, .mission-menu, #lang-menu.open')]
    .filter(e => e.offsetParent !== null || getComputedStyle(e).display !== 'none').map(e => e.id || e.className).sort();
  // Each write: table, method, the rows sent (hashed; Labor rules without the two call-centre rules no longer saved), filters
  const drop = r => r && r.rule_key !== 'aht_tasks' && r.rule_key !== 'trend_pct';
  const w = window.__writes.splice(0).map(x => [x[0], x[1], x[2] && h(JSON.stringify(x[0] === 'retail_regulations' ? [].concat(x[2]).filter(drop) : x[2])), x[3]]);
  return { page: h(main.textContent.replace(/\s+/g, ' ')) + '/' + main.querySelectorAll('*').length + '/' + h(meta), open, writes: w,
    toast: window.__toasts.splice(0).join(' | '), theme: document.documentElement.dataset.theme || '', lang: CURRENT_LANG }; })()"""
# Reads return nothing in this stub, so a reload after a save empties the store: the fixture is put back
SETUP_AGAIN = setup + ";agentLeaves.forEach((l,i)=>l.id=l.id||('lv'+i));calMonth=new Date(2026,10,1);"
STEPS = [
  ('monthly', "switchPlanningView('monthly'); renderMonthlyPlanning();", None),
  ('corner LG', "switchCornerView(storeCorners[0].id);", None),
  ('corner all', "switchCornerView(null);", None),
  ('cell editor', None, "td.c-day[data-agent][data-ds='2026-11-10']"),
  ('cell to OFF', None, "#ce-body .ce-opt >> text=OFF"),
  ('cell editor 2', None, "td.c-day[data-agent][data-ds='2026-11-12'] >> nth=3"),
  ('cell to C', None, "#ce-body .ce-opt >> text=C >> nth=0"),
  ('event editor', "openEventEditor(null, 'local', '2026-11-20');", None),
  ('event saved', "document.getElementById('evt-label-input').value = 'Private sale'; saveEvent();", None),
  ('month next', "document.querySelector('#tab-planning .month-nav .btn:last-child').click();", None),
  ('month back', "document.querySelector('#tab-planning .month-nav .btn:first-child').click();", None),
  ('download menu', None, "#tab-planning .head-actions button:has-text('Download')"),
  ('intraday', "closeExportMenu && closeExportMenu(); switchPlanningView('intraday'); renderIntraday('2026-11-12');", None),
  ('intraday next day', None, "#tab-planning .head-actions .month-nav button:last-child >> visible=true"),
  ('mission menu', None, ".it-track .it-shift >> nth=3"),
  ('mission added', "missionMenuState.type = 'wel'; addMissionFromMenu();", None),
  ('traffic', "switchTab('traffic', document.querySelector('[onclick*=\"switchTab(\\'traffic\"]')); renderTraffic();", None),
  ('traffic typed', "var i = document.querySelector('#tab-traffic input[type=number], #tab-traffic input'); i.value = '12000'; i.dispatchEvent(new Event('change', { bubbles: true }));", None),
  ('advisors', "switchTab('agents', document.querySelector('[onclick*=\"switchTab(\\'agents\"]')); renderAgents();", None),
  ('agent editor', "openAgentEditor(agents[10].id);", None),
  ('agent hours 35', "var h = document.getElementById('ae-hours'); h.value = '35'; h.dispatchEvent(new Event('change', { bubbles: true }));", None),
  ('agent closed', "closeAgentEditor();", None),
  ('agent added', "document.getElementById('new-first-name').value = 'New'; document.getElementById('new-last-name').value = 'Person'; addAgent();", None),
  ('absence page', SETUP_AGAIN + "switchCalendarNav('monthly', document.querySelector('[data-calview=monthly]')); renderCalendar();", None),
  ('leave popup', None, ".cal-agent-item >> nth=2"),
  ('leave saved', "document.getElementById('leave-start').value = '2026-11-16'; document.getElementById('leave-end').value = '2026-11-18'; saveLeave();", None),
  ('settings', SETUP_AGAIN + "renderRegulations(); switchSettingsView('store', true);", None),
  ('opening 11:00', "var s = document.getElementById('reg-open-mon'); s.value = s.options[Math.min(2, s.options.length - 1)].value; s.dispatchEvent(new Event('change', { bubbles: true }));", None),
  ('corner row', "addCornerRow();", None),
  ('staffing', "switchSettingsView('staffing', true);", None),
  ('fairness toggle', None, "#fairness-toggle"),
  ('breaks', "switchSettingsView('breaks', true); addBreakRow();", None),
  ('week picker', None, "#week-label"),
  ('week picker next', None, ".wkp-nav >> nth=1"),
  ('week picked', None, "#wkp-grid [onclick^=pickWeek] >> nth=10"),
  ('language jp', "switchLang('jp');", None),
  ('language en', "switchLang('en');", None),
  ('theme', None, ".theme-sw"),
  ('account menu', None, "#acct-btn"),
  ('password', None, "#acct-menu >> text=Change password"),
  ('password saved', "document.getElementById('pw-cur').value = 'old-pass'; document.getElementById('pw-new').value = 'newpass1'; document.getElementById('pw-new2').value = 'newpass1'; savePassword();", None),
]
def run(build, w):
    U = tempfile.mkdtemp(); shutil.copy(build, U + '/index.html')
    for d in ('logo', 'i18n', 'image homepage'): shutil.copytree(R + '/' + d, U + '/' + d)
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=U)); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    out = []
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={'width': w, 'height': 900}, is_mobile=w < 800, has_touch=w < 800)
        ctx.add_init_script(SEEN + "try{localStorage.setItem('cast_theme','light')}catch(e){}")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
        pg.clock.set_fixed_time(datetime.datetime(2026, 10, 18, 12, 0))
        pg.route('**/*', lambda r: r.fulfill(body=stub, content_type='application/javascript') if 'supabase-js' in r.request.url else r.fulfill(body='[]', content_type='application/json') if 'nager' in r.request.url else (r.continue_() if '127.0.0.1' in r.request.url else r.abort()))
        pg.goto('http://127.0.0.1:%d/index.html' % port); pg.wait_for_timeout(900)
        pg.evaluate(setup); pg.evaluate("holidaysCountry=currentCountryIso||'FR';holidaysLoaded={2026:true};calMonth=new Date(2026,10,1);agentLeaves.forEach((l,i)=>l.id=l.id||('lv'+i));renderCornerTabs();window.__writes.length=0;window.__toasts=[];var st0=showToast;showToast=function(m){window.__toasts.push(String(m));return st0.apply(this,arguments);};")
        for name, js, sel in STEPS:
            e0 = len(errs)
            try:
                if js: pg.evaluate(js)
                if sel: pg.locator(sel).first.evaluate('el => el.click()', timeout=3000)
                note = ''
            except Exception as e: note = 'step failed: ' + str(e).split('\n')[0][:120] + ' (' + str(pg.evaluate('s => document.querySelectorAll(s).length', sel.split(' >> ')[0]) if sel else '') + ' found)'
            pg.wait_for_timeout(900)
            st = pg.evaluate(STATE); st.update(step=name, note=note, errors=errs[e0:])
            out.append(st)
        b.close()
    srv.shutdown(); return out
# Known change in 9.5.0.4: the two unused rules from the call-centre version (aht_tasks, trend_pct) are no longer saved (see STATE)
def norm(ws): return ws
res = {}; fails = []
for w in (1440, 390):
    a, bb = run(sys.argv[1], w), run(sys.argv[2], w)
    for x, y in zip(a, bb):
        same = {k: (norm(x[k]) == norm(y[k]) if k == 'writes' else x[k] == y[k]) for k in ('page', 'open', 'writes', 'toast', 'theme', 'lang', 'note')}
        ok = all(same.values()) and not y['errors'] and not y['note']
        res.setdefault(str(w), []).append({'step': y['step'], 'pass': ok, 'diff': [k for k, v in same.items() if not v], 'new': y, 'old': x if not ok else None})
        if not ok: fails.append((w, y['step']))
        print(w, y['step'].ljust(18), 'OK ' if ok else 'FAIL', y['writes'] if y['writes'] else '', y['toast'][:50], y['note'], y['errors'][:1])
os.makedirs(B + '/screens', exist_ok=True); json.dump(res, open(B + '/screens/ui-flows.json', 'w'), indent=1)
print(sum(len(v) for v in res.values()), 'steps,', len(fails), 'failures', fails)
sys.exit(1 if fails else 0)
