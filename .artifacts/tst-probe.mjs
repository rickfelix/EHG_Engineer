import { isFixtureVenture } from '../lib/governance/fixture-exclusion.mjs';
import { findUnguardedWrites, countGuardedWrites } from '../scripts/lint/fixture-producer-guard-lint.mjs';
import { readFileSync } from 'node:fs';

console.log('=== Q: does createTestVenture default name trip canonical? ===');
for (const n of [`Test Venture ${Date.now()}`, 'Test Venture 1786000000000', 'Test Venture for X', 'TS-fixture-alpha', 'venture-1786000000000']) {
  console.log(`  ${JSON.stringify(n)} -> isFixtureVenture=${isFixtureVenture({ name: n })}`);
}
console.log('  {name:"Test Venture 178...", is_demo:false} ->', isFixtureVenture({ name: 'Test Venture 1786000000000', is_demo: false }));

console.log('\n=== Q: does the lint flag string-literal occurrences in its OWN test file? ===');
const f = 'tests/unit/lint/fixture-producer-guard-lint.test.js';
const src = readFileSync(f, 'utf8');
const w = findUnguardedWrites(src);
console.log(`  ${f}: ${w.length} would-be violations, ${countGuardedWrites(src)} guarded`);
for (const x of w.slice(0, 8)) console.log(`    L${x.line}: ${x.snippet}`);
