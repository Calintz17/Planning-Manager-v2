const {context}=require('../review_9362/runner.cjs'),vm=require('vm'),fs=require('fs');
const out=[];
for(const month of [9,10,11]){
 const c=context('CAST_v9_4_0_1_RETAIL_TEST.html');
 vm.runInContext(`Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-09-30T12:00:00']));}};monthlyRef=new Date(2026,${month},1);`,c);
 const rows=JSON.parse(vm.runInContext(`JSON.stringify((()=>{const p=pickMonthlyPlan(),cells=p.cells,dates=Object.keys(cells).sort(),weeks={};
 for(const ds of dates){let d=new Date(ds+'T12:00:00');d.setDate(d.getDate()-((d.getDay()+6)%7));let wk=toDateStr(d);(weeks[wk]||(weeks[wk]=[])).push(ds);}
 const rows=[];for(const [wk,ds]of Object.entries(weeks)){if(ds.length!==7)continue;for(const a of agents){let counts={off:0,absence:0,training:0,worked:0,closed:0,unknown:0},paid=0;let codes=[];
 for(const date of ds){let r=(cells[date]||{})[a.id];codes.push(r?.code||'?');if(!r)counts.unknown++;else if(r.code==='OFF')counts.off++;else if(r.code==='OUT')counts.training++;else if(r.special==='leave'||r.code==='A')counts.absence++;else if(r.special==='closed')counts.closed++;else{counts.worked++;let h=ruleHours(a,date,r);paid+=h?h.paid:0;}}
 rows.push({month:dates[0].slice(0,7),week:wk,id:a.id,pool:poolOf(a),partTime:a.status==='PART_TIME',contract:contractHours(a),...counts,paid:paid/60,codes});}}
 return rows;})())`,c,{timeout:180000}));out.push(...rows);
 console.log('month',month+1,'complete');
}
fs.writeFileSync(__dirname+'/off-weeks-results.json',JSON.stringify(out,null,2));
const clean=out.filter(r=>!r.partTime&&!r.absence&&!r.training&&!r.closed&&!r.unknown);
for(const subset of [{name:'all',rows:out},{name:'full-time without absence/training/closure',rows:clean}]){let dist={};for(let r of subset.rows)dist[r.off]=(dist[r.off]||0)+1;console.log(subset.name,subset.rows.length,dist);}
console.log(JSON.stringify(clean.filter(r=>r.off!==2),null,2));
