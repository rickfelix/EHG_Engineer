import fs from 'fs';
const d = JSON.parse(fs.readFileSync('.artifacts/valv-prd.json','utf8'))[0];
const blob = JSON.stringify(d);
const names = ['conformance_passed','content_lint_passed','gate_passed','subagent_verified','test_passed','uat_verified','validation_passed'];
console.log('FR-2 AC1 -- do the 7 baseline names appear in the PRD at all?');
for (const n of names) console.log('  ', n, blob.includes(n) ? 'PRESENT' : 'ABSENT');
console.log('\nSections mentioning a baseline column name:');
for (const [k,v] of Object.entries(d)) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s && names.some(n => s.includes(n))) console.log('  field:', k);
}
