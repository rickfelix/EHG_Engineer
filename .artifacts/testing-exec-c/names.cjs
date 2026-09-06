const r = require('../../.artifacts/testing-exec-c/vitest-results.json');
for (const s of r.testResults) {
  const f = s.name.split(/[\/]/).slice(-3).join('/');
  if (!/chairman-oauth|gmail-client|google-consent|michael\.test/.test(f)) continue;
  console.log('=== ' + f);
  for (const a of s.assertionResults) console.log('  [' + a.status + '] ' + a.fullName);
}
