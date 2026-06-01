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
} from '../../../../lib/eva/stage-zero/profile-service.js';
import {
  evaluateRealityGate,
} from '../../../../lib/eva/reality-gates.js';

describe('LEGACY_GATE_THRESHOLDS', () => {
  test('contains all 5 enforced boundaries', () => {
    expect(Object.keys(LEGACY_GATE_THRESHOLDS)).toEqual([
      '5->6', '9->10', '12->13', '17->18', '23->24',
    ]);
  });

  test('all thresholds are between 0 and 1', () => {
    for (const [_boundary, artifacts] of Object.entries(LEGACY_GATE_THRESHOLDS)) {
      for (const [_type, score] of Object.entries(artifacts)) {
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });

  test('exposes the corrected gate_boundary_config artifact-type thresholds', () => {
    // SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001 FR-3: LEGACY_GATE_THRESHOLDS is now a
    // synchronous fallback mirroring the corrected `gate_boundary_config` seeds. Its
    // artifact_type keys are the canonical phase-prefixed types — intentionally distinct
    // from the deprecated hardcoded BOUNDARY_CONFIG fallback in reality-gates.js (the two
    // are independently sourced and no longer share artifact types per boundary).
    expect(LEGACY_GATE_THRESHOLDS['5->6']).toEqual({
      truth_idea_brief: 0.5,
      truth_validation_decision: 0.6,
      truth_financial_model: 0.6,
    });
    expect(LEGACY_GATE_THRESHOLDS['12->13']).toEqual({
      engine_business_model_canvas: 0.7,
      identity_persona_brand: 0.5,
      identity_gtm_sales_strategy: 0.5,
    });
    expect(LEGACY_GATE_THRESHOLDS['17->18']).toEqual({
      system_devils_advocate_review: 0.6,
      blueprint_financial_projection: 0.5,
    });
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
        '5->6': { truth_idea_brief: 0.4 },
      },
    };

    // truth_validation_decision is a current 5->6 legacy key (0.6)
    const result = resolveGateThreshold(profile, '5->6', 'truth_validation_decision');
    expect(result).toBe(0.6); // Legacy default
  });

  test('returns 0.5 fallback when profile is null and artifact type is not in legacy boundary', () => {
    // 'problem_statement' is no longer a 5->6 legacy key; falls through to the 0.5 floor.
    const result = resolveGateThreshold(null, '5->6', 'problem_statement');
    expect(result).toBe(0.5); // SECURITY C4 fallback floor
  });

  test('returns legacy default for a current legacy artifact type when profile is null', () => {
    const result = resolveGateThreshold(null, '5->6', 'truth_idea_brief');
    expect(result).toBe(0.5); // Legacy default
  });

  test('returns legacy default when profile has empty gate_thresholds', () => {
    const profile = { gate_thresholds: {} };

    const result = resolveGateThreshold(profile, '12->13', 'engine_business_model_canvas');
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
        '5->6': { truth_idea_brief: 0.4 },
      },
    };

    const result = resolveAllGateThresholds(profile, '5->6');
    expect(result.truth_idea_brief).toBe(0.4); // Profile override
    expect(result.truth_validation_decision).toBe(0.6); // Legacy default
    expect(result.truth_financial_model).toBe(0.6); // Legacy default
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

  function createMockSupabase(artifacts = []) {
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
    // BOUNDARY_CONFIG[5->6] requires truth_problem_statement(0.6),
    // truth_target_market_analysis(0.5), truth_value_proposition(0.6).
    const artifacts = [
      { artifact_type: 'truth_problem_statement', quality_score: 0.55, file_url: null, is_current: true },
      { artifact_type: 'truth_target_market_analysis', quality_score: 0.5, file_url: null, is_current: true },
      { artifact_type: 'truth_value_proposition', quality_score: 0.6, file_url: null, is_current: true },
    ];

    // Default threshold for truth_problem_statement is 0.6, so 0.55 would fail
    // But with profile override of 0.5, it should pass
    const result = await evaluateRealityGate({
      ventureId: 'test-uuid',
      fromStage: 5,
      toStage: 6,
      supabase: createMockSupabase(artifacts),
      logger: silentLogger,
      profileThresholds: { truth_problem_statement: 0.5 },
    });

    expect(result.status).toBe('PASS');
    expect(result.profile_thresholds_applied).toBe(true);
  });

  test('blocks when score below profile threshold even though above default', async () => {
    // BOUNDARY_CONFIG[12->13] requires engine_business_model_canvas(0.7),
    // blueprint_technical_architecture(0.6), blueprint_project_plan(0.5).
    const artifacts = [
      { artifact_type: 'engine_business_model_canvas', quality_score: 0.75, file_url: null, is_current: true },
      { artifact_type: 'blueprint_technical_architecture', quality_score: 0.65, file_url: null, is_current: true },
      { artifact_type: 'blueprint_project_plan', quality_score: 0.5, file_url: null, is_current: true },
    ];

    // Default threshold for engine_business_model_canvas is 0.7 (would pass at 0.75)
    // Profile overrides to 0.8 (should fail at 0.75)
    const result = await evaluateRealityGate({
      ventureId: 'test-uuid',
      fromStage: 12,
      toStage: 13,
      supabase: createMockSupabase(artifacts),
      logger: silentLogger,
      profileThresholds: { engine_business_model_canvas: 0.8 },
    });

    // SUT returns BLOCKED (not FAIL) when artifacts exist but a check fails —
    // "Chairman decides venture fate" (reality-gates.js).
    expect(result.status).toBe('BLOCKED');
    const failReason = result.reasons.find(r =>
      r.artifact_type === 'engine_business_model_canvas' &&
      r.code === 'QUALITY_SCORE_BELOW_THRESHOLD'
    );
    expect(failReason).toBeDefined();
    expect(failReason.required).toBe(0.8);
    expect(failReason.profile_override).toBe(true);
  });

  test('uses BOUNDARY_CONFIG default when no profile thresholds provided', async () => {
    const artifacts = [
      { artifact_type: 'truth_problem_statement', quality_score: 0.55, file_url: null, is_current: true },
      { artifact_type: 'truth_target_market_analysis', quality_score: 0.5, file_url: null, is_current: true },
      { artifact_type: 'truth_value_proposition', quality_score: 0.6, file_url: null, is_current: true },
    ];

    // Without profile, truth_problem_statement at 0.55 < 0.6 default should block.
    const result = await evaluateRealityGate({
      ventureId: 'test-uuid',
      fromStage: 5,
      toStage: 6,
      supabase: createMockSupabase(artifacts),
      logger: silentLogger,
    });

    // SUT returns BLOCKED (not FAIL) when a required artifact is below its default.
    expect(result.status).toBe('BLOCKED');
    expect(result.profile_thresholds_applied).toBeUndefined();
  });

  test('includes threshold_overrides in result when profile applied', async () => {
    const artifacts = [
      { artifact_type: 'truth_problem_statement', quality_score: 0.6, file_url: null, is_current: true },
      { artifact_type: 'truth_target_market_analysis', quality_score: 0.5, file_url: null, is_current: true },
      { artifact_type: 'truth_value_proposition', quality_score: 0.6, file_url: null, is_current: true },
    ];

    const overrides = { truth_problem_statement: 0.5, truth_value_proposition: 0.5 };

    const result = await evaluateRealityGate({
      ventureId: 'test-uuid',
      fromStage: 5,
      toStage: 6,
      supabase: createMockSupabase(artifacts),
      logger: silentLogger,
      profileThresholds: overrides,
    });

    expect(result.threshold_overrides).toEqual(overrides);
  });
});
