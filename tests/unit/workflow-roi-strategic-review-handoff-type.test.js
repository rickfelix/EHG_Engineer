/**
 * QF-20260520-261 — Gate 4 strategic_review must match LEAD-FINAL-APPROVAL handoffs.
 *
 * workflow-roi-validation.js queried sd_phase_handoffs with handoff_type='LEAD-FINAL',
 * but handoff rows are written as 'LEAD-FINAL-APPROVAL'. So the LEAD strategic-review
 * documentation check never matched -> strategic_review_completed=false on every SD,
 * keeping Gate 4 sections at 72/100 (<85%) through Pocock Phase 4. Fix matches both via
 * .or('handoff_type.eq.LEAD-FINAL,handoff_type.eq.LEAD-FINAL-APPROVAL').
 *
 * (The pre-existing tests/unit/gate4-bypass-acceptance.test.js mock is drifted from the
 * current validateGate4LeadFinal and already fails on baseline, so it is left untouched;
 * this is a fresh self-contained mock that satisfies the current query chain.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ exec: vi.fn((cmd, cb) => cb && cb(null, '', '')) }));
vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, promisify: () => vi.fn().mockResolvedValue({ stdout: '', stderr: '' }) };
});
vi.mock('../../scripts/modules/adaptive-threshold-calculator.js', () => ({
  calculateAdaptiveThreshold: vi.fn().mockResolvedValue({ threshold: 60 })
}));
vi.mock('../../scripts/modules/pattern-tracking.js', () => ({
  getPatternStats: vi.fn().mockResolvedValue({ total: 0, resolved: 0 })
}));

import { validateGate4LeadFinal } from '../../scripts/modules/workflow-roi-validation.js';

const PRD_WITH_ANALYSIS = {
  metadata: { design_analysis: { exists: true } },
  directive_id: 'SD-QF-261-TEST', title: 'Test', created_at: '2026-05-20T00:00:00Z',
};

// captureOrFilter records the filter string passed to .or() on the sd_phase_handoffs query.
function buildMockSupabase({ strategicHandoff = null, orFilterSpy = null } = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ or: () => ({ single: () => Promise.resolve({ data: { id: 'uuid-1', sd_key: 'SD-QF-261-TEST', sd_type: 'feature' }, error: null }) }) }) };
      }
      if (table === 'product_requirements_v2') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: PRD_WITH_ANALYSIS, error: null }) }) }) };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select: () => ({
            eq: () => ({
              // strategic_review query: .eq(sd_id).or(filter).order().limit(1)
              or: (filter) => {
                if (orFilterSpy) orFilterSpy(filter);
                return { order: () => ({ limit: () => Promise.resolve({ data: strategicHandoff ? [strategicHandoff] : [], error: null }) }) };
              },
              // bypass-acceptance query: .eq(sd_id).order()
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'retrospectives') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { code: 'PGRST116' } }) }) }) };
      }
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }), order: () => Promise.resolve({ data: [], error: null }) }) }) };
    }),
  };
}

const GATES = { gate1: { passed: true, score: 95 }, gate2: { passed: true, score: 90 }, gate3: { passed: true, score: 85 } };

describe('QF-20260520-261: Gate 4 strategic_review matches LEAD-FINAL-APPROVAL', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries sd_phase_handoffs with an .or() covering BOTH LEAD-FINAL and LEAD-FINAL-APPROVAL', async () => {
    const orFilterSpy = vi.fn();
    const supabase = buildMockSupabase({ orFilterSpy });
    await validateGate4LeadFinal('SD-QF-261-TEST', supabase, GATES);
    expect(orFilterSpy).toHaveBeenCalledWith('handoff_type.eq.LEAD-FINAL,handoff_type.eq.LEAD-FINAL-APPROVAL');
  });

  it('credits the strategic review when it is documented on a LEAD-FINAL-APPROVAL handoff', async () => {
    const supabase = buildMockSupabase({
      strategicHandoff: { metadata: { strategic_review: { answered: true } }, created_at: '2026-05-20T00:00:00Z' },
    });
    const result = await validateGate4LeadFinal('SD-QF-261-TEST', supabase, GATES);
    expect(result.details.strategic_review_completed).toBe(true);
  });

  it('leaves strategic_review_completed false when no review handoff exists', async () => {
    const supabase = buildMockSupabase({ strategicHandoff: null });
    const result = await validateGate4LeadFinal('SD-QF-261-TEST', supabase, GATES);
    expect(result.details.strategic_review_completed).toBe(false);
  });
});
