// Pure code probe. No database, browser, names or planning records.
// Usage: node tests/retail/bm/probe_shift_profile_933.cjs [path/to/candidate.html]
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const candidate = process.argv[2] || path.resolve(__dirname, '../../builds/CAST_v9_3_3_RETAIL.html');
const source = fs.readFileSync(candidate, 'utf8');
const begin = source.indexOf('      function floorOf(st, en) {');
const end = source.indexOf('      function addCov(', begin);
assert(begin >= 0 && end > begin, 'floorOf source not found; update probe if refactored');
const c = vm.createContext({ regulations: { breaks: [] }, floorCache: {},
  slots: Array.from({ length: 40 }, (_, i) => ({ t: 660 + i * 15 })) });
vm.runInContext(source.slice(begin, end), c);
const scored = (start, finish) => c.floorOf(start, finish).reduce((a, b) => a + b, 0) * 15;
const out = {
  window: '11:00-21:00', noBreaks: true,
  offGrid: { start: 710, end: 1220, expectedFloorMin: 510, scoredFloorMin: scored(710, 1220) },
  aligned: { start: 720, end: 1230, expectedFloorMin: 510, scoredFloorMin: scored(720, 1230) },
  // Analytic illustration of the implemented g + habit * abs(g): NOT a generated-planning result.
  habitIsNotJustATieBreak: { a: { gain: 10, habit: -0.3, score: 7 },
    b: { gain: 9, habit: 0.6, score: 14.4 }, selected: 'b despite its smaller raw gain' }
};
console.log(JSON.stringify(out, null, 2));
