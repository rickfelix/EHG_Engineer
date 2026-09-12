const fs = require('fs');
const SEP = String.fromCharCode(92);
const r = JSON.parse(fs.readFileSync('.artifacts/testing-evidence/runA-results.json','utf8'));
const ran = (r.testResults||[]).map(t => String(t.name).split(SEP).join('/'));
const req = fs.readFileSync('.artifacts/testing-evidence/filelist-A.txt','utf8').trim().split('\n').map(s=>s.trim()).filter(Boolean);
console.log('ran count:', ran.length, 'requested:', req.length);
for (const f of req) { if (!ran.some(x => x.endsWith(f))) console.log('NOT RUN:', f); }
console.log('numTotalTests', r.numTotalTests, 'passed', r.numPassedTests, 'failed', r.numFailedTests, 'success', r.success);
