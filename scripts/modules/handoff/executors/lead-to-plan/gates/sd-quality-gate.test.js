/**
 * Tests for SD Quality Gate (LEAD-TO-PLAN)
 * SD-LEO-INFRA-HANDOFF-VALIDATOR-REGISTRY-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../sd-quality-scoring.js', () => ({
  SD_TYPE_THRESHOLDS: {
    infrastructure: { requiredFields: 6, minDescriptionWords: 50, passingScore: 65 },
    feature: { requiredFields: 8, minDescriptionWords: 100, passingScore: 70 },
  },
  DEFAULT_THRESHOLD: { requiredFields: 5, minDescriptionWords: 50, passingScore: 65 },
  JSONB_FIELDS: [
    'strategic_objectives', 'dependencies', 'implementation_guidelines',
    'success_criteria', 'success_metrics', 'key_changes', 'key_principles', 'risks',
  ],
  computeQualityScore: vi.fn(),
  wordCount: vi.fn((text) => (text ? text.trim().split(/\s+/).length : 0)),
}));

import { validateSdQuality, createSdQualityGate } from './sd-quality-gate.js';
import { computeQualityScore } from '../../../../sd-quality-scoring.js';
import { createMockSD, assertValidatorResult } from '../../../../../../tests/factories/validator-context-factory.js';

describe('validateSdQuality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass with a well-formed SD', async () => {
    computeQualityScore.mockReturnValue({
      pass: true,
      score: 85,
      max_score: 100,
      issues: [],
      warnings: [],
      details: {
        completeness: { populated: 7, score: 40 },
        content: { score: 25 },
        structure: { score: 20 },
      },
    });

    const sd = createMockSD();
    const result = await validateSdQuality(sd);

    assertValidatorResult(result, expect);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(85);
    expect(result.max_score).toBe(100);
    expect(result.issues).toEqual([]);
    expect(computeQualityScore).toHaveBeenCalledWith(sd);
  });

  it('should fail with an empty/minimal SD', async () => {
    computeQualityScore.mockReturnValue({
      pass: false,
      score: 10,
      max_score: 100,
      issues: ['description is 2 words (minimum 50 for infrastructure SDs)'],
      warnings: [],
      details: {
        completeness: { populated: 1, score: 5 },
        content: { score: 0 },
        structure: { score: 5 },
      },
    });

    const sd = createMockSD({
      description: 'Too short',
      strategic_objectives: [],
      key_changes: [],
      success_criteria: [],
      risks: [],
    });
    const result = await validateSdQuality(sd);

    assertValidatorResult(result, expect);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(10);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('should forward warnings from scoring module', async () => {
    computeQualityScore.mockReturnValue({
      pass: true,
      score: 70,
      max_score: 100,
      issues: [],
      warnings: ['scope field lacks explicit in-scope/out-of-scope boundaries'],
      details: {
        completeness: { populated: 6, score: 40 },
        content: { score: 15 },
        structure: { score: 15 },
      },
    });

    const sd = createMockSD({ sd_type: 'infrastructure' });
    const result = await validateSdQuality(sd);

    expect(result.pass).toBe(true);
    expect(result.warnings).toContain('scope field lacks explicit in-scope/out-of-scope boundaries');
  });

  it('should default sd_type to feature when not set', async () => {
    computeQualityScore.mockReturnValue({
      pass: true, score: 80, max_score: 100,
      issues: [], warnings: [],
      details: { completeness: { populated: 8, score: 40 }, content: { score: 20 }, structure: { score: 20 } },
    });

    const sd = createMockSD({ sd_type: undefined });
    await validateSdQuality(sd);

    expect(computeQualityScore).toHaveBeenCalledWith(sd);
  });
});

describe('createSdQualityGate', () => {
  it('should return a gate object with correct shape', () => {
    const gate = createSdQualityGate();

    expect(gate.name).toBe('GATE_SD_QUALITY');
    expect(gate.required).toBe(true);
    expect(typeof gate.validator).toBe('function');
    expect(typeof gate.remediation).toBe('string');
    expect(gate.remediation.length).toBeGreaterThan(0);
  });

  it('should invoke validateSdQuality via the validator', async () => {
    computeQualityScore.mockReturnValue({
      pass: true, score: 90, max_score: 100,
      issues: [], warnings: [],
      details: { completeness: { populated: 8, score: 40 }, content: { score: 25 }, structure: { score: 25 } },
    });

    const gate = createSdQualityGate();
    const sd = createMockSD();
    const result = await gate.validator({ sd });

    assertValidatorResult(result, expect);
    expect(result.pass).toBe(true);
  });
});
