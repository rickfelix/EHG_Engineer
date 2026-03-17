import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createSuccessMetricsAchievementGate } from './success-metrics-achievement.js';
import { createMockSD } from '../../../../../../tests/factories/validator-context-factory.js';

/** Build a Supabase mock with configurable per-table responses */
function buildSupabase({ children = null, profile = null, sdRecord = null }) {
  // Track calls to strategic_directives_v2 across from() invocations
  let sdv2CallCount = 0;

  const makeChainable = (resolveValue) => {
    const c = {
      select: () => c, eq: () => c, neq: () => c,
      order: () => c, limit: () => c,
      single: () => Promise.resolve(resolveValue),
      then: (fn) => Promise.resolve(resolveValue).then(fn),
    };
    return c;
  };

  return {
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        sdv2CallCount++;
        const currentCall = sdv2CallCount;
        return {
          select: () => makeChainable(currentCall === 1
            ? { data: children || [], error: null }
            : { data: sdRecord, error: sdRecord === undefined ? { message: 'not found' } : null }),
        };
      }
      if (table === 'sd_type_validation_profiles') {
        return { select: () => makeChainable({ data: profile, error: null }) };
      }
      return { select: () => makeChainable({ data: null, error: null }) };
    }),
    rpc: vi.fn(),
  };
}

describe('SUCCESS_METRICS_ACHIEVEMENT gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('has correct gate metadata', () => {
    const gate = createSuccessMetricsAchievementGate(buildSupabase({}));
    expect(gate.name).toBe('SUCCESS_METRICS_ACHIEVEMENT');
    expect(gate.required).toBe(true);
  });

  it('bypasses for orchestrator SD with children', async () => {
    const supabase = buildSupabase({ children: [{ id: 'child-1' }, { id: 'child-2' }] });
    const gate = createSuccessMetricsAchievementGate(supabase);

    const ctx = { sd: createMockSD({ id: 'parent-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.is_orchestrator).toBe(true);
  });

  it('bypasses for SD type that does not require user stories', async () => {
    const supabase = buildSupabase({
      profile: { requires_user_stories: false, description: 'Infra' },
    });
    const gate = createSuccessMetricsAchievementGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'infrastructure', id: 'infra-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.details.metrics_required).toBe(false);
  });

  it('passes with warning when no success metrics defined', async () => {
    const supabase = buildSupabase({
      profile: { requires_user_stories: true, description: 'Feature' },
      sdRecord: { success_metrics: [] },
    });
    const gate = createSuccessMetricsAchievementGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'feat-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.warnings[0]).toMatch(/No success metrics defined/);
  });

  it('passes when all metrics have actual values meeting targets', async () => {
    const metrics = [
      { name: 'Test coverage', target: '>=80%', actual: '95%' },
      { name: 'Performance', target: '>=90%', actual: '92%' },
    ];
    const supabase = buildSupabase({
      profile: { requires_user_stories: true },
      sdRecord: { success_metrics: metrics },
    });
    const gate = createSuccessMetricsAchievementGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'feat-pass' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.has_empty_actual).toBe(false);
  });

  it('fails when a metric has no actual value recorded', async () => {
    const metrics = [
      { name: 'Test coverage', target: '>=80%', actual: '95%' },
      { name: 'Latency', target: '<=100ms', actual: null },
    ];
    const supabase = buildSupabase({
      profile: { requires_user_stories: true },
      sdRecord: { success_metrics: metrics },
    });
    const gate = createSuccessMetricsAchievementGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'feat-fail' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(false);
    expect(result.details.has_empty_actual).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toMatch(/Latency/);
  });

  it('fails when overall score is below 70 due to unmet targets', async () => {
    const metrics = [
      { name: 'Coverage', target: '>=90%', actual: '40%' },
      { name: 'Speed', target: '>=95%', actual: '30%' },
    ];
    const supabase = buildSupabase({
      profile: { requires_user_stories: true },
      sdRecord: { success_metrics: metrics },
    });
    const gate = createSuccessMetricsAchievementGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'feat-low' }) };
    const result = await gate.validator(ctx);

    // Both score 50 (target not met) → average 50 < 70
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.warnings.length).toBe(2);
  });

  it('accepts N/A marker as valid actual value', async () => {
    const metrics = [
      { name: 'API latency', target: '<=200ms', actual: 'N/A' },
      { name: 'Coverage', target: '>=80%', actual: '85%' },
    ];
    const supabase = buildSupabase({
      profile: { requires_user_stories: true },
      sdRecord: { success_metrics: metrics },
    });
    const gate = createSuccessMetricsAchievementGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'feat-na' }) };
    const result = await gate.validator(ctx);

    // N/A scores 75, Coverage scores 100 → average ~88
    expect(result.passed).toBe(true);
    expect(result.details.has_empty_actual).toBe(false);
  });
});
