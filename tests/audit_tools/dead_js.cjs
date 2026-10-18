// Reachability of top-level functions and globals (acorn). Entry: top-level statements, HTML attributes, strings with "name(".
const fs=require('fs'),acorn=require('acorn'),walk=require('acorn-walk');
const src=fs.readFileSync(process.argv[2],'utf8');
const scripts=[...src.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const js=scripts.join('\n;\n');
const ast=acorn.parse(js,{ecmaVersion:2022,sourceType:'script',allowReturnOutsideFunction:true});
const html=src.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style>[\s\S]*?<\/style>/g,'');
const fns=new Map(); // name -> node
const globals=new Map();
for(const st of ast.body){
  if(st.type==='FunctionDeclaration') fns.set(st.id.name,st);
  if(st.type==='VariableDeclaration') st.declarations.forEach(d=>{ if(d.id.type==='Identifier') globals.set(d.id.name,d); });
}
// refs per function body + top-level refs
function idsIn(node){ const out=new Set(); walk.full(node,n=>{ if(n.type==='Identifier') out.add(n.name); if(n.type==='Literal'&&typeof n.value==='string'){ for(const m of n.value.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) out.add(m[1]); } if(n.type==='TemplateElement'){ for(const m of n.value.raw.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) out.add(m[1]); } }); return out; }
const fnRefs=new Map(); for(const [n,node] of fns) fnRefs.set(n,idsIn(node.body));
const roots=new Set();
for(const st of ast.body){ if(st.type!=='FunctionDeclaration') idsIn(st).forEach(x=>roots.add(x)); }
for(const m of html.matchAll(/on\w+="([^"]*)"/g)) for(const k of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) roots.add(k[1]);
// test harness entry points used by probes count as external, not as live code
const live=new Set(); const stack=[...roots].filter(x=>fns.has(x));
while(stack.length){ const f=stack.pop(); if(live.has(f)) continue; live.add(f); for(const r of fnRefs.get(f)) if(fns.has(r)&&!live.has(r)) stack.push(r); }
const dead=[...fns.keys()].filter(f=>!live.has(f));
// globals used anywhere outside their declaration
const allIds=new Map(); walk.full(ast,n=>{ if(n.type==='Identifier') allIds.set(n.name,(allIds.get(n.name)||0)+1); });
const deadGlobals=[...globals.keys()].filter(g=>(allIds.get(g)||0)<=1 && !html.includes(g));
// function sizes
const lines=n=>js.slice(n.start,n.end).split('\n').length;
const sizes=[...fns].map(([n,node])=>[lines(node),n]).sort((a,b)=>b[0]-a[0]).slice(0,15);
// unused params? skip. Duplicate function bodies (same text)
const byText=new Map(); for(const [n,node] of fns){ const t=js.slice(node.body.start,node.body.end).replace(/\s+/g,' '); if(t.length>120){ (byText.get(t)||byText.set(t,[]).get(t)).push(n); } }
const dupBodies=[...byText.values()].filter(v=>v.length>1);
console.log(JSON.stringify({functions:fns.size,dead,deadGlobals,sizes,dupBodies},null,1));
