import { isFixtureVenture, FIXTURE_NAME_PATTERNS } from '../lib/chairman/chairman-actionable.mjs';
const names = [
  'High-Cap High-Success 1788723470896',
  'High-Cap Low-Success 1788723470896',
  'Low-Cap High-Success 1788723470896',
  'Low-Cap Low-Success 1788723470896',
];
for (const n of names) {
  const matched = FIXTURE_NAME_PATTERNS.filter(re => re.test(n)).map(String);
  console.log(`isFixtureVenture(is_demo:false) = ${String(isFixtureVenture({name:n, is_demo:false})).padEnd(5)}  matched=[${matched.join(', ')}]  name="${n}"`);
}
