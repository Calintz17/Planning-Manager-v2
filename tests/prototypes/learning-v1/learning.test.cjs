const assert = require('node:assert/strict');
const {buildLearningModel} = require('./learning.js');
const records = [
  {agentId:'a',pool:'sales',date:'2026-10-05',state:'work',shift:'O',validated:true},
  {agentId:'a',pool:'sales',date:'2026-10-12',state:'off',validated:true},
  {agentId:'b',pool:'sales',date:'2026-10-05',state:'work',shift:'C',validated:true}
];
const empty = buildLearningModel([], '2026-11-01');
assert.equal(empty.presence('new','sales',1),0.5);
assert.equal(empty.shift('new','sales',1,'O',2),0.5);
const model = buildLearningModel(records, '2026-11-01');
assert.equal(model.observations,3);
assert(model.shift('a','sales',1,'O',2)>model.shift('a','sales',1,'C',2));
assert.throws(()=>buildLearningModel([...records,records[0]],'2026-11-01'),/Duplicate/);
const ignored = [...records,
  {agentId:'a',pool:'sales',date:'2026-11-02',state:'work',shift:'C',validated:true},
  {agentId:'a',pool:'sales',date:'2026-10-19',state:'work',shift:'C',validated:false},
  {agentId:'a',pool:'sales',date:'2026-10-26',state:'leave',validated:true}];
const unchanged=buildLearningModel(ignored,'2026-11-01');
assert.equal(unchanged.observations,3);
assert.equal(unchanged.presence('a','sales',1),model.presence('a','sales',1));
assert.equal(unchanged.shift('a','sales',1,'O',2),model.shift('a','sales',1,'O',2));
console.log('Learning model: all checks passed.');
