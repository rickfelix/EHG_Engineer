const fs = require('fs');
const path = require('path');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
console.log('suites total=%d passed=%d failed=%d', r.numTotalTestSuites, r.numPassedTestSuites, r.numFailedTestSuites);
console.log('tests total=%d passed=%d failed=%d pending=%d todo=%d', r.numTotalTests, r.numPassedTests, r.numFailedTests, r.numPendingTests, r.numTodoTests);
console.log('success=%s startTime=%s', r.success, new Date(r.startTime).toISOString());
console.log('--- per file ---');
let sum = 0, dur = 0;
const rows = [];
for (const s of r.testResults) {
  const rel = path.relative(process.cwd(), s.name).split(path.sep).join('/');
  const p = s.assertionResults.filter(a => a.status === 'passed').length;
  const f = s.assertionResults.filter(a => a.status === 'failed').length;
  const k = s.assertionResults.filter(a => a.status === 'pending' || a.status === 'skipped').length;
  sum += s.assertionResults.length;
  dur += (s.endTime - s.startTime) || 0;
  rows.push({ file: rel, total: s.assertionResults.length, passed: p, failed: f, skipped: k, status: s.status });
  console.log(rel + ' :: total=' + s.assertionResults.length + ' pass=' + p + ' fail=' + f + ' skip=' + k + ' status=' + s.status);
  for (const a of s.assertionResults) {
    if (a.status === 'failed') console.log('    FAILED:', a.fullName, JSON.stringify(a.failureMessages));
  }
}
console.log('SUM assertions=%d  sum(file durations ms)=%d', sum, dur);
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(rows, null, 2));
