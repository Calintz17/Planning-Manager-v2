const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
function locate(name){const local=path.resolve(__dirname,name);return fs.existsSync(local)?local:path.resolve(__dirname,name.endsWith('.html')?'../../../builds':'..',name);}
function makeContext(now='2026-08-31T12:00:00'){
 const NativeDate=Date;class Clock extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return new NativeDate(now).getTime();}}
 const nodes=new Map(),node=()=>({innerHTML:'',textContent:'',value:'',style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},setAttribute(){},getClientRects(){return []},querySelectorAll(){return []},querySelector(){return null}});
 let Input=function(){};Object.defineProperty(Input.prototype,'value',{get(){return ''},set(){}});
 const c=vm.createContext({console,Date:Clock,Math,Set,Map,JSON,Object,Array,Number,String,RegExp,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Blob,URL,setTimeout(){},clearTimeout(){},localStorage:{getItem(){return null},setItem(){}},HTMLInputElement:Input,NodeFilter:{SHOW_TEXT:4},supabase:{createClient(){return {}}},window:{addEventListener(){}},document:{removeEventListener(){},addEventListener(){},getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},querySelectorAll(){return []},querySelector(){return null},documentElement:{lang:'en',setAttribute(){}},body:node()},matchMedia(){return {matches:false,addEventListener(){}}}});
c.fixtureNodes=nodes;
 return c;
}

function context(file=process.argv[2]||'CAST_RETAIL_TEST.html',kind='bm'){
 const c=makeContext('2026-10-31T12:00:00');
 const src=fs.readFileSync(locate(file),'utf8');
 const js=[...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function renderMonthlyPlanning'))[1].replace(/^init\(\);$/m,'');
 vm.runInContext(js,c);
 c.sb={from(){const q={};for(const k of ['upsert','insert','delete','update','eq','select'])q[k]=()=>q;q.then=(ok,err)=>Promise.resolve({data:[],error:null}).then(ok,err);return q;}};
 vm.runInContext('sb.from = function '+c.sb.from.toString(),c);
 c.window.JP=kind==='jpB'?'B':'A';
 vm.runInContext(fs.readFileSync(locate(kind==='bm'?'setup.js':'setup_jp.js'),'utf8')+';savePlanSnapshot=async()=>{};attachCrossHighlight=()=>{};',c);
 return c;
}
module.exports={context};
if(require.main===module)(async()=>{
 const out={};
 for(const f of ['probe_pure_compute_9361.js','probe_mandatory_936.js']){const c=context();out[f]=JSON.parse(await vm.runInContext(fs.readFileSync(locate(f),'utf8'),c));}
 const c=context();const before=Object.fromEntries(Object.keys(c).filter(k=>typeof c[k]!=='function').map(k=>{try{return[k,JSON.stringify(c[k])]}catch{return[k,null]}}));
 vm.runInContext('computeMonthlyPlan({habits:true})',c);out.changedGlobals=Object.keys(before).filter(k=>{try{return before[k]!==JSON.stringify(c[k])}catch{return false}});
 assert.deepStrictEqual(out.changedGlobals,[]);
 for(const v of Object.values(out['probe_pure_compute_9361.js']))assert.strictEqual(v,true);
 assert.deepStrictEqual(out['probe_mandatory_936.js'].withSeller,{m1:'O',m2:'O',sa:'C'});
 assert.strictEqual(out['probe_mandatory_936.js'].sellerAbsent.m2,'C');
 assert.strictEqual(out['probe_mandatory_936.js'].bothLockedO.writes,1);
 fs.writeFileSync(path.join(__dirname,'results','runner.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
