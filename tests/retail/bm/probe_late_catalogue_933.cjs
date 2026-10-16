// Pure source probe; no database or planning data.
// Usage: node tests/retail/bm/probe_late_catalogue_933.cjs [candidate.html]
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const file = process.argv[2] || path.resolve(__dirname, '../../builds/CAST_v9_3_3_RETAIL.html');
const source = fs.readFileSync(file, 'utf8');
const begin = source.indexOf('      var byStart = grid.slice().sort(');
const end = source.indexOf('      var nLate =', begin);
assert(begin >= 0 && end > begin, 'Classifier changed: update source probe');
const out = [2,3,4,5,7,17,28,30].map(n => {
  const c = vm.createContext({ grid: Array.from({ length:n }, (_,i) => ({code:'S'+i,startMin:480+15*i,endMin:990+15*i})) });
  vm.runInContext(source.slice(begin,end),c);
  return { catalogueSize:n, actual:Object.values(c.isLate).filter(Boolean).length, required:Math.ceil(n/4) };
});
console.log(JSON.stringify(out,null,2));
