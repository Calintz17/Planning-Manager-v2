# Runs the BM bench on one CAST Retail build, with the clock fixed at 2026-10-31 12:00, for several settings.
# Usage: python3 run_bench.py ../../builds/CAST_v9_2_6_RETAIL.html   (needs Python Playwright with Chromium)
import sys, os, json, hashlib, shutil, tempfile, threading, functools, http.server, datetime
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
build = sys.argv[1]
sha = hashlib.sha256(open(build, 'rb').read()).hexdigest()
root = tempfile.mkdtemp(); shutil.copy(build, os.path.join(root, 'index.html'))
read = lambda f: open(os.path.join(HERE, f), encoding='utf-8').read()
stub, setup, check, official = read('stub_supabase.js'), read('setup.js'), read('check_rules.js'), read('official_nov2026_anonymized.json')
VARIANTS = {
  'base 5/5/10': '',
  '6/12/11, 45 h': 'regulations.max_days=6; regulations.max_consecutive_days=12; regulations.max_days_2weeks=11; regulations.weekly_hours=45;',
  'fixed 4 days, no hours': "agentPrefs['a22'].fixed_schedule={enabled:true,days:[1,2,3,4],start:0,end:0}; window.FX=fixedScheduleIssue(agentPrefs['a22'].fixed_schedule,'PART_TIME');",
  'fixed 5 x 08-18 already saved': "agents.find(x=>x.id==='a22').status='PART_TIME'; agentPrefs['a22'].fixed_schedule={enabled:true,days:[1,2,3,4,5],start:480,end:1080};",
}
# Agent editor, through the real save: a contract above Labor rules is refused and nothing is written
SAVE_TEST = '''(async () => {
  var writes = 0, from = sb.from; sb.from = function() { writes++; return from.apply(this, arguments); };
  async function trySave(days, start, end) {
    writes = 0; openAgentEditor('a22'); document.getElementById('ae-status').value = 'PART_TIME'; setPtType('fixed');
    renderDayChips(days, 'ae-fixed-days'); document.getElementById('ae-fixed-start').value = start; document.getElementById('ae-fixed-end').value = end;
    var ok = await saveAgentEditor(); agentEditorId = null;
    return { saved: ok, writes: writes, message: ok ? '' : document.getElementById('toast').textContent };
  }
  var r = { refused_5x08_18: await trySave([1,2,3,4,5], '08:00', '18:00'), accepted_4_days_no_hours: await trySave([1,2,3,4], '00:00', '00:00') };
  sb.from = from; return JSON.stringify(r);
})()'''
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=root)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
def route(r):
    u = r.request.url
    if 'supabase-js' in u: return r.fulfill(body=stub, content_type='application/javascript')
    if '127.0.0.1' not in u: return r.abort()
    return r.continue_()
print('build', os.path.basename(build), 'sha256', sha[:12])
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, pre in VARIANTS.items():
        pg = b.new_page(viewport={'width': 1440, 'height': 900}); errs = []
        pg.clock.set_fixed_time(datetime.datetime(2026, 10, 31, 12, 0))
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('**/*', route); pg.goto('http://127.0.0.1:%d/index.html' % port); pg.wait_for_timeout(700)
        pg.evaluate(setup); pg.evaluate('window.OFFICIAL=' + official)
        if pre: pg.evaluate(pre)
        r = json.loads(pg.evaluate(check)); fx = pg.evaluate('window.FX')
        lists = {k: v for k, v in r.items() if isinstance(v, list) and v}
        nov = {k: v for k, v in r['nov'].items() if v}
        print('\n==', name, '| clock', r['clock'], '| limits', r['limits'], '| match', r.get('match'))
        print('   breaches', lists or 'none', '| november gaps', nov or 'none', '| daily rest not checkable (next to OUT):', r['restUnknown'])
        if fx is not None: print('   fixed schedule check:', fx or 'accepted')
        if name.startswith('base'): print('   agent editor save:', pg.evaluate(SAVE_TEST))
        if errs: print('   page errors', errs[:3])
        pg.close()
    b.close()
