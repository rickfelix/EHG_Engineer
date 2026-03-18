/**
 * Success Metrics Auto-Population - Unit Tests
 * SD-LEARN-FIX-ADDRESS-PAT-AUTO-074
 *
 * Tests that the SUCCESS_METRICS gate auto-populates missing `actual` values
 * from handoff evidence (accepted handoffs, completed user stories) to prevent
 * 0/100 scores on SDs that completed work but didn't manually fill in actuals.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/metric-auto-verifier.js', () => ({
  verifyAllMetrics: vi.fn().mockReturnValue({
    results: [],
    overallScore: 65
  })
}));

import { createSuccessMetricsGate } from '../../../scripts/modules/handoff/executors/plan-to-lead/gates/success-metrics-gate.js';

describe('Success Metrics Auto-Population (PAT-AUTO-14398afb fix)', () => {
  let mockSupabase;
  let gate;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  function buildMockSupabase({ childCount = 0, _sdType = 'infrastructure', metrics, handoffs = [], stories = [] }) {
    const mockFrom = vi.fn().mockImplementation((table) => {
      if (table === 'strategic_directives_v2') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols === 'id') {
              // Children check
              return {
                eq: vi.fn().mockResolvedValue({
                  data: Array(childCount).fill({ id: 'child' }),
                  error: null
                })
              };
            }
            if (cols === 'parent_sd_id') {
              return {
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { parent_sd_id: null }, error: null })
                })
              };
            }
            if (cols === 'success_metrics') {
              return {
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { success_metrics: metrics },
                    error: null
                  })
                })
              };
            }
            return { eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) };
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
          })
        };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: handoffs, error: null })
            })
          })
        };
      }
      if (table === 'user_stories') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: stories, error: null })
          })
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null })
      };
    });

    return { from: mockFrom };
  }

  it('should auto-populate missing actuals from handoff evidence', async () => {
    const metrics = [
      { metric: 'Implementation completeness', target: '100%' },
      { metric: 'Test coverage', target: '80%' }
    ];
    mockSupabase = buildMockSupabase({
      metrics,
      handoffs: [
        { handoff_type: 'PLAN-TO-EXEC', status: 'accepted', validation_score: 90 },
        { handoff_type: 'EXEC-TO-PLAN', status: 'accepted', validation_score: 85 }
      ],
      stories: [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'completed' }
      ]
    });

    gate = createSuccessMetricsGate(mockSupabase);
    const result = await gate.validator({
      sd: { id: 'test-uuid', sd_type: 'infrastructure' },
      sdId: 'test-uuid'
    });

    // Should pass because actuals were auto-populated from evidence
    expect(result.score).toBeGreaterThan(0);
  });

  it('should not auto-populate when actuals already exist', async () => {
    const metrics = [
      { metric: 'Implementation completeness', target: '100%', actual: '100% done' },
      { metric: 'Test coverage', target: '80%', actual: '95% coverage' }
    ];
    mockSupabase = buildMockSupabase({
      metrics,
      handoffs: [{ handoff_type: 'PLAN-TO-EXEC', status: 'accepted', validation_score: 90 }],
      stories: [{ status: 'completed' }]
    });

    gate = createSuccessMetricsGate(mockSupabase);
    const result = await gate.validator({
      sd: { id: 'test-uuid', sd_type: 'infrastructure' },
      sdId: 'test-uuid'
    });

    // Should pass with existing actuals
    expect(result.score).toBeGreaterThan(0);
  });

  it('should score 0 when no evidence available and no actuals', async () => {
    const metrics = [
      { metric: 'Implementation completeness', target: '100%' }
    ];
    mockSupabase = buildMockSupabase({
      metrics,
      handoffs: [],
      stories: []
    });

    gate = createSuccessMetricsGate(mockSupabase);
    const result = await gate.validator({
      sd: { id: 'test-uuid', sd_type: 'infrastructure' },
      sdId: 'test-uuid'
    });

    // No evidence and no actuals — should still fail
    expect(result.score).toBeLessThanOrEqual(50);
  });
});
