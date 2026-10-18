const fs=require('fs'),postcss=require('postcss'),sp=require('postcss-selector-parser');
const src=fs.readFileSync(process.argv[2],'utf8');
const css=src.slice(src.indexOf('<style>')+7,src.indexOf('</style>'));
const rest=src.slice(src.indexOf('</style>'));
const root=postcss.parse(css);
const ctx=n=>{const a=[];let p=n.parent;while(p&&p.type!=='root'){if(p.type==='atrule')a.unshift('@'+p.name+' '+p.params);p=p.parent;}return a.join(' ');};
// tokens present outside the CSS (HTML, JS strings)
const words=new Set(rest.match(/[A-Za-z_][\w-]*/g));
const prefixes=[...rest.matchAll(/['"\s]([a-z][\w]*-)'\s*\+/g)].map(m=>m[1]); // 'sh-' + x
const unused=[], decl=new Map(), deadDecl=[], sameRules=new Map();
root.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&/keyframes/.test(rule.parent.name)) return;
  const c=ctx(rule);
  rule.selectors.forEach(sel=>{
    const names=[];
    sp(s=>{s.walkClasses(x=>names.push(x.value));s.walkIds(x=>names.push(x.value));}).processSync(sel);
    const missing=names.filter(n=>!words.has(n)&&!prefixes.some(p=>n.startsWith(p)));
    if(missing.length) unused.push([sel,c,missing.join(','),rule.source.start.line]);
    const key=c+'|'+sel.trim();
    (sameRules.get(key)||sameRules.set(key,[]).get(key)).push(rule.source.start.line);
    rule.walkDecls(d=>{
      const k=key+'|'+d.prop;
      if(decl.has(k)){ const prev=decl.get(k); if(!(prev.important&&!d.important)) deadDecl.push([sel.trim(),c,d.prop,prev.line,d.source.start.line,prev.value===d.value?'same value':'overridden']); }
      decl.set(k,{line:d.source.start.line,important:d.important,value:d.value});
    });
  });
});
const repeated=[...sameRules].filter(([k,v])=>v.length>1).map(([k,v])=>[k,v.join('/')]);
console.log('rules',root.nodes.length,'| selectors with a class/id found nowhere else:',unused.length);
unused.forEach(u=>console.log('  UNUSED',u[3],u[0],u[1]?('['+u[1]+']'):'','->',u[2]));
console.log('declarations overridden later by the same selector in the same context:',deadDecl.length);
deadDecl.forEach(d=>console.log('  DEAD',d[3],'->',d[4],d[0],d[1]?('['+d[1]+']'):'',d[2],d[5]));
console.log('selectors written in several rules (same context):',repeated.length);
repeated.forEach(r=>console.log('  REPEAT',r[1],r[0]));
