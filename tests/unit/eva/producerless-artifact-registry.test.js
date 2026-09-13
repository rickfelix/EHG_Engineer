/**
 * SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 FR-4.
 */
import { describe, it, expect } from 'vitest';
import { hasZeroAutomaticProducers, PRODUCERLESS_ARTIFACT_TYPES } from '../../../lib/eva/producerless-artifact-registry.js';

describe('hasZeroAutomaticProducers', () => {
  it('returns true for launch_usage_signal (sole producer is post-launch-only)', () => {
    expect(hasZeroAutomaticProducers('launch_usage_signal')).toBe(true);
  });

  it('returns false for an artifact type with a known producer', () => {
    expect(hasZeroAutomaticProducers('code_quality_report')).toBe(false);
    expect(hasZeroAutomaticProducers('legal_document')).toBe(false);
  });

  it('returns false for unknown/undefined input rather than throwing', () => {
    expect(hasZeroAutomaticProducers(undefined)).toBe(false);
    expect(hasZeroAutomaticProducers('')).toBe(false);
  });

  it('PRODUCERLESS_ARTIFACT_TYPES is exported and contains exactly the documented entry', () => {
    expect(PRODUCERLESS_ARTIFACT_TYPES.has('launch_usage_signal')).toBe(true);
    expect(PRODUCERLESS_ARTIFACT_TYPES.size).toBe(1);
  });
});
