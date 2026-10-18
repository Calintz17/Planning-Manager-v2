const assert=require('assert'),vm=require('vm'),fs=require('fs');
const {context}=require('./runner.cjs');
const file=process.argv[2]||'CAST_v9_3_62_RETAIL_TEST.html';
function probe(kind){
 const c=context(file);c.kind=kind;
 return JSON.parse(vm.runInContext(`JSON.stringify((()=>{
 const id=agents[0].id;
 regulations.weekly_hours=0; regulations.max_days=7;
 regulations.max_consecutive_days=5; regulations.max_days_2weeks=14;
 regulations.max_daily_hours=0; regulations.rest_gap_hours=11;
 agentLeaves=[];planningOverrides={};planningOverrides[id]={};
 if(kind.startsWith('rest')){
 RETAIL_SHIFTS.sales.push({code:'X',startMin:720,endMin:kind==='restSafe'?1350:1380,tone:'close'});
 planningOverrides[id]['2026-11-30']='X';
 planningOverrides[id]['2026-12-01']='O';
 }else{
 for(let d=25;d<=30;d++)planningOverrides[id]['2026-11-'+d]=d===25?'OFF':'O';
 planningOverrides[id]['2026-12-01']='O';
 if(kind==='nextOnly'){planningOverrides[id]['2026-11-30']='OFF';for(let d=1;d<=6;d++)planningOverrides[id]['2026-12-0'+d]='O';}
 if(kind==='runSafe')planningOverrides[id]['2026-12-01']='OFF';
 }
 const r=computeMonthlyPlan({habits:false});
 return {id,key:(kind.startsWith('rest')?'rest|':'row|')+id+'|2026-12-01',issues:r.issues,last:r.cells['2026-11-30'][id]};
})())`,c,{timeout:180000}));
}
const out={};for(const kind of ['rest','run','restSafe','runSafe','nextOnly']){const r=probe(kind);out[kind]={key:r.key,violation:r.issues[r.key]||0,last:r.last,nextMonthRows:Object.keys(r.issues).filter(k=>k.startsWith('row|'+r.id+'|2026-12'))};}
if(file.includes('63')){assert.strictEqual(out.rest.violation,30);assert.strictEqual(out.run.violation,1);assert.strictEqual(out.restSafe.violation,0);assert.strictEqual(out.runSafe.violation,0);assert.deepStrictEqual(out.nextOnly.nextMonthRows,[]);}
console.log(JSON.stringify(out,null,2));fs.writeFileSync(__dirname+'/results/'+require('path').basename(file).replace('.html','')+'-boundaries.json',JSON.stringify(out,null,2));
