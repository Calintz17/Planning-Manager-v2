# Sign in and store gate across sizes. Fictional accounts. Usage: python3 probe_mobile_login.py [build]
import sys, os, json, shutil, tempfile, http.server, threading, functools
from playwright.sync_api import sync_playwright
B=os.path.dirname(os.path.abspath(__file__)); R=os.path.abspath(B+'/../../..'); build=sys.argv[1] if len(sys.argv)>1 else R+'/tests/builds/CAST_RETAIL_TEST.html'
OUT=B+'/screens'; os.makedirs(OUT, exist_ok=True)
U=tempfile.mkdtemp(); shutil.copy(build,U+'/index.html'); shutil.copytree(R+'/logo',U+'/logo'); shutil.copytree(R+'/image homepage',U+'/image homepage')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Q,directory=U)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
stub=open(B+'/stub_supabase_auth.js').read()
DB={'retail_regions':[{'id':'r1','name':'EMEA'}],'retail_countries':[{'id':'fr','region_id':'r1','name':'France'},{'id':'uk','region_id':'r1','name':'United Kingdom'}],
 'retail_stores':[{'id':'s1','country_id':'fr','name':'Store One'},{'id':'s2','country_id':'fr','name':'Store Two'}],
 'retail_profiles':[{'user_id':'u1','email':'manager.two@test.fr','full_name':'Manager Two','role':'manager','active':True},{'user_id':'u2','email':'director.emea@test.fr','full_name':'Director Emea','role':'director','region_id':'r1','active':True}],
 'retail_profile_stores':[{'user_id':'u1','store_id':'s1'},{'user_id':'u1','store_id':'s2'}]}
users={'m':{'id':'u1','email':'manager.two@test.fr','user_metadata':{}},'d':{'id':'u2','email':'director.emea@test.fr','user_metadata':{}}}
res=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for (w,h,touch) in [(1440,900,False),(390,844,True),(320,568,True),(740,360,True),(820,1180,True)]:
        for dark in (False,True):
            for who in (None,'d','m'):
                ctx=b.new_context(viewport={'width':w,'height':h},has_touch=touch,is_mobile=touch and w<800,device_scale_factor=2 if touch else 1)
                cfg={'db':DB,'accounts':[{'email':'manager.two@test.fr','password':'admin','user':users['m']}],'sessionUser':users.get(who)}
                ctx.add_init_script('window.__AUTH='+json.dumps(cfg)+';'+("try{localStorage.setItem('cast_theme','dark')}catch(e){}" if dark else ''))
                pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
                def route(r):
                    u=r.request.url
                    if 'supabase-js' in u: return r.fulfill(body=stub,content_type='application/javascript')
                    if '127.0.0.1' not in u: return r.abort()
                    return r.continue_()
                pg.route('**/*',route); pg.goto('http://127.0.0.1:%d/index.html'%port); pg.wait_for_timeout(900)
                sel = '#login-gate .gate-card' if who is None else '#store-gate .gate-card'
                m=pg.evaluate("""(sel)=>{const c=document.querySelector(sel).getBoundingClientRect();
                  const f=[...document.querySelectorAll(sel+' input, '+sel+' select, '+sel+' button')].filter(e=>e.offsetParent).map(e=>[e.tagName,Math.round(parseFloat(getComputedStyle(e).fontSize)),Math.round(e.getBoundingClientRect().height)]);
                  return {docW:document.documentElement.scrollWidth, card:[Math.round(c.left),Math.round(c.right),Math.round(c.top),Math.round(c.bottom)], fields:f,
                   bg:getComputedStyle(document.getElementById('login-gate')).backgroundImage.slice(0,40)}}""", sel)
                tag=f"{'login' if who is None else ('director' if who=='d' else 'manager2')}-{'dark' if dark else 'light'}-{w}x{h}"
                pg.screenshot(path=OUT+'/'+tag+'.png')
                if who is None and touch:
                    pg.tap('#login-email'); pg.wait_for_timeout(200)
                    m['zoom']=pg.evaluate('visualViewport.scale')
                    # scroll to the button: reachable even on a short landscape screen
                    pg.evaluate("document.getElementById('login-btn').scrollIntoView({block:'center'})")
                    bb=pg.evaluate("(()=>{const r=document.getElementById('login-btn').getBoundingClientRect();return [r.top,r.bottom,innerHeight]})()"); m['btn']=bb
                res.append({'tag':tag,'m':m,'errs':errs}); ctx.close()
    b.close()
for r in res:
    m=r['m']; small=[f for f in m['fields'] if ('zoom' in m or 'manager' in r['tag'] or 'director' in r['tag']) and r['tag'].split('-')[-1]!='1440x900' and f[1]<16 and f[0]!='BUTTON']
    w=int(r['tag'].split('-')[-1].split('x')[0])
    flag=[]
    if m['docW']>w: flag.append('overflow')
    if m['card'][0]<0 or m['card'][1]>w: flag.append('card out')
    if small: flag.append('small fields %s'%small)
    if m.get('zoom',1)!=1: flag.append('zoom %s'%m['zoom'])
    if 'btn' in m and (m['btn'][0]<0 or m['btn'][1]>m['btn'][2]): flag.append('button hidden')
    if r['errs']: flag.append('js %s'%r['errs'][:1])
    print(r['tag'], 'OK' if not flag else flag, m['card'], m['fields'][:3])
