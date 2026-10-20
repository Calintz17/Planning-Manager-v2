# 10.0.0.8 in a real browser (Roman 20-10): special shift from the cell editor, who changed a square (computer only),
# corner headcount lines, PDF without Coverage and Client Advisor count, manual move to another corner in the Intraday,
# Share / Download menus closed by a touch elsewhere on a phone. Light and dark. Usage: python3 probe_10008.py [build]
import sys, os, json, shutil, tempfile, http.server, threading, functools, datetime
from playwright.sync_api import sync_playwright
B = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(B + '/../../..')
build = sys.argv[1] if len(sys.argv) > 1 else R + '/tests/builds/CAST_RETAIL_TEST.html'
stub = open(B + '/stub_supabase_rec.js').read(); setup = open(B + '/setup.js').read()
SEEN = "try{localStorage.setItem('cora_help_seen',JSON.stringify({monthly:true,intraday:true,dashboard:true,labor:true,hours:true,breaks:true,corners:true,shifts:true,sunday:true,fairness:true,reinf:true,agents:true,traffic:true,calendar:true}))}catch(e){}"
OUT = B + '/screens'; os.makedirs(OUT, exist_ok=True)
U = tempfile.mkdtemp(); shutil.copy(build, U + '/index.html')
for d in ('logo', 'i18n', 'image homepage'): shutil.copytree(R + '/' + d, U + '/' + d)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=U)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []
def check(name, ok, info=''):
    res.append((name, bool(ok))); print('OK  ' if ok else 'FAIL', name, '' if ok else info)
def page(b, w, dark=False):
    ctx = b.new_context(viewport={'width': w, 'height': 900 if w > 800 else 844}, is_mobile=w < 800, has_touch=w < 800, device_scale_factor=1 if w > 800 else 2)
    ctx.add_init_script(SEEN + "try{localStorage.setItem('cast_theme','%s')}catch(e){}" % ('dark' if dark else 'light'))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
    pg.clock.set_fixed_time(datetime.datetime(2026, 10, 19, 12, 0))
    pg.route('**/*', lambda r: r.fulfill(body=stub, content_type='application/javascript') if 'supabase-js' in r.request.url else r.fulfill(body='[]', content_type='application/json') if 'nager' in r.request.url else (r.continue_() if '127.0.0.1' in r.request.url else r.abort()))
    pg.goto('http://127.0.0.1:%d/index.html' % port); pg.wait_for_timeout(900)
    pg.evaluate(setup); pg.evaluate("holidaysCountry=currentCountryIso||'FR';holidaysLoaded={2026:true};calMonth=new Date(2026,10,1);agentLeaves.forEach((l,i)=>l.id=l.id||('lv'+i));renderCornerTabs();me=me||{id:'u1',role:'admin'};me.name='Roman Test';"
                "document.getElementById('store-gate').classList.remove('show');document.body.classList.remove('gate-open');window.__writes.length=0;switchPlanningView('monthly');renderMonthlyPlanning();")
    pg.wait_for_timeout(500); return ctx, pg, errs
click = lambda pg, sel: (pg.locator(sel).first.evaluate('e => e.click()'), pg.wait_for_timeout(500))
with sync_playwright() as p:
    b = p.chromium.launch()
    for dark in (False, True):
        tag = 'dark' if dark else 'light'
        ctx, pg, errs = page(b, 1440, dark)
        sel = "td.c-day[data-agent][data-ds='2026-11-12'] >> nth=4"
        aid = pg.locator(sel).first.get_attribute('data-agent')
        click(pg, sel)
        check(tag + ': the cell editor has Special shift, its hours hidden', pg.evaluate("!!document.querySelector('#ce-body .sh-sp') && document.getElementById('ce-sp-row').hidden"))
        click(pg, "#ce-body .ce-opt:has(.sh-sp)")
        check(tag + ': Special shift opens start and end', pg.evaluate("!document.getElementById('ce-sp-row').hidden && !!document.querySelector('#ce-sp-start .hm-h') && !!document.querySelector('#ce-sp-end .hm-h')"))
        pg.evaluate("document.querySelector('#ce-sp-start .hm-h').value='7';document.querySelector('#ce-sp-start .hm-m').value='30';document.querySelector('#ce-sp-end .hm-h').value='22';document.querySelector('#ce-sp-end .hm-m').value='0';")
        pg.screenshot(path=OUT + '/10008-special-editor-%s.png' % tag)
        click(pg, "#ce-sp-row .btn"); pg.wait_for_timeout(800)
        w = pg.evaluate("window.__writes.filter(x=>x[0]==='retail_planning_overrides').map(x=>JSON.stringify(x[2]))")
        check(tag + ': saved as SP 450-1320, nothing refused', any('SP 450-1320' in x for x in w) and pg.evaluate("planningOverrides['%s']['2026-11-12']==='SP 450-1320'" % aid), (w, pg.evaluate("window.__toasts||[]")))
        td = pg.locator("td.c-day[data-agent='%s'][data-ds='2026-11-12']" % aid).first
        check(tag + ': the square shows SP', td.inner_text().strip().endswith('SP'), td.inner_text())
        # who and when on hover
        td.hover(); pg.wait_for_timeout(300)
        tip = pg.evaluate("(()=>{var t=document.querySelector('.ov-tip');return t&&!t.hidden?{txt:t.textContent,bg:getComputedStyle(t).backgroundColor,fg:getComputedStyle(t).color,h:t.getBoundingClientRect().height}:null})()")
        check(tag + ': hover shows the name and the date, small', tip and tip['txt'].startswith('Roman Test, ') and tip['h'] <= 26, tip)
        pg.screenshot(path=OUT + '/10008-hover-%s.png' % tag, clip={'x': 0, 'y': 150, 'width': 1440, 'height': 500})
        pg.locator("td.c-day[data-agent][data-ds='2026-11-03'] >> nth=6").first.hover(); pg.wait_for_timeout(200)
        check(tag + ': no tip on an automatic square', pg.evaluate("!document.querySelector('.ov-tip') || document.querySelector('.ov-tip').hidden"))
        # corner lines, PDF without coverage
        check(tag + ': one headcount line per corner', pg.evaluate("document.querySelectorAll('#mth-summary td.c-agent[data-no-i18n]').length===storeCorners.length"))
        check(tag + ': the PDF has no Coverage & headcount and no Client Advisor count', pg.evaluate("planningExportHtml('monthly').indexOf('pdf-cov-title')===-1 && planningExportHtml('monthly').indexOf('mth-summary')===-1"))
        # Intraday: move to another corner
        pg.evaluate("(async()=>{ switchPlanningView('intraday'); await loadAndRenderIntraday('2026-11-12'); })()"); pg.wait_for_timeout(900)
        # a seller of a corner, clicked on a free part of the shift bar
        k = pg.evaluate("[...document.querySelectorAll('#planning-intraday-body .it-track-add')].findIndex(t=>{var a=agents.find(x=>x.id===t.dataset.agent);return a&&poolOf(a)==='sales'})")
        tr = pg.locator('#planning-intraday-body .it-track-add').nth(k)
        bb = tr.locator('.it-shift').last.bounding_box()
        free = pg.evaluate("([k,x0,x1,y])=>{var t=document.querySelectorAll('#planning-intraday-body .it-track-add')[k];for(var x=x1-6;x>x0+4;x-=4){var e=document.elementFromPoint(x,y);if(e&&e.classList.contains('it-shift'))return x;}return null}", [k, bb['x'], bb['x'] + bb['width'], bb['y'] + bb['height'] / 2])
        pg.mouse.click(free, bb['y'] + bb['height'] / 2); pg.wait_for_timeout(400)
        n = pg.evaluate("document.querySelectorAll('#mission-menu [data-type^=\"reinf:\"]').length")
        check(tag + ': the Intraday menu lists the other corners', n == len(pg.evaluate("storeCorners")) - 1, n)
        pg.screenshot(path=OUT + '/10008-intraday-menu-%s.png' % tag)
        click(pg, '#mission-menu [data-type^="reinf:"]')
        check(tag + ': a corner asks for a duration', pg.evaluate("document.getElementById('mm-dur-fld').style.display!=='none'"))
        click(pg, '#mission-menu .btn-primary'); pg.wait_for_timeout(900)
        w = pg.evaluate("window.__writes.filter(x=>x[0]==='retail_intraday_missions').map(x=>JSON.stringify(x[2]))")
        check(tag + ': saved as a move (reinf:<corner>)', any('reinf:' in x for x in w), w)
        check(tag + ': no JavaScript error', not errs, errs[:2])
        ctx.close()
    # Phone: no tip; Share and Download close on a touch elsewhere
    ctx, pg, errs = page(b, 390)
    pg.evaluate("var a=agents[4].id;planningOverrides[a]=Object.assign({},planningOverrides[a],{'2026-11-12':'OFF'});overrideMeta[a]={'2026-11-12':{name:'Roman Test',at:'2026-10-19T10:00:00Z'}};renderMonthlyPlanning();")
    pg.locator("td.c-day[data-agent][data-ds='2026-11-12'] >> nth=4").first.tap(); pg.wait_for_timeout(300)
    check('phone: no tip', pg.evaluate("!document.querySelector('.ov-tip') || document.querySelector('.ov-tip').hidden"))
    pg.evaluate("closeCellEditor()")
    for label, opener in (('Download', "#tab-planning .head-actions button[title='Download']"), ('Share', "#tab-planning .head-actions button[title='Send']")):
        pg.locator(opener).first.tap(); pg.wait_for_timeout(500)
        opened = pg.evaluate("!!document.getElementById('export-menu')")
        pg.touchscreen.tap(200, 700); pg.wait_for_timeout(400)
        check('phone: %s menu closes on a touch elsewhere' % label, opened and not pg.evaluate("!!document.getElementById('export-menu')"))
    check('phone: no JavaScript error', not errs, errs[:2])
    ctx.close(); b.close()
srv.shutdown()
print(len(res), 'checks,', sum(1 for r in res if not r[1]), 'failures')
sys.exit(0 if all(r[1] for r in res) else 1)
