/**
 * SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001, FR-5 -- unit coverage for per-specimen retrodiction
 * verdicts against injected-stub coverage_matrix rows.
 */
import { describe, it, expect } from 'vitest';
import { RETRODICTION_SPECIMENS, retrodictSpecimens } from '../../../lib/governance/coverage-matrix-retrodiction.js';

function fakeSupabase(rowsBySpecimenId) {
  return {
    from: () => ({
      select: () => ({
        eq: (col1, val1) => ({
          eq: (col2, val2) => ({
            maybeSingle: () => {
              const specimen = RETRODICTION_SPECIMENS.find((s) => s.surface_class === val1 && s.surface_key === val2);
              const row = specimen ? rowsBySpecimenId[specimen.id] : undefined;
              return Promise.resolve({ data: row ?? null, error: null });
            },
          }),
        }),
      }),
    }),
  };
}

describe('retrodictSpecimens', () => {
  it('all 4 specimens get an individual verdict, not a single aggregate claim', async () => {
    const rows = Object.fromEntries(RETRODICTION_SPECIMENS.map((s) => [s.id, { checker_ids: [], is_active: true, status: 'unchecked' }]));
    const results = await retrodictSpecimens(fakeSupabase(rows));
    expect(results).toHaveLength(4);
    expect(results.map((r) => r.id).sort()).toEqual(['comms-lane', 'product-touch', 'qf-scanning', 'scope-coverage'].sort());
  });

  it('a specimen with empty checker_ids retrodicts as pass (was genuinely unchecked)', async () => {
    const rows = { 'product-touch': { checker_ids: [], is_active: true, status: 'unchecked' } };
    const results = await retrodictSpecimens(fakeSupabase(rows));
    const productTouch = results.find((r) => r.id === 'product-touch');
    expect(productTouch.verdict).toBe('pass');
  });

  it('a specimen with real checker coverage AND is_active retrodicts as fail (would not have been caught by this matrix)', async () => {
    const rows = { 'product-touch': { checker_ids: ['some-real-checker.mjs'], is_active: true, status: 'covered' } };
    const results = await retrodictSpecimens(fakeSupabase(rows));
    const productTouch = results.find((r) => r.id === 'product-touch');
    expect(productTouch.verdict).toBe('fail');
  });

  it('a specimen missing from the matrix entirely retrodicts as fail with a descriptive reason, not a silent pass', async () => {
    const results = await retrodictSpecimens(fakeSupabase({}));
    expect(results.every((r) => r.verdict === 'fail')).toBe(true);
    expect(results[0].evidence.reason).toBe('surface_not_in_matrix');
  });
});
