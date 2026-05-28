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

function createMockSupabase({ prdData = null, handoffs = [], retroData = null, subAgentResults = [], sdData = { id: 'sd-uuid', sd_key: 'test-sd', sd_type: 'feature' } } = {}) {
  const mockSingle = (data) => ({
    data,
    error: data ? null : { message: 'Not found', code: 'PGRST116' }
  });

  return {
    from: vi.fn((table) => {
      // validateGate4LeadFinal resolves sd_key/UUID via strategic_directives_v2.select().or().single()
      // before any other query (SD-LEO-FIX-GATE-QUERY-DEDUPLICATION-001). Without this branch the
      // default mock has no .or() and the lookup throws -> function returns early/partial.
      if (table === 'strategic_directives_v2') {
        return {
          select: vi.fn().mockReturnValue({
            // primary lookup: .or().single()
            or: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(mockSingle(sdData))
            }),
            // D2 retro-UUID resolution: .eq('sd_key').single()
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(mockSingle(sdData))
            })
          })
        };
      }
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
              // validateExecutiveApproval D2 query: .eq().order().limit().single()
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue(mockSingle(retroData))
                })
              }),
              // legacy callers: .eq().single()
              single: vi.fn().mockResolvedValue(mockSingle(retroData))
            })
          })
        };
      }
      // QF-20260528-877: Section B evidence fallback queries sub_agent_execution_results
      // via .select().eq('sd_id', uuid), awaited directly (no .single()).
      if (table === 'sub_agent_execution_results') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: subAgentResults, error: null })
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

  it('fetches gate1/gate2 from canonical handoff metadata when only gate3 is provided (harness_backlog 5986136e)', async () => {
    // Repro: the PLAN-TO-LEAD wrapper supplies ONLY gate3 (the fresh ctx result). gate1 now
    // lives ONLY under canonical gate_results.GATE1_PRD_QUALITY (legacy gate1_validation is no
    // longer written). Before the fix, the all-null guard (!g1 && !g2 && !g3) was false because
    // gate3 was set, so the canonical fetch was suppressed and gate1/gate2 stayed undefined ->
    // gates_passed=1 ("only 1/3 gates cleared"). After the fix the validator fetches any missing
    // gate, so all three are credited.
    const gateResults = { gate3: { passed: true, score: 85 } };

    const handoffs = [
      { handoff_type: 'PLAN-TO-EXEC', status: 'accepted', metadata: { gate_results: { GATE1_PRD_QUALITY: { passed: true, score: 92 } } }, created_at: '2026-01-01' },
      { handoff_type: 'EXEC-TO-PLAN', status: 'accepted', metadata: { gate_results: { GATE2_IMPLEMENTATION_FIDELITY: { passed: true, score: 88 } } }, created_at: '2026-01-02' }
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

    // gate3 came directly from the caller; gate1/gate2 must be FETCHED from canonical
    // handoff metadata even though gate3 was already present. Before the fix both stayed
    // 'none' (canonical fetch suppressed by the all-null guard). _gateDataSources is set
    // before the Section A-D scoring, so this assertion is robust to unrelated baseline
    // breakage in those later sections (harness_backlog 75bdb4da).
    expect(result._gateDataSources.gate3).toBe('direct');
    expect(result._gateDataSources.gate1).toBe('canonical');
    expect(result._gateDataSources.gate2).toBe('canonical');
    // All three handoffs were accepted, so bypass-credit tracking sees all three.
    expect(result._acceptedHandoffs).toEqual({ gate1: true, gate2: true, gate3: true });
  });
});

describe('QF-20260528-877: Section B sub-agent evidence fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const prdData = {
    metadata: { design_analysis: { exists: true } },
    directive_id: 'test-sd',
    title: 'Test',
    created_at: new Date().toISOString()
  };

  it('awards full B1/B2 from evidence rows when gate3 telemetry is absent', async () => {
    // gate3 is provided but WITHOUT details.sub_agent_effectiveness — the common case where the
    // details sub-object was not threaded into PLAN-TO-LEAD handoff metadata.
    const gateResults = {
      gate2: { passed: true, score: 90 },
      gate3: { passed: true, score: 85 }
    };
    const subAgentResults = [
      { recommendations: 'x'.repeat(600), detailed_analysis: 'analysis' },
      { recommendations: 'short', detailed_analysis: null }
    ];

    const supabase = createMockSupabase({ prdData, subAgentResults });
    const result = await validateGate4LeadFinal('test-sd', supabase, gateResults);

    const b = result.details.value_delivered;
    expect(b.b1_from_evidence).toBe(true);
    expect(b.b2_from_evidence).toBe(true);
    expect(b.substantial_recommendations).toBe(true);
    // B1=10 + B2=10 + B3=5 (gate2>=80) = 25/25 raw -> scaled 35/35
    expect(result.gate_scores.value_delivered).toBe(35);
  });

  it('preserves the 7/10 defaults when no evidence rows exist (no regression)', async () => {
    const gateResults = {
      gate2: { passed: true, score: 90 },
      gate3: { passed: true, score: 85 }
    };

    const supabase = createMockSupabase({ prdData, subAgentResults: [] });
    const result = await validateGate4LeadFinal('test-sd', supabase, gateResults);

    const b = result.details.value_delivered;
    expect(b.b1_estimated).toBe(true);
    expect(b.b2_estimated).toBe(true);
    expect(b.b1_from_evidence).toBeUndefined();
    // B1=7 + B2=7 + B3=5 = 19/25 raw -> scaled round(26.6)=27/35
    expect(result.gate_scores.value_delivered).toBe(27);
  });

  it('uses gate3 telemetry directly when present (evidence fallback not triggered)', async () => {
    const gateResults = {
      gate2: { passed: true, score: 90 },
      gate3: {
        passed: true,
        score: 85,
        details: {
          sub_agent_effectiveness: {
            total_execution_time_ms: 5 * 60 * 1000, // 5 min < 15 -> B1=10
            substantial_recommendations: true         // -> B2=10
          }
        }
      }
    };

    const supabase = createMockSupabase({ prdData });
    const result = await validateGate4LeadFinal('test-sd', supabase, gateResults);

    const b = result.details.value_delivered;
    expect(b.total_execution_time_minutes).toBe(5);
    expect(b.substantial_recommendations).toBe(true);
    expect(b.b1_from_evidence).toBeUndefined();
    expect(b.b2_from_evidence).toBeUndefined();
    expect(result.gate_scores.value_delivered).toBe(35);
  });
});
