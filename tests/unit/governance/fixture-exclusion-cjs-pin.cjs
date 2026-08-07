#!/usr/bin/env node
/**
 * CJS INTEROP PIN for lib/governance/fixture-exclusion.mjs — SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-A FR-5.
 *
 * WHY THIS IS A .cjs FILE RUN BY PLAIN NODE, AND NOT A VITEST TEST:
 * scripts/fleet-dashboard.cjs:475 loads this .mjs through Node's native synchronous require(ESM)
 * interop, which only works while the module has no top-level await and no async evaluation. That
 * require sits INSIDE A TRY/CATCH, so when it breaks the dashboard does not error — it silently
 * falls back to UNFILTERED output. The failure mode is a filter that quietly stops filtering.
 *
 * A vitest test could not prove this. Vitest transforms modules through its OWN ESM pipeline, so a
 * `createRequire(...)` call inside a vitest file can resolve happily while plain `node` cannot load
 * the module at all — a green suite hiding a module Node itself rejects. The only honest check runs
 * in the same loader the real consumer uses, so this file is executed by node directly.
 *
 * RUN:      node tests/unit/governance/fixture-exclusion-cjs-pin.cjs
 * WIRED AT: npm run test:cjs-pins (and the EXEC gate for this SD)
 *
 * PROVEN RED/GREEN, not merely asserted: temporarily add `await Promise.resolve();` at the top level
 * of fixture-exclusion.mjs and this script exits 1 with ERR_REQUIRE_ASYNC_MODULE. A pin never
 * observed to fail is indistinguishable from an absent one.
 */

const path = require('path');

const MODULE_PATH = path.resolve(__dirname, '../../../lib/governance/fixture-exclusion.mjs');

// Every export the CJS consumers actually destructure. If a future edit converts this module to
// something require() cannot load, the require below throws before we get here.
const REQUIRED_EXPORTS = [
  'FIXTURE_KEY_RE',
  'UAT_FIXTURE_KEY_RE',
  'FIXTURE_VENTURE_NAME_RE',
  'EPOCH_TAIL_RE',
  'isFixtureSdKey',
  'isFixtureVenture',
  'isFixtureQf',
  'FIXTURE_CREATED_BY',
  'FIXTURE_PROCESS_KEY_PREFIX',
  'isFixtureProcessKey',
  'hasFixtureMarker',
  'isFixtureHealthSnapshot',
  'isFixtureCoordinationRow',
];

let mod;
try {
  mod = require(MODULE_PATH);
} catch (err) {
  console.error('❌ CJS PIN FAILED: plain node could not require() the module.');
  console.error(`   ${err.code || err.name}: ${err.message}`);
  console.error('   This is the exact failure scripts/fleet-dashboard.cjs:475 SWALLOWS in its');
  console.error('   try/catch — in production the dashboard would silently stop filtering.');
  process.exit(1);
}

const missing = REQUIRED_EXPORTS.filter((name) => mod[name] === undefined);
if (missing.length > 0) {
  console.error(`❌ CJS PIN FAILED: require() succeeded but ${missing.length} export(s) missing.`);
  console.error(`   Missing: ${missing.join(', ')}`);
  process.exit(1);
}

// Exercise a predicate through the CJS handle rather than only counting exports — a module can
// export a name and still be broken. Two-sided so the check cannot pass by always-false.
if (mod.isFixtureProcessKey('__e2e_liveness_probe') !== true) {
  console.error('❌ CJS PIN FAILED: isFixtureProcessKey did not classify an __e2e_ key as fixture.');
  process.exit(1);
}
if (mod.isFixtureProcessKey('__watcher_self__') !== false) {
  console.error('❌ CJS PIN FAILED: isFixtureProcessKey classified the REAL row __watcher_self__ as');
  console.error('   a fixture. That is the over-eating defect this SD exists to prevent.');
  process.exit(1);
}

console.log(`✅ CJS PIN: require() works, ${REQUIRED_EXPORTS.length} exports present, predicate two-sided.`);
