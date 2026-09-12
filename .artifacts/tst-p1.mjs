import fs from 'fs';
const p = JSON.parse(fs.readFileSync('.artifacts/tst-prd-full.json','utf8'));
console.log('=== EXEC SUMMARY ===\n', p.executive_summary);
console.log('\n=== FUNCTIONAL REQUIREMENTS ===');
console.log(JSON.stringify(p.functional_requirements, null, 1));
