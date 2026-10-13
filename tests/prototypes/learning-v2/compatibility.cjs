// Experimental metric on prepared, comparable targets; not a rules validator.
function vectorCompatibility(reference, generated) {
  const keys=new Set([...Object.keys(reference),...Object.keys(generated)]);
  let difference=0,total=0;
  for(const k of keys){const r=reference[k]??0,g=generated[k]??0;
    if(!Number.isFinite(r)||!Number.isFinite(g)||r<0||g<0)throw new Error('Invalid metric count');
    difference+=Math.abs(r-g);total+=r+g;
  }
  return total ? 100*(1-difference/total) : 100;
}
function functionalCompatibility(reference, generated, violations) {
  const weights={coverage:0.4,rest:0.3,shiftMix:0.2,corners:0.1};
  const components=Object.fromEntries(Object.keys(weights).map(k=>[k,vectorCompatibility(reference[k],generated[k])]));
  const score=Object.keys(weights).reduce((s,k)=>s+weights[k]*components[k],0);
  return {compliant:violations.length===0,score,components};
}
module.exports={vectorCompatibility,functionalCompatibility};
if(require.main===module){const assert=require('node:assert/strict');
  assert.equal(vectorCompatibility({monday:2,tuesday:0},{monday:0,tuesday:2}),0);
  assert.equal(vectorCompatibility({agentA:2,agentB:0},{agentA:0,agentB:2}),0);
  assert.equal(vectorCompatibility({O:5,C:5},{O:5,C:5}),100);
  assert.equal(vectorCompatibility({O:5,C:5},{O:10,C:0}),50);
  assert.throws(()=>vectorCompatibility({O:-1},{}));
  const r={coverage:{a:1},rest:{a:2},shiftMix:{O:5},corners:{a:1}};
  assert.equal(functionalCompatibility(r,r,['weekly-hours']).compliant,false);
  assert.equal(functionalCompatibility(r,r,[]).score,100);
  console.log('Compatibility metric: all checks passed.');
}
