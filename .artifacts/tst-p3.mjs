import fs from 'fs';
const p = JSON.parse(fs.readFileSync('.artifacts/tst-prd-full.json','utf8'));
console.log('=== TEST SCENARIOS (type:', Array.isArray(p.test_scenarios)?'array len '+p.test_scenarios.length:typeof p.test_scenarios, ') ===');
console.log(JSON.stringify(p.test_scenarios, null, 1));
