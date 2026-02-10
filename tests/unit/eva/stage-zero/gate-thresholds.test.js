/**
 * Unit Tests: Profile-Aware Gate Thresholds
 * SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-C
 *
 * Test Coverage:
 * - resolveGateThreshold (profile override, legacy fallback, missing boundary)
 * - resolveAllGateThresholds (merge behavior)
 * - LEGACY_GATE_THRESHOLDS structure
 * - Reality gate integration with profileThresholds
 */

import { describe, test, expect, vi } from 'vitest';
import {
  resolveGateThreshold,
  resolveAllGateThresholds,
  LEGACY_GATE_THRESHOLDS,
  LEGACY_WEIGHTS,
} from '../../../../lib/eva/stage-zero/profile-service.js';
import {
  evaluateRealityGate,
  BOUNDARY_CONFIG,
} from '../../../../lib/eva/reality-gates.js';

describe('LEGACY_GATE_THRESHOLDS', () => {
  test('contains all 5 enforced boundaries', () => {
    expect(Object.keys(LEGACY_GATE_THRESHOLDS)).toEqual([
      '5->6', '9->10', '12->13', '16->17', '20->21',
    ]);
  });

  test('all thresholds are between 0 and 1', () => {
    for (const [boundary, artifacts] of Object.entries(LEGACY_GATE_THRESHOLDS)) {
      for (const [type, score] of Object.entries(artifacts)) {
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });

  test('matches BOUNDARY_CONFIG values exactly', () => {
    for (const [boundary, config] of Object.entries(BOUNDARY_CONFIG)) {
      for (const artifact of config.required_artifacts) {
        expect(LEGACY_GATE_THRESHOLDS[boundary][artifact.artifact_type])
          .toBe(artifact.min_quality_score);
      }
    }
  });
});

describe('resolveGateThreshold', () => {
  test('returns profile override when available', () => {
    const profile = {
      gate_thresholds: {
        '5->6': { problem_statement: 0.4 },
      },
    };

    const result = resolveGateThreshold(profile, '5->6', 'problem_statement');
    expect(result).toBe(0.4);
  });

  test('returns legacy default when profile has no override for boundary', () => {
    const profile = {
      gate_thresholds: {
        '5->6': { problem_statement: 0.4 },
      },
    };

    const result = resolveGateThreshold(profile, '9->10', 'customer_interviews');
    expect(result).toBe(0.5); // Legacy default
  });

  test('returns legacy default when profile has no override for artifact type', () => {
    const profile = {
      gate_thresholds: {
        '5->6': { problem_statement: 0.4 },
      },
    };

    const result = resolveGateThreshold(profile, '5->6', 'value_proposition');
    expect(result).toBe(0.6); // Legacy default
  });

  test('returns legacy default when profile is null', () => {
    const result = resolveGateThreshold(null, '5->6', 'problem_statement');
    expect(result).toBe(0.6); // Legacy default
  });

  test('returns legacy default when profile has empty gate_thresholds', () => {
    const profile = { gate_thresholds: {} };

    const result = resolveGateThreshold(profile, '12->13', 'business_model_canvas');
    expect(result).toBe(0.7); // Legacy default
  });

  test('returns 0.5 fallback for unknown boundary/artifact', () => {
    const result = resolveGateThreshold(null, '99->100', 'unknown_type');
    expect(result).toBe(0.5); // Default fallback
  });

  test('handles profile with zero threshold override', () => {
    const profile = {
      gate_thresholds: {
        '5->6': { problem_statement: 0 },
      },
    };

    // 0 is a valid override (essentially disables the check)
    const result = resolveGateThreshold(profile, '5->6', 'problem_statement');
    expect(result).toBe(0);
  });
});

describe('resolveAllGateThresholds', () => {
  test('returns legacy thresholds when no profile', () => {
    const result = resolveAllGateThresholds(null, '5->6');
    expect(result).toEqual(LEGACY_GATE_THRESHOLDS['5->6']);
  });

  test('merges profile overrides with legacy defaults', () => {
    const profile = {
      gate_thresholds: {
        '5->6': { problem_statement: 0.4 },
      },
    };

    const result = resolveAllGateThresholds(profile, '5->6');
    expect(result.problem_statement).toBe(0.4); // Profile override
    expect(result.target_market_analysis).toBe(0.5); // Legacy default
    expect(result.value_proposition).toBe(0.6); // Legacy default
  });

  test('returns empty object for unknown boundary', () => {
    const result = resolveAllGateThresholds(null, '99->100');
    expect(result).toEqual({});
  });

  test('profile overrides completely replace legacy values', () => {
    const profile = {
      gate_thresholds: {
        '12->13': {
          business_model_canvas: 0.9,
          technical_architecture: 0.85,
          project_plan: 0.8,
        },
      },
    };

    const result = resolveAllGateThresholds(profile, '12->13');
    expect(result.business_model_canvas).toBe(0.9);
    expect(result.technical_architecture).toBe(0.85);
    expect(result.project_plan).toBe(0.8);
  });
});

describe('evaluateRealityGate with profileThresholds', () => {
  const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  function createMockDb(artifacts = []) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: artifacts, error: null }),
            }),
          }),
        }),
      }),
    };
  }

  test('uses profile threshold instead of BOUNDARY_CONFIG default', async () => {
    const artifacts = [
      { artifact_type: 'problem_statement', quality_score: 0.55, file_url: null, is_current: true },
      { artifact_type: 'target_market_analysis', quality_score: 0.5, file_url: null, is_current: true },
      { artifact_type: 'value_proposition', quality_score: 0.6, file_url: null, is_current: true },
    ];

    // Default threshold for problem_statement is 0.6, so 0.55 would fail
    // But with profile override of 0.5, it should pass
    const result = await evaluateRealityGate({
      ventureId: 'test-uuid',
      fromStage: 5,
      toStage: 6,
      db: createMockDb(artifacts),
      logger: silentLogger,
      profileThresholds: { problem_statement: 0.5 },
    });

    expect(result.status).toBe('PASS');
    expect(result.profile_thresholds_applied).toBe(true);
  });

  test('fails when score below profile threshold even though above legacy', async () => {
    const artifacts = [
      { artifact_type: 'business_model_canvas', quality_score: 0.75, file_url: null, is_current: true },
      { artifact_type: 'technical_architecture', quality_score: 0.65, file_url: null, is_current: true },
      { artifact_type: 'project_plan', quality_score: 0.5, file_url: null, is_current: true },
    ];

    // Legacy threshold for business_model_canvas is 0.7 (would pass at 0.75)
    // Profile overrides to 0.8 (should fail at 0.75)
    const result = await evaluateRealityGate({
      ventureId: 'test-uuid',
      fromStage: 12,
      toStage: 13,
      db: createMockDb(artifacts),
      logger: silentLogger,
      profileThresholds: { business_model_canvas: 0.8 },
    });

    expect(result.status).toBe('FAIL');
    const failReason = result.reasons.find(r =>
      r.artifact_type === 'business_model_canvas' &&
      r.code === 'QUALITY_SCORE_BELOW_THRESHOLD'
    );
    expect(failReason).toBeDefined();
    expect(failReason.required).toBe(0.8);
    expect(failReason.profile_override).toBe(true);
  });

  test('uses BOUNDARY_CONFIG default when no profile thresholds provided', async () => {
    const artifacts = [
      { artifact_type: 'problem_statement', quality_score: 0.55, file_url: null, is_current: true },
      { artifact_type: 'target_market_analysis', quality_score: 0.5, file_url: null, is_current: true },
      { artifact_type: 'value_proposition', quality_score: 0.6, file_url: null, is_current: true },
    ];

    // Without profile, problem_statement at 0.55 < 0.6 default should fail
    const result = await evaluateRealityGate({
      ventureId: 'test-uuid',
      fromStage: 5,
      toStage: 6,
      db: createMockDb(artifacts),
      logger: silentLogger,
    });

    expect(result.status).toBe('FAIL');
    expect(result.profile_thresholds_applied).toBeUndefined();
  });

  test('includes threshold_overrides in result when profile applied', async () => {
    const artifacts = [
      { artifact_type: 'problem_statement', quality_score: 0.6, file_url: null, is_current: true },
      { artifact_type: 'target_market_analysis', quality_score: 0.5, file_url: null, is_current: true },
      { artifact_type: 'value_proposition', quality_score: 0.6, file_url: null, is_current: true },
    ];

    const overrides = { problem_statement: 0.5, value_proposition: 0.5 };

    const result = await evaluateRealityGate({
      ventureId: 'test-uuid',
      fromStage: 5,
      toStage: 6,
      db: createMockDb(artifacts),
      logger: silentLogger,
      profileThresholds: overrides,
    });

    expect(result.threshold_overrides).toEqual(overrides);
  });
});
