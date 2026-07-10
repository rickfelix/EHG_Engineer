// SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A (FR-4)
import { describe, it, expect } from 'vitest';
import { assertGaugeLivenessProof } from '../../../lib/telemetry/canary-gauge-liveness.mjs';

describe('assertGaugeLivenessProof (SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A FR-4)', () => {
  it('passes when the pull succeeded AND the gauge reads live', () => {
    const result = assertGaugeLivenessProof({ pullResult: { outcome: 'ok' }, gaugeState: { state: 'live' } });
    expect(result.passed).toBe(true);
    expect(result.reason).toMatch(/registered end-to-end/);
  });

  it('fails when the synthetic pull itself did not succeed', () => {
    const result = assertGaugeLivenessProof({ pullResult: { outcome: 'error' }, gaugeState: { state: 'no_writer_yet' } });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/did not succeed/);
  });

  it('fails when the pull succeeded but the gauge did not register as live (FR-4 acceptance criterion 3)', () => {
    const result = assertGaugeLivenessProof({ pullResult: { outcome: 'ok' }, gaugeState: { state: 'stale' } });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/did not register end-to-end/);
  });

  it('fails closed on missing inputs rather than throwing', () => {
    expect(() => assertGaugeLivenessProof({})).not.toThrow();
    expect(assertGaugeLivenessProof({}).passed).toBe(false);
  });
});
