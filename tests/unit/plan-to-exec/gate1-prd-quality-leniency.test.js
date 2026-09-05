/**
 * SD-LEO-FIX-GATE-PLAN-EXEC-001 (escalated from QF-20260903-239).
 *
 * gate-1-plan-to-exec.js's prdQualityValidation gate previously called validatePRDQuality()
 * directly and passed its result straight into registry.normalizeResult -- since
 * validatePRDHeuristic hard-fails on ANY nonzero issues regardless of score, a well-scoring
 * PRD with even one flagged item (e.g. a placeholder requirement) was blocked exactly like an
 * empty PRD. The fix applies score-based leniency INLINE, heuristic-path only, using a
 * category-derived threshold (getStoryMinimumScoreByCategory) -- never routing through
 * validatePRDForHandoff, which would also leak leniency into the AI-rubric path.
 *
 * PRD test_scenarios TS-1..TS-8 (see product_requirements_v2, id
 * PRD-SD-LEO-FIX-GATE-PLAN-EXEC-001) are implemented below 1:1, incorporating TESTING sub-agent
 * findings (sub_agent_execution_results d4676393-9dc8-4ecd-9065-cbea28dc2c23): TS-1 avoids the
 * insufficient-acceptance-criteria unconditional-block class (that fixture's natural single
 * issue collided with FR-3/AC-3); TS-3/TS-4a/TS-4b/TS-5/TS-6/TS-7 stub validatePRDQuality's
 * return value directly rather than hand-constructing real-scorer fixtures (brittle/unreachable
 * per TESTING's live measurements).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../scripts/modules/prd-quality-validation.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, validatePRDQuality: vi.fn(actual.validatePRDQuality) };
});

const { validatePRDQuality } = await import('../../../scripts/modules/prd-quality-validation.js');
const { registerGate1Validators } = await import(
  '../../../scripts/modules/handoff/validation/validator-registry/gates/gate-1-plan-to-exec.js'
);
const { ValidatorRegistry } = await import(
  '../../../scripts/modules/handoff/validation/validator-registry/core.js'
);

function makeRegistry() {
  const registry = new ValidatorRegistry();
  registerGate1Validators(registry);
  return registry;
}

/** A minimal, valid heuristic-shaped PRD skeleton (3+ FRs, 3+ ACs, no unconditional-block issues). */
function baseHeuristicPrd(overrides = {}) {
  return {
    id: 'PRD-TEST',
    functional_requirements: [
      { title: 'FR one', description: 'does a real thing' },
      { title: 'FR two', description: 'does another real thing' },
      { title: 'FR three', description: 'does a third real thing' },
    ],
    acceptance_criteria: [
      { criterion: 'AC one is verifiable' },
      { criterion: 'AC two is verifiable' },
      { criterion: 'AC three is verifiable' },
    ],
    test_scenarios: [{ scenario: 'a' }, { scenario: 'b' }, { scenario: 'c' }],
    system_architecture: { overview: 'x' },
    implementation_approach: { phases: [] },
    risks: [{ risk: 'x' }],
    executive_summary: 'A sufficiently long executive summary describing the change in enough detail.',
    ...overrides,
  };
}

describe('gate-1 prdQualityValidation: score-based leniency fix', () => {
  beforeEach(() => {
    vi.mocked(validatePRDQuality).mockClear();
  });

  it('TS-1: a heuristic PRD whose only issue is a placeholder/boilerplate requirement, scoring 85, passes', async () => {
    // One functional_requirement contains placeholder text (-10) and the executive_summary is
    // short (-5) -> 100-15=85. No insufficient-count issues (3 FRs, 3 ACs both present).
    const prd = baseHeuristicPrd({
      functional_requirements: [
        { title: 'placeholder', description: 'TBD placeholder text to be filled in' },
        { title: 'FR two', description: 'does a real thing' },
        { title: 'FR three', description: 'does a real thing' },
      ],
      executive_summary: 'short',
    });
    const registry = makeRegistry();
    const spy = vi.spyOn(registry, 'normalizeResult');
    const validator = registry.get('prdQualityValidation');

    const result = await validator({ prd, sd: { category: 'Fix', sd_type: 'bugfix' } });

    expect(result.score).toBe(85);
    expect(result.passed).toBe(true);
    // AC-2: the object passed INTO normalizeResult, not merely the output, carries max_score:100.
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ passed: true, max_score: 100 }));
    expect(result.warnings.some((w) => /placeholder/i.test(w))).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('TS-2: a truthy-but-empty {} PRD does not throw and returns a failing verdict', async () => {
    const registry = makeRegistry();
    const validator = registry.get('prdQualityValidation');

    const result = await validator({ prd: {}, sd: { category: 'Fix', sd_type: 'bugfix' } });

    expect(result.passed).toBe(false);
    expect(result.max_score).toBe(100);
    expect(result.score).toBe(0);
  });

  it('TS-3: an AI-rubric-path PRD (details.method absent) preserves its own passed verdict unchanged', async () => {
    vi.mocked(validatePRDQuality).mockResolvedValueOnce({
      prd_id: 'PRD-TEST', valid: false, passed: false, score: 72,
      issues: ['semantic gap flagged by rubric'], warnings: [],
      boilerplateDetails: {}, details: { /* no method key -- matches prd-quality-rubric.js's real shape */ },
    });
    const registry = makeRegistry();
    const validator = registry.get('prdQualityValidation');

    const result = await validator({ prd: baseHeuristicPrd(), sd: { category: 'Fix', sd_type: 'bugfix' } });

    expect(result.passed).toBe(false);
    expect(result.issues).toEqual(['semantic gap flagged by rubric']);
  });

  it('TS-4a: a stubbed score of 53 (below the Fix/bugfix threshold of 55) fails on the score alone, no unconditional-block issues present', async () => {
    vi.mocked(validatePRDQuality).mockResolvedValueOnce({
      prd_id: 'PRD-TEST', valid: false, passed: false, score: 53,
      issues: ['Missing system_architecture'], warnings: [],
      boilerplateDetails: {}, details: { method: 'heuristic' },
    });
    const registry = makeRegistry();
    const validator = registry.get('prdQualityValidation');

    const result = await validator({ prd: baseHeuristicPrd(), sd: { category: 'Fix', sd_type: 'bugfix' } });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(53);
  });

  it('TS-4b: a high score (90) with an insufficient-functional-requirements issue still fails (unconditional-block class)', async () => {
    vi.mocked(validatePRDQuality).mockResolvedValueOnce({
      prd_id: 'PRD-TEST', valid: false, passed: false, score: 90,
      issues: ['PRD-TEST: Insufficient functional requirements (2, min 3)'], warnings: [],
      boilerplateDetails: {}, details: { method: 'heuristic' },
    });
    const registry = makeRegistry();
    const validator = registry.get('prdQualityValidation');

    const result = await validator({ prd: baseHeuristicPrd(), sd: { category: 'Fix', sd_type: 'bugfix' } });

    expect(result.passed).toBe(false);
    expect(result.issues).toEqual(['PRD-TEST: Insufficient functional requirements (2, min 3)']);
  });

  it('TS-5: boundary -- stubbed score 55 (category Fix threshold) with one non-blocking issue passes; 54 fails', async () => {
    const registry = makeRegistry();
    const validator = registry.get('prdQualityValidation');

    vi.mocked(validatePRDQuality).mockResolvedValueOnce({
      prd_id: 'PRD-TEST', valid: false, passed: false, score: 55,
      issues: ['PRD-TEST: 1 placeholder/boilerplate requirements'], warnings: [],
      boilerplateDetails: {}, details: { method: 'heuristic' },
    });
    const at55 = await validator({ prd: baseHeuristicPrd(), sd: { category: 'Fix', sd_type: 'bugfix' } });
    expect(at55.passed).toBe(true);

    vi.mocked(validatePRDQuality).mockResolvedValueOnce({
      prd_id: 'PRD-TEST', valid: false, passed: false, score: 54,
      issues: ['PRD-TEST: 1 placeholder/boilerplate requirements'], warnings: [],
      boilerplateDetails: {}, details: { method: 'heuristic' },
    });
    const at54 = await validator({ prd: baseHeuristicPrd(), sd: { category: 'Fix', sd_type: 'bugfix' } });
    expect(at54.passed).toBe(false);
  });

  it('TS-6: sd absent falls back to the default threshold (70), not a silently lower one', async () => {
    vi.mocked(validatePRDQuality).mockResolvedValueOnce({
      prd_id: 'PRD-TEST', valid: false, passed: false, score: 65,
      issues: ['PRD-TEST: 1 placeholder/boilerplate requirements'], warnings: [],
      boilerplateDetails: {}, details: { method: 'heuristic' },
    });
    const registry = makeRegistry();
    const validator = registry.get('prdQualityValidation');

    const result = await validator({ prd: baseHeuristicPrd(), sd: undefined });

    expect(result.passed).toBe(false); // 65 < default 70
  });

  it('TS-7: category/sd_type divergence resolves to different live thresholds', async () => {
    const registry = makeRegistry();
    const validator = registry.get('prdQualityValidation');
    const stub = (score) => ({
      prd_id: 'PRD-TEST', valid: false, passed: false, score,
      issues: ['PRD-TEST: 1 placeholder/boilerplate requirements'], warnings: [],
      boilerplateDetails: {}, details: { method: 'heuristic' },
    });

    vi.mocked(validatePRDQuality).mockResolvedValueOnce(stub(52));
    const infra = await validator({ prd: baseHeuristicPrd(), sd: { category: 'Infrastructure', sd_type: 'bugfix' } });
    expect(infra.passed).toBe(true); // 52 >= 50

    vi.mocked(validatePRDQuality).mockResolvedValueOnce(stub(60));
    const security = await validator({ prd: baseHeuristicPrd(), sd: { category: 'Security', sd_type: 'bugfix' } });
    expect(security.passed).toBe(false); // 60 < 68
  });

  it('TS-6b: the refactor_brief carve-out is NOT replicated here (accepted divergence, pinned) -- gate-1 uses the plain category threshold even for a refactor_brief PRD', async () => {
    // PlanToExecVerifier.js:336 special-cases document_type==='refactor_brief' to a flat 50;
    // getStoryMinimumScoreByCategory itself has no such awareness. A regression in this test
    // means someone silently added refactor_brief-awareness to gate-1, which is out of this
    // SD's scope (FR-4) and would need its own deliberate decision, not a silent drift.
    vi.mocked(validatePRDQuality).mockResolvedValueOnce({
      prd_id: 'PRD-TEST', valid: false, passed: false, score: 52,
      issues: ['PRD-TEST: 1 placeholder/boilerplate requirements'], warnings: [],
      boilerplateDetails: {}, details: { method: 'heuristic' },
    });
    const registry = makeRegistry();
    const validator = registry.get('prdQualityValidation');

    const result = await validator({
      prd: baseHeuristicPrd({ document_type: 'refactor_brief' }),
      sd: { category: 'Security', sd_type: 'bugfix' }, // threshold 68 via getStoryMinimumScoreByCategory
    });

    // If gate-1 replicated the refactor_brief carve-out (flat 50), 52 would pass. It does not
    // replicate it, so the Security-category threshold (68) applies and 52 fails.
    expect(result.passed).toBe(false);
  });

  it('TS-9: a REAL content-empty PRD for a reduced-penalty category (threshold 50, empty-PRD score 53 clears it) still fails -- the unconditional-block regexes, not the score, are the operative guard here', async () => {
    // TESTING sub-agent finding (sub_agent_execution_results e45e5976-e0cf-443e-81ac-
    // c394faa9c73b, D2): for category=infrastructure/documentation (threshold 50 via
    // getStoryMinimumScoreByCategory), a real content-empty PRD scores 53 -- the score
    // itself CLEARS that threshold. FR-3/AC-1's "still fails under the category-derived
    // threshold" framing is imprecise for this band: the real blocker is FR-3/AC-3's
    // unconditional-block issue classes (insufficient functional requirements /
    // acceptance criteria), which TS-4a (category=Fix, where the score alone blocks) and
    // TS-4b (stubbed) do not isolate. This uses NO mock -- the real validatePRDQuality
    // heuristic path -- to prove the regex guard is load-bearing where it is the SOLE guard.
    const registry = makeRegistry();
    const validator = registry.get('prdQualityValidation');
    const emptyPrd = {
      id: 'PRD-EMPTY',
      functional_requirements: [],
      acceptance_criteria: [],
      test_scenarios: [],
      executive_summary: '',
    };

    const result = await validator({ prd: emptyPrd, sd: { category: 'Infrastructure', sd_type: 'bugfix' } });

    expect(result.score).toBe(53); // measured live; clears the threshold of 50 for this category
    expect(result.passed).toBe(false); // must still fail -- the unconditional-block regexes, not the score, block it
    expect(result.issues.some((i) => /Insufficient functional requirements/.test(i))).toBe(true);
  });

  it('TS-8: leo_validation_rules.criteria.min_score is never read by this validator (documents the inert config)', async () => {
    // options.criteria is never consulted -- the validator only reads context.prd/sd/options
    // (sdType/sdCategory), matching ValidationOrchestrator.js placing rule.criteria on
    // gate.meta only, never the mergedContext passed to the validator function.
    vi.mocked(validatePRDQuality).mockResolvedValueOnce({
      prd_id: 'PRD-TEST', valid: false, passed: false, score: 55,
      issues: ['PRD-TEST: 1 placeholder/boilerplate requirements'], warnings: [],
      boilerplateDetails: {}, details: { method: 'heuristic' },
    });
    const registry = makeRegistry();
    const validator = registry.get('prdQualityValidation');

    const result = await validator({
      prd: baseHeuristicPrd(),
      sd: { category: 'Fix', sd_type: 'bugfix' },
      options: { criteria: { min_score: 5 } }, // if this were read, everything would trivially pass at score 5
    });

    // Threshold used is still getStoryMinimumScoreByCategory('Fix','bugfix')=55, not the
    // criteria.min_score=5 passed in options -- score 55 >= 55 passes for the RIGHT reason.
    expect(result.passed).toBe(true);
  });
});
