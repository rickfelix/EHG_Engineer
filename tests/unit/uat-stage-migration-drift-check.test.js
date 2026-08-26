import { describe, it, expect } from 'vitest';
import {
  BASELINE_FINGERPRINT,
  BASELINE_UPPER_BOUND,
  sha256,
  extractUpperBound,
  compareFingerprint,
} from '../../lib/eva/uat-stage-migration/drift-check.mjs';

// TS-1b: pure-logic unit test -- a stubbed "live" function-body string that deliberately
// differs from the committed baseline must be detected as drift, no DB connection involved.
describe('compareFingerprint', () => {
  it('reports no drift when live hashes/bounds match the baseline exactly', () => {
    const result = compareFingerprint(BASELINE_FINGERPRINT, {
      advance_venture_stage_bound: BASELINE_UPPER_BOUND,
      fn_advance_venture_stage_bound: BASELINE_UPPER_BOUND,
    });
    expect(result.drifted).toBe(false);
    expect(result.mismatches).toEqual([]);
  });

  it('detects a simulated function-body change (hash mismatch)', () => {
    const liveHashes = {
      ...BASELINE_FINGERPRINT,
      advance_venture_stage: sha256('CREATE OR REPLACE FUNCTION advance_venture_stage() -- tampered'),
    };
    const result = compareFingerprint(liveHashes, {
      advance_venture_stage_bound: BASELINE_UPPER_BOUND,
      fn_advance_venture_stage_bound: BASELINE_UPPER_BOUND,
    });
    expect(result.drifted).toBe(true);
    expect(result.mismatches).toContainEqual(
      expect.objectContaining({ name: 'advance_venture_stage', reason: 'hash_mismatch' })
    );
  });

  it('reports not_found when a fingerprinted function is missing from the live snapshot', () => {
    const { ventures_canonical_writer_policy, ...rest } = BASELINE_FINGERPRINT;
    const result = compareFingerprint(rest, {});
    expect(result.drifted).toBe(true);
    expect(result.mismatches).toContainEqual(
      expect.objectContaining({ name: 'ventures_canonical_writer_policy', reason: 'not_found' })
    );
  });

  it('detects upper-bound drift on advance_venture_stage (FR-9 AC-3)', () => {
    const result = compareFingerprint(BASELINE_FINGERPRINT, {
      advance_venture_stage_bound: 27, // already updated live, baseline still expects 26
      fn_advance_venture_stage_bound: BASELINE_UPPER_BOUND,
    });
    expect(result.drifted).toBe(true);
    expect(result.mismatches).toContainEqual(
      expect.objectContaining({ name: 'advance_venture_stage', reason: 'upper_bound_drift' })
    );
  });
});

describe('extractUpperBound', () => {
  it('extracts the p_to_stage upper bound from a live function definition', () => {
    const def = 'BEGIN\n  IF p_to_stage < 1 OR p_to_stage > 26 THEN\n    RAISE EXCEPTION;\nEND;';
    expect(extractUpperBound(def)).toBe(26);
  });

  it('returns null when no upper-bound literal is present', () => {
    expect(extractUpperBound('BEGIN\n  RETURN 1;\nEND;')).toBeNull();
  });
});
