# The Intraday screen and its Excel export come from one model (10.0.0.6): for every day of November, on both
# fictional stores, with all corners and with one corner shown, the screen rows and the export rows are the same people
# in the same order, with the same shift and the same blocks (start, length, type). Usage: python3 probe_intraday_model.py [build]
import sys, os, json, shutil, tempfile, http.server, threading, functools
from playwright.sync_api import sync_playwright
B = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(B + '/../../..')
build = sys.argv[1] if len(sys.argv) > 1 else R + '/tests/builds/CAST_RETAIL_TEST.html'
U = tempfile.mkdtemp(); shutil.copy(build, U + '/index.html')
for d in ('logo', 'i18n', 'image homepage'): shutil.copytree(R + '/' + d, U + '/' + d)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=U)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
stub = open(B + '/stub_supabase.js').read()
CHECK = """(() => { switchTab('planning'); switchPlanningView('monthly'); renderMonthlyPlanning(); const bad = []; let days = 0, rows = 0;
  const views = [null].concat(storeCorners.length > 1 ? [storeCorners[0].id] : []);
  views.forEach(view => { currentCornerView = view;
    for (let d = 1; d <= 30; d++) { const ds = '2026-11-' + String(d).padStart(2, '0'); switchPlanningView('intraday'); renderIntraday(ds);
      const x = intradayExport, dom = [...document.querySelectorAll('#planning-intraday-body .it-row')];
      if (!x) { if (dom.length) bad.push(ds + ' screen without export'); continue; }
      days++; rows += dom.length;
      if (dom.length !== x.rows.length) { bad.push(ds + ' rows ' + dom.length + ' vs ' + x.rows.length); continue; }
      const T0 = intradayAxis.T0, span = intradayAxis.T1 - intradayAxis.T0;
      dom.forEach((r, i) => { const e = x.rows[i], track = r.querySelector('.it-track');
        if (track.dataset.agent !== e.agentId) bad.push(ds + ' order ' + i);
        if (+track.dataset.smin !== Math.round(e.startH * 60) || +track.dataset.emin !== Math.round(e.endH * 60)) bad.push(ds + ' shift ' + e.agentId);
        const sb = [...r.querySelectorAll('.it-blk')].map(b => [Math.round((parseFloat(b.style.left) / 100 * span + T0) * 60), Math.round(parseFloat(b.dataset.dur) * 60)]).sort().join(';');
        const eb = e.blocks.map(b => [Math.round(b.start * 60), Math.round(b.dur * 60)]).sort().join(';');
        if (sb !== eb) bad.push(ds + ' blocks ' + e.agentId + ' ' + sb + ' | ' + eb); });
    } });
  currentCornerView = null; return { days, rows, bad: bad.slice(0, 5), nbad: bad.length }; })()"""
fails = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for setup in ('setup.js', 'setup_jp.js'):
        pg = b.new_page(viewport={'width': 1440, 'height': 900}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.route('**/*', lambda r: r.fulfill(body=stub, content_type='application/javascript') if 'supabase-js' in r.request.url else (r.continue_() if '127.0.0.1' in r.request.url else r.abort()))
        pg.goto('http://127.0.0.1:%d/index.html' % port); pg.wait_for_timeout(800); pg.evaluate(open(B + '/' + setup).read()); pg.wait_for_timeout(300)
        pg.evaluate("document.getElementById('store-gate').classList.remove('show');document.body.classList.remove('gate-open');")
        # a manual mission and a moved break, so the manual blocks are in the comparison too
        pg.evaluate("(()=>{ var a=agents.find(x=>poolOf(x)==='sales'); addedMissions[a.id]=[{id:'m1',type:'wel',start:15,dur:1}]; intradayOverrides[agents[0].id+':lun']=14*60; })()")
        r = pg.evaluate(CHECK); ok = r['nbad'] == 0 and r['days'] > 20 and not errs; fails += not ok
        print('OK ' if ok else 'FAIL', setup, json.dumps(r), errs[:1]); pg.close()
    b.close()
sys.exit(1 if fails else 0)
