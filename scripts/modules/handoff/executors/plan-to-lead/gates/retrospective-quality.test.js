import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing source
vi.mock('../../../../sd-type-checker.js', () => ({
  isInfrastructureSDSync: vi.fn(() => false),
  getThresholdProfile: vi.fn(async () => ({ retrospectiveQuality: 70 })),
}));

vi.mock('../../../../sd-quality-validation.js', () => ({
  validateSDCompletionReadiness: vi.fn(),
  getSDImprovementGuidance: vi.fn(() => 'Improve retrospective quality'),
}));

import { isInfrastructureSDSync, getThresholdProfile } from '../../../../sd-type-checker.js';
import { validateSDCompletionReadiness, getSDImprovementGuidance } from '../../../../sd-quality-validation.js';
import { createRetrospectiveQualityGate } from './retrospective-quality.js';
import { createMockSD } from '../../../../../../tests/factories/validator-context-factory.js';

/** Build a Supabase mock that returns different data per table */
function buildSupabase({ children = [], retrospective = null, childError = null }) {
  const makeChainable = (resolveValue) => {
    const c = {
      select: () => c, eq: () => c, neq: () => c,
      order: () => c, limit: () => c,
      single: () => Promise.resolve(resolveValue),
      maybeSingle: () => Promise.resolve(resolveValue),
      then: (fn) => Promise.resolve(resolveValue).then(fn),
    };
    return c;
  };

  return {
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        return { select: () => makeChainable({ data: children, error: childError }) };
      }
      if (table === 'retrospectives') {
        return { select: () => makeChainable({ data: retrospective, error: null }) };
      }
      return { select: () => makeChainable({ data: [], error: null }) };
    }),
    rpc: vi.fn(),
  };
}

describe('RETROSPECTIVE_QUALITY_GATE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('has correct gate metadata', () => {
    const gate = createRetrospectiveQualityGate(buildSupabase({}));
    expect(gate.name).toBe('RETROSPECTIVE_QUALITY_GATE');
    expect(gate.required).toBe(true);
  });

  it('auto-passes for orchestrator with all children completed and published retro', async () => {
    const children = [
      { id: 'child-1', title: 'Child 1', status: 'completed' },
      { id: 'child-2', title: 'Child 2', status: 'completed' },
    ];
    const retro = { id: 'retro-1', quality_score: 75, status: 'PUBLISHED' };
    const supabase = buildSupabase({ children, retrospective: retro });
    const gate = createRetrospectiveQualityGate(supabase);

    const ctx = { sd: createMockSD({ id: 'parent-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.details.orchestrator_auto_pass).toBe(true);
    expect(result.score).toBe(75);
  });

  it('auto-passes for database type SD with retrospective', async () => {
    const retro = { id: 'retro-2', quality_score: 65 };
    const supabase = buildSupabase({ retrospective: retro });
    const gate = createRetrospectiveQualityGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'database', id: 'db-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.details.database_auto_pass).toBe(true);
  });

  it('auto-passes for bugfix type SD with retrospective', async () => {
    const retro = { id: 'retro-3', quality_score: 55 };
    const supabase = buildSupabase({ retrospective: retro });
    const gate = createRetrospectiveQualityGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'bugfix', id: 'fix-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.details.bugfix_auto_pass).toBe(true);
  });

  it('fails when retrospective score is below threshold for feature SD', async () => {
    const retro = { id: 'retro-4', quality_score: 40 };
    const supabase = buildSupabase({ retrospective: retro });
    const gate = createRetrospectiveQualityGate(supabase);

    validateSDCompletionReadiness.mockResolvedValue({
      score: 55,
      issues: ['Boilerplate key_learnings detected'],
      warnings: [],
      improvements: [{ criterion: 'learning_specificity', score: 3, weight: 0.4, suggestion: 'Add specific details' }],
    });
    getThresholdProfile.mockResolvedValue({ retrospectiveQuality: 70 });

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'feat-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(55);
    expect(result.issues).toContain('Boilerplate key_learnings detected');
  });

  it('passes when retrospective score meets threshold for feature SD', async () => {
    const retro = { id: 'retro-5', quality_score: 80 };
    const supabase = buildSupabase({ retrospective: retro });
    const gate = createRetrospectiveQualityGate(supabase);

    validateSDCompletionReadiness.mockResolvedValue({
      score: 82,
      issues: [],
      warnings: ['Minor: could improve action_items'],
      improvements: [],
    });
    getThresholdProfile.mockResolvedValue({ retrospectiveQuality: 70 });

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'feat-uuid-2' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(82);
  });

  it('auto-passes for infrastructure type SD with retrospective', async () => {
    const retro = { id: 'retro-6', quality_score: 45 };
    const supabase = buildSupabase({ retrospective: retro });
    const gate = createRetrospectiveQualityGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'infrastructure', id: 'infra-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.details.infrastructure_auto_pass).toBe(true);
    // Score should be at least 55 (floor for infrastructure)
    expect(result.score).toBeGreaterThanOrEqual(55);
  });
});
