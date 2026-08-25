/**
 * Unit tests for lib/eva/uat-control-pack.js — SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C
 * (FR-2, FR-4). Directly targets the 3 unfalsifiability gaps the TESTING sub-agent found in
 * naive versions of these checks (evidence row 00ebf55d):
 *   - TS-2: run-uniqueness must be computed EXCLUDING volatile fields (pack_id/generated_at),
 *     with a positive control proving identical substantive inputs hash identically.
 *   - TS-1: the canary check must distinguish a genuine mutation-control catch from
 *     UNEXPLAINED_RED (everything failing for an unrelated reason).
 *   - TS-7: a manifest entry for a journey that never executed must FAIL, not silently pass.
 */
import { describe, it, expect } from 'vitest';
import {
  checkMinimumAssertionManifest,
  assertLiveDeploymentBinding,
  computeSubstantiveEvidenceHash,
  checkCanaryMutationControl,
  assertFenceTwoSidedness,
  classifyUatFailure,
} from '../../../lib/eva/uat-control-pack.js';

describe('checkMinimumAssertionManifest', () => {
  it('passes when every journey meets its manifest minimum', () => {
    const result = checkMinimumAssertionManifest(
      [{ journeyId: 'j1', minimumAssertions: 2 }],
      [{ journeyId: 'j1', executedAssertions: 3 }]
    );
    expect(result.passed).toBe(true);
  });

  it('fails a journey executing fewer assertions than its manifest minimum', () => {
    const result = checkMinimumAssertionManifest(
      [{ journeyId: 'j1', minimumAssertions: 5 }],
      [{ journeyId: 'j1', executedAssertions: 1 }]
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0].journeyId).toBe('j1');
  });

  it('TS-7: a manifest entry naming a journey that never executed FAILS, not satisfied-by-absence', () => {
    const result = checkMinimumAssertionManifest(
      [{ journeyId: 'renamed-or-regenerated', minimumAssertions: 1 }],
      [{ journeyId: 'some-other-journey', executedAssertions: 10 }]
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0].reason).toMatch(/no executed journey matched/);
  });
});

describe('assertLiveDeploymentBinding', () => {
  it('passes with a successful nonce round-trip and a plausible deployment sha', () => {
    const result = assertLiveDeploymentBinding({
      nonceWriteResult: { outcome: 'ok', echoedNonce: 'abc' },
      expectedNonce: 'abc',
      deploymentSha: '1234567',
    });
    expect(result.passed).toBe(true);
  });

  it('fails when the write did not succeed', () => {
    const result = assertLiveDeploymentBinding({
      nonceWriteResult: { outcome: 'error' },
      expectedNonce: 'abc',
      deploymentSha: '1234567',
    });
    expect(result.passed).toBe(false);
  });

  it('TS-2 anti-mock guard: fails when the echoed nonce does not match (stubbed transport)', () => {
    const result = assertLiveDeploymentBinding({
      nonceWriteResult: { outcome: 'ok', echoedNonce: 'wrong' },
      expectedNonce: 'abc',
      deploymentSha: '1234567',
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/stubbed\/mocked transport/);
  });

  it('fails when deploymentSha is null/implausible', () => {
    const result = assertLiveDeploymentBinding({
      nonceWriteResult: { outcome: 'ok', echoedNonce: 'abc' },
      expectedNonce: 'abc',
      deploymentSha: null,
    });
    expect(result.passed).toBe(false);
  });
});

describe('computeSubstantiveEvidenceHash', () => {
  it('TS-2: two manifests with identical substantive content but DIFFERENT pack_id/generated_at hash IDENTICALLY (positive control)', () => {
    const manifestA = {
      integrity: { artifact_hashes: ['h1', 'h2'] },
      test_run: { total: 10, passed: 10 },
      pack_id: 'EVP-1000-aaaa',
      generated_at: '2026-08-25T00:00:00Z',
    };
    const manifestB = {
      integrity: { artifact_hashes: ['h2', 'h1'] }, // different order, same set
      test_run: { total: 10, passed: 10 },
      pack_id: 'EVP-2000-bbbb', // different
      generated_at: '2026-08-25T01:00:00Z', // different
    };
    const hashA = computeSubstantiveEvidenceHash(manifestA, 'sha-abc');
    const hashB = computeSubstantiveEvidenceHash(manifestB, 'sha-abc');
    expect(hashA).toBe(hashB);
  });

  it('TS-2: two manifests with DIFFERENT substantive content hash DIFFERENTLY (run-uniqueness proof)', () => {
    const manifestA = { integrity: { artifact_hashes: ['h1'] }, test_run: { total: 10, passed: 10 } };
    const manifestB = { integrity: { artifact_hashes: ['h1'] }, test_run: { total: 10, passed: 9 } };
    const hashA = computeSubstantiveEvidenceHash(manifestA, 'sha-abc');
    const hashB = computeSubstantiveEvidenceHash(manifestB, 'sha-abc');
    expect(hashA).not.toBe(hashB);
  });

  it('a different deployment sha changes the hash even with identical artifacts/test_run', () => {
    const manifest = { integrity: { artifact_hashes: ['h1'] }, test_run: { total: 1, passed: 1 } };
    const hashA = computeSubstantiveEvidenceHash(manifest, 'sha-aaa');
    const hashB = computeSubstantiveEvidenceHash(manifest, 'sha-bbb');
    expect(hashA).not.toBe(hashB);
  });
});

describe('checkCanaryMutationControl', () => {
  it('TS-1: passes when the canary fails and real journeys pass', () => {
    const result = checkCanaryMutationControl('canary-1', [
      { journeyId: 'canary-1', status: 'FAIL' },
      { journeyId: 'j1', status: 'PASS' },
      { journeyId: 'j2', status: 'PASS' },
    ]);
    expect(result.passed).toBe(true);
  });

  it('fails when the canary is missing from the run entirely', () => {
    const result = checkCanaryMutationControl('canary-1', [{ journeyId: 'j1', status: 'PASS' }]);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/was not found/);
  });

  it('fails when the canary did not actually fail', () => {
    const result = checkCanaryMutationControl('canary-1', [{ journeyId: 'canary-1', status: 'PASS' }]);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/did not fire/);
  });

  it('UNEXPLAINED_RED: fails when ALL non-canary journeys also fail (proves nothing about the control specifically)', () => {
    const result = checkCanaryMutationControl('canary-1', [
      { journeyId: 'canary-1', status: 'FAIL' },
      { journeyId: 'j1', status: 'FAIL' },
      { journeyId: 'j2', status: 'FAIL' },
    ]);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/UNEXPLAINED_RED/);
  });
});

describe('assertFenceTwoSidedness', () => {
  it('passes only when the app CAN be exercised AND the exclusion predicate is declared+asserted', () => {
    const result = assertFenceTwoSidedness({
      canExerciseApp: true,
      exclusionPredicateDeclared: true,
      exclusionPredicateAssertedInVentureCi: true,
    });
    expect(result.passed).toBe(true);
  });

  it('fails when the app cannot be exercised at all', () => {
    const result = assertFenceTwoSidedness({ canExerciseApp: false, exclusionPredicateDeclared: true, exclusionPredicateAssertedInVentureCi: true });
    expect(result.passed).toBe(false);
  });

  it('fails when the exclusion predicate is not declared/asserted in venture CI', () => {
    const result = assertFenceTwoSidedness({ canExerciseApp: true, exclusionPredicateDeclared: false, exclusionPredicateAssertedInVentureCi: false });
    expect(result.passed).toBe(false);
  });
});

describe('classifyUatFailure', () => {
  it('classifies a mechanism error as factory_defect', () => {
    expect(classifyUatFailure({ mechanismError: true, journeyExecuted: false })).toBe('factory_defect');
  });

  it('classifies a never-executed journey as factory_defect', () => {
    expect(classifyUatFailure({ mechanismError: false, journeyExecuted: false })).toBe('factory_defect');
  });

  it('classifies a genuinely executed journey that observed wrong app behavior as venture_defect', () => {
    expect(classifyUatFailure({ mechanismError: false, journeyExecuted: true })).toBe('venture_defect');
  });
});
