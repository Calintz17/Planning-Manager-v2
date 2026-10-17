const vm=require('vm'),fs=require('fs');const {context}=require('../review_9362/runner.cjs');
const c=context('CAST_v9_4_0_0_RETAIL_TEST.html');
const result=JSON.parse(vm.runInContext(`JSON.stringify((()=>{
 const r=pickMonthlyPlan();const cells=JSON.parse(JSON.stringify(r.cells));
 const days=Object.keys(cells).sort().map(ds=>({ds,date:new Date(ds+'T12:00:00'),closure:getDayClosureType(ds),past:false}));
 const ctx={days,today:'2026-10-31',outside:()=>null};
 const original=finalCheck(cells,ctx);let selected;
 for(const ds of Object.keys(cells)){for(const a of agents){if(cells[ds][a.id]&&!cells[ds][a.id].special&&poolOf(a)==='sales'){selected={ds,id:a.id};break;}}if(selected)break;}
 delete cells[selected.ds][selected.id];const missing=finalCheck(cells,ctx);
 cells[selected.ds][selected.id]={code:'NONEXISTENT'};const invalid=finalCheck(cells,ctx);
 return {selected,original:{status:original.status,mandatory:original.mandatory.length},missing:{status:missing.status,unknown:missing.unknown,mandatory:missing.mandatory},invalid:{status:invalid.status,unknown:invalid.unknown,mandatory:invalid.mandatory}};
})())`,c,{timeout:180000}));
fs.writeFileSync(__dirname+'/validator-results.json',JSON.stringify(result,null,2));console.log(result);
