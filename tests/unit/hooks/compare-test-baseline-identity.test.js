/**
 * SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001 (FR-2) — locks in the identity-based
 * conversion of scripts/hooks/compare-test-baseline.cjs's compareTestCounts.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { compareTestCounts } = require('../../../scripts/hooks/compare-test-baseline.cjs');

describe('compareTestCounts (identity-based, FR-2)', () => {
  it('does NOT report REGRESSION when the raw count rises but failing identities are identical', () => {
    // Same shared-flake test failed on both runs; a re-run bumped the raw count via an unrelated
    // retry artifact, but the identity SET is unchanged — this is the exact false-positive class
    // red-merge-detector.mjs / compare-to-main-snapshot.mjs are separately being fixed for.
    const baseline = { failed: 1, failing_ids: ['a.test.js::flaky'] };
    const current = { failed: 2, failing_ids: ['a.test.js::flaky'] };
    const r = compareTestCounts(baseline, current, 'Test');
    expect(r.status).not.toBe('REGRESSION');
    expect(r.new_failures).toBe(0);
    expect(r.regression_mode).toBe('identity');
  });

  it('reports REGRESSION and names the new identity when a genuinely new test fails', () => {
    const baseline = { failed: 1, failing_ids: ['a.test.js::flaky'] };
    const current = { failed: 2, failing_ids: ['a.test.js::flaky', 'b.test.js::new break'] };
    const r = compareTestCounts(baseline, current, 'Test');
    expect(r.status).toBe('REGRESSION');
    expect(r.new_failures).toBe(1);
    expect(r.new_failing_ids).toEqual(['b.test.js::new break']);
  });

  it('falls back to count comparison when baseline has no failing_ids (pre-conversion baseline)', () => {
    const baseline = { failed: 1 };
    const current = { failed: 2, failing_ids: ['a.test.js::x', 'b.test.js::y'] };
    const r = compareTestCounts(baseline, current, 'Test');
    expect(r.regression_mode).toBe('count_fallback');
    expect(r.status).toBe('REGRESSION');
  });

  it('reports CLEAN when current has zero failures', () => {
    const baseline = { failed: 0, failing_ids: [] };
    const current = { failed: 0, failing_ids: [] };
    const r = compareTestCounts(baseline, current, 'Test');
    expect(r.status).toBe('CLEAN');
  });
});
