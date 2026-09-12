const fs=require('fs'); const SEP=String.fromCharCode(92);
for (const run of ['runB','runC']) {
  const r=JSON.parse(fs.readFileSync(`.artifacts/testing-evidence/${run}-results.json`,'utf8'));
  const t=(r.testResults||[]).find(x=>String(x.name).split(SEP).join('/').endsWith('tests/unit/fleet/source-tree-identity-realgit.test.js'));
  console.log(run, '->', t? `status=${t.status} assertions=${(t.assertionResults||[]).length}` : 'not present');
  if (t && t.status!=='passed') console.log('   message:', String(t.message||'').slice(0,300));
  console.log(`   ${run} totals: files=${(r.testResults||[]).length} tests=${r.numTotalTests} passed=${r.numPassedTests} failed=${r.numFailedTests} success=${r.success}`);
}
const c=JSON.parse(fs.readFileSync('.artifacts/testing-evidence/runC-results.json','utf8'));
console.log('=== runC non-passed FILES ===');
(c.testResults||[]).filter(t=>t.status!=='passed').forEach(t=>console.log(' -', String(t.name).split(SEP).join('/').split('/').slice(-3).join('/'), t.status));
console.log('=== runC failed ASSERTIONS (real test failures) ===');
let n=0;
(c.testResults||[]).forEach(t=>(t.assertionResults||[]).forEach(a=>{ if(a.status==='failed'){n++; console.log(' -', a.fullName);} }));
console.log('failed assertion count =', n);
