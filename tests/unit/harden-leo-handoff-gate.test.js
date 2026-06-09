/**
 * SD-LEO-INFRA-HARDEN-LEO-HANDOFF-001 — regression tests for two PLAN-TO-LEAD gate bugs.
 *
 * FR-1: GATE4_WORKFLOW_ROI precheck/execute non-determinism. gate3 (PLAN-TO-LEAD Traceability)
 *       is fresh during the in-flight handoff and only persisted once it is ACCEPTED. The
 *       executor wrapper passed it via ctx (gate3='direct'); the validator-registry/preloader
 *       path did not, and the self-fetch only finds gate3 on an already-accepted PLAN-TO-LEAD
 *       (absent on first execute) -> gate3='none' -> _estimated=true -> ~69 vs ~89. The fix makes
 *       validateGate4LeadFinal compute gate3 fresh when unresolved, so both paths score the same.
 *
 * FR-2: acceptance-criteria-validation queried story_test_mappings by a non-existent `story_id`
 *       column (real FK is `user_story_id`), so every validated story scored the 70 default.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- FR-1: validateGate4LeadFinal gate3 determinism ----
vi.mock('child_process', () => ({ exec: vi.fn((cmd, cb) => cb && cb(null, '', '')) }));
vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, promisify: () => vi.fn().mockResolvedValue({ stdout: '', stderr: '' }) };
});
vi.mock('../../scripts/modules/adaptive-threshold-calculator.js', () => ({
  calculateAdaptiveThreshold: vi.fn().mockResolvedValue({ threshold: 60 }),
  checkGatePassed: vi.fn().mockReturnValue(true),
  YELLOW_BAND_WIDTH: 5,
}));
vi.mock('../../scripts/modules/pattern-tracking.js', () => ({
  getPatternStats: vi.fn().mockResolvedValue({ total: 0, resolved: 0 }),
}));
// The fix dynamically imports this; capture the call to prove gate3 is computed fresh.
const computeGate3Spy = vi.fn().mockResolvedValue({ passed: true, score: 85, gate: 'GATE3_TRACEABILITY' });
vi.mock('../../scripts/modules/traceability-validation.js', () => ({
  validateGate3PlanToLead: computeGate3Spy,
}));

import { validateGate4LeadFinal } from '../../scripts/modules/workflow-roi-validation.js';

const PRD_WITH_ANALYSIS = {
  metadata: { design_analysis: { exists: true } },
  directive_id: 'SD-HARDEN-TEST', title: 'Test', created_at: '2026-06-08T00:00:00Z',
};

// No accepted PLAN-TO-LEAD handoff exists (handoff fetch returns []), so without the fix gate3
// would resolve to 'none'. gate1/gate2 are supplied directly.
function buildMockSupabase() {
  return {
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ or: () => ({ single: () => Promise.resolve({ data: { id: 'uuid-1', sd_key: 'SD-HARDEN-TEST', sd_type: 'feature' }, error: null }) }) }) };
      }
      if (table === 'product_requirements_v2') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: PRD_WITH_ANALYSIS, error: null }) }) }) };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
              order: () => Promise.resolve({ data: [], error: null }), // handoff fetch: none accepted
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

describe('FR-1: GATE4_WORKFLOW_ROI gate3 determinism', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes gate3 fresh when it is not supplied and no accepted PLAN-TO-LEAD exists', async () => {
    const supabase = buildMockSupabase();
    const result = await validateGate4LeadFinal('SD-HARDEN-TEST', supabase, { gate1: { passed: true, score: 95 }, gate2: { passed: true, score: 90 } });
    // The fix invoked the fresh gate3 compute instead of leaving gate3 'none'.
    expect(computeGate3Spy).toHaveBeenCalledTimes(1);
    expect(result._gateDataSources.gate3).toBe('computed');
    // gate3 resolved -> not estimated (the divergence driver is gone).
    expect(result._estimated).toBe(false);
  });

  it('does NOT recompute gate3 when the caller already supplied it (executor path unchanged)', async () => {
    const supabase = buildMockSupabase();
    const result = await validateGate4LeadFinal('SD-HARDEN-TEST', supabase, {
      gate1: { passed: true, score: 95 }, gate2: { passed: true, score: 90 }, gate3: { passed: true, score: 85 },
    });
    expect(computeGate3Spy).not.toHaveBeenCalled();
    expect(result._gateDataSources.gate3).toBe('direct');
  });

  it('is deterministic: gate3 source is resolved (not none) on BOTH the supplied and the absent path', async () => {
    const withGate3 = await validateGate4LeadFinal('SD-HARDEN-TEST', buildMockSupabase(), { gate1: { passed: true, score: 95 }, gate2: { passed: true, score: 90 }, gate3: { passed: true, score: 85 } });
    const withoutGate3 = await validateGate4LeadFinal('SD-HARDEN-TEST', buildMockSupabase(), { gate1: { passed: true, score: 95 }, gate2: { passed: true, score: 90 } });
    // Both paths now have a resolved gate3 (the pre-fix divergence was 'direct' vs 'none').
    expect(withGate3._estimated).toBe(false);
    expect(withoutGate3._estimated).toBe(false);
  });
});

// ---- FR-2: acceptance-criteria-validation credits stories via user_story_id ----
describe('FR-2: acceptance-criteria test mapping uses the real user_story_id FK', () => {
  let createAcceptanceCriteriaValidationGate;
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../scripts/modules/handoff/executors/plan-to-lead/gates/acceptance-criteria-validation.js');
    createAcceptanceCriteriaValidationGate = mod.createAcceptanceCriteriaValidationGate;
  });

  // One validated story with acceptance criteria. `mappingRows` is what story_test_mappings returns.
  function mockSupabase({ mappingRows = [], inSpy = null, selectSpy = null } = {}) {
    const story = { id: 'story-1', title: 'S1', status: 'completed', validation_status: 'validated', acceptance_criteria: ['ac1'], e2e_test_status: null, e2e_test_path: null };
    return {
      from: vi.fn((table) => {
        if (table === 'strategic_directives_v2') return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        if (table === 'sd_type_validation_profiles') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { requires_user_stories: true }, error: null }) }) }) };
        if (table === 'user_stories') return { select: () => ({ eq: () => Promise.resolve({ data: [story], error: null }) }) };
        if (table === 'story_test_mappings') {
          return {
            select: (cols) => { if (selectSpy) selectSpy(cols); return { in: (col, ids) => { if (inSpy) inSpy(col, ids); return Promise.resolve({ data: mappingRows, error: null }); } }; },
          };
        }
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }),
    };
  }

  it('queries story_test_mappings by user_story_id (not the non-existent story_id)', async () => {
    const selectSpy = vi.fn(); const inSpy = vi.fn();
    const gate = createAcceptanceCriteriaValidationGate(mockSupabase({ mappingRows: [], selectSpy, inSpy }));
    await gate.validator({ sd: { id: 'sd-1', sd_key: 'SD-HARDEN-TEST', sd_type: 'feature' } });
    expect(selectSpy).toHaveBeenCalledWith('user_story_id');
    expect(inSpy).toHaveBeenCalledWith('user_story_id', ['story-1']);
  });

  it('credits a validated story that HAS a story_test_mappings row (score 100, not the 70 default)', async () => {
    const gate = createAcceptanceCriteriaValidationGate(mockSupabase({ mappingRows: [{ user_story_id: 'story-1' }] }));
    const result = await gate.validator({ sd: { id: 'sd-1', sd_key: 'SD-HARDEN-TEST', sd_type: 'feature' } });
    expect(result.score).toBe(100);
  });

  it('scores the 70 default when the validated story has NO mapping', async () => {
    const gate = createAcceptanceCriteriaValidationGate(mockSupabase({ mappingRows: [] }));
    const result = await gate.validator({ sd: { id: 'sd-1', sd_key: 'SD-HARDEN-TEST', sd_type: 'feature' } });
    expect(result.score).toBe(70);
  });
});
