/**
 * Tests for PAT-GATE4-BYPASS-001 fix: Gate 4 bypass acceptance
 *
 * Validates that Gate 4 (workflow ROI validation) correctly credits
 * governance-approved bypasses as valid gate completions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateGate4LeadFinal } from '../../scripts/modules/workflow-roi-validation.js';

// Mock child_process and adaptive-threshold-calculator
vi.mock('child_process', () => ({
  exec: vi.fn((cmd, cb) => cb && cb(null, '', ''))
}));
vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    promisify: (fn) => vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
  };
});
vi.mock('../../scripts/modules/adaptive-threshold-calculator.js', () => ({
  calculateAdaptiveThreshold: vi.fn().mockResolvedValue({ threshold: 60 })
}));
vi.mock('../../scripts/modules/pattern-tracking.js', () => ({
  getPatternStats: vi.fn().mockResolvedValue({ total: 0, resolved: 0 })
}));

function createMockSupabase({ prdData = null, handoffs = [], retroData = null } = {}) {
  const mockSingle = (data) => ({
    data,
    error: data ? null : { message: 'Not found', code: 'PGRST116' }
  });

  return {
    from: vi.fn((table) => {
      if (table === 'product_requirements_v2') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(mockSingle(prdData))
            })
          })
        };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: handoffs, error: null }),
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null })
                })
              })
            })
          })
        };
      }
      if (table === 'retrospectives') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(mockSingle(retroData))
            })
          })
        };
      }
      // Default: empty results
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      };
    })
  };
}

describe('PAT-GATE4-BYPASS-001: Gate 4 Bypass Acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should give full D1 credit when all gates passed directly', async () => {
    const gateResults = {
      gate1: { passed: true, score: 95 },
      gate2: { passed: true, score: 90 },
      gate3: { passed: true, score: 85 }
    };

    const supabase = createMockSupabase({
      prdData: {
        metadata: { design_analysis: { exists: true } },
        directive_id: 'test-sd',
        title: 'Test',
        created_at: new Date().toISOString()
      },
      retroData: { id: 'retro-1', quality_score: 80 }
    });

    const result = await validateGate4LeadFinal('test-sd', supabase, gateResults);

    // Section D1 should get full 10 points
    expect(result.details.executive_validation?.gates_passed).toBe(3);
  });

  it('should credit bypassed handoffs as accepted in D1', async () => {
    // Gates show passed=false (because bypass overrode them)
    // But handoffs are accepted
    const gateResults = {};

    const handoffs = [
      { handoff_type: 'PLAN-TO-EXEC', status: 'accepted', metadata: { gate1_validation: { passed: false, score: 50 } }, created_at: '2026-01-01' },
      { handoff_type: 'EXEC-TO-PLAN', status: 'accepted', metadata: { gate2_validation: { passed: false, score: 60 } }, created_at: '2026-01-02' },
      { handoff_type: 'PLAN-TO-LEAD', status: 'accepted', metadata: { gate3_validation: { passed: false, score: 55 } }, created_at: '2026-01-03' }
    ];

    const supabase = createMockSupabase({
      prdData: {
        metadata: { design_analysis: { exists: true } },
        directive_id: 'test-sd',
        title: 'Test',
        created_at: new Date().toISOString()
      },
      handoffs,
      retroData: { id: 'retro-1', quality_score: 80 }
    });

    const result = await validateGate4LeadFinal('test-sd', supabase, gateResults);

    // gates_passed should be 0 (none truly passed)
    // But gates_accepted_with_bypass should be 3
    expect(result.details.executive_validation?.gates_passed).toBe(0);
    expect(result.details.executive_validation?.gates_accepted_with_bypass).toBe(3);
  });

  it('should return score 100 when no design/database analysis found', async () => {
    const supabase = createMockSupabase({
      prdData: {
        metadata: {},  // No design or database analysis
        directive_id: 'test-sd',
        title: 'Test',
        created_at: new Date().toISOString()
      }
    });

    const result = await validateGate4LeadFinal('test-sd', supabase, {});

    // Should auto-pass (Gate 4 is only for design/database pattern)
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });
});
