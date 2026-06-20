// Guards the test-fixture exclusion in the v_sd_next_candidates migration.
// SD-LEO-FEAT-TEST-FIXTURE-SDS-001
//
// The exclusion lives in SQL (the view), so this guard (a) asserts the migration keeps BOTH
// fixture-prefix predicates, and (b) pins the pure key-classification logic those predicates encode,
// so a future view rewrite can't silently drop the exclusion or start matching real SD prefixes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = resolve(REPO_ROOT, 'database/migrations/20260620_v_sd_next_candidates_exclude_test_fixtures.sql');

// The exact predicates the view uses to exclude transient test fixtures.
const FIXTURE_PREFIXES = ['TEST-', 'SD-DEMO-'];
export function isTestFixtureSdKey(sdKey) {
  const k = String(sdKey || '');
  return FIXTURE_PREFIXES.some((p) => k.startsWith(p));
}

test('migration keeps BOTH fixture-prefix exclusions in the final WHERE', () => {
  const sql = readFileSync(MIGRATION, 'utf-8');
  assert.match(sql, /sd\.sd_key NOT LIKE 'TEST-%'/);
  assert.match(sql, /sd\.sd_key NOT LIKE 'SD-DEMO-%'/);
  // still a CREATE OR REPLACE of the right view (not an accidental DROP/rename)
  assert.match(sql, /CREATE OR REPLACE VIEW public\.v_sd_next_candidates/);
});

test('classifier excludes the known transient fixtures', () => {
  for (const k of ['TEST-LIFECYCLE-001', 'TEST-MGMT-FIXES-001', 'TEST-MGMT-VALIDATION-001', 'SD-DEMO-RACE-001', 'SD-DEMO-RACE-CONDITION-XYZ']) {
    assert.equal(isTestFixtureSdKey(k), true, `${k} should be classified as a fixture`);
  }
});

test('classifier does NOT exclude real SDs (incl. ones containing TEST/FIXTURE in the name)', () => {
  for (const k of [
    'SD-LEO-FEAT-TEST-FIXTURE-SDS-001', // THIS SD — contains TEST-FIXTURE but is real (SD-LEO- prefix)
    'SD-LEO-INFRA-ASKUSER-GUARD-FAILOPEN-HARDEN-001',
    'SD-EHG-COCKPIT-BUILD-001',
    'SD-FDBK-INFRA-ADD-PRD-DATABASE-001',
    'SD-MAN-INFRA-FOO-001',
    'QF-20260620-001',
  ]) {
    assert.equal(isTestFixtureSdKey(k), false, `${k} must NOT be excluded`);
  }
});

test('fixture prefixes never match a leading SD- category prefix (anchored at start only)', () => {
  // 'SD-DEMO-' must match SD-DEMO-* but not e.g. a hypothetical SD-DEMONSTRATE (still SD-DEMO prefix
  // — acceptable: no real category is 'DEMO'); and 'TEST-' is start-anchored so SD-...-TEST-... is safe.
  assert.equal(isTestFixtureSdKey('SD-LEO-DEMO-001'), false); // 'DEMO' mid-key is not excluded
  assert.equal(isTestFixtureSdKey('MY-TEST-001'), false);     // 'TEST' mid-key is not excluded
});
