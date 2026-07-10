import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/decision-binding/disposition.js', () => ({
  recordDisposition: vi.fn(),
}));

import { recordDisposition } from '../../../lib/decision-binding/disposition.js';
import {
  assemblePanel,
  PanelTooSmallError,
  detectAvailableFamilies,
  shouldRunFullPanel,
  isTerminated,
  runIterativeReview,
  recordCriteriaSelection,
} from '../../../lib/value-authenticity/panel-assembly.js';

const VALID_CLAIM = (overrides = {}) => ({
  claim: 'WTP derives from real elicitation',
  subject: 'wtp_source',
  value: 'real-elicitation',
  stance: 'factual',
  sources: ['https://example.com/survey'],
  evidence_grade: 'E1',
  ...overrides,
});

describe('value-authenticity panel assembly + bounded iterative review (L3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectAvailableFamilies', () => {
    it('reads presence from the expected env vars', () => {
      const prior = { ...process.env };
      process.env.ANTHROPIC_API_KEY = 'x';
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_AI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      expect(detectAvailableFamilies()).toEqual(['anthropic']);
      process.env = prior;
    });
  });

  describe('assemblePanel', () => {
    it('FR-1: fans the same question out across 2+ available families, each validated against the claim shape', async () => {
      const completeFn = vi.fn().mockResolvedValue([VALID_CLAIM()]);
      const detectFamiliesFn = () => ['anthropic', 'openai'];
      const responses = await assemblePanel({
        question: 'q', stakesLevel: 'medium', lenses: ['market', 'technical'], completeFn, detectFamiliesFn,
      });
      expect(responses).toHaveLength(2);
      expect(responses[0].family).toBe('anthropic');
      expect(responses[0].lens).toBe('market');
      expect(responses[1].lens).toBe('technical');
      expect(completeFn).toHaveBeenCalledTimes(2);
    });

    it('FR-1: throws PanelTooSmallError with 1 family and no degraded_ok opt-in -- never proceeds as a lone expert', async () => {
      const detectFamiliesFn = () => ['anthropic'];
      await expect(assemblePanel({ question: 'q', stakesLevel: 'medium', detectFamiliesFn }))
        .rejects.toBeInstanceOf(PanelTooSmallError);
    });

    it('FR-7: proceeds with 1 family when stakesLevel is explicitly degraded_ok', async () => {
      const completeFn = vi.fn().mockResolvedValue([VALID_CLAIM()]);
      const detectFamiliesFn = () => ['anthropic'];
      const responses = await assemblePanel({
        question: 'q', stakesLevel: 'degraded_ok', completeFn, detectFamiliesFn,
      });
      expect(responses).toHaveLength(1);
    });

    it('throws PanelTooSmallError when zero families are available', async () => {
      await expect(assemblePanel({ question: 'q', stakesLevel: 'degraded_ok', detectFamiliesFn: () => [] }))
        .rejects.toBeInstanceOf(PanelTooSmallError);
    });

    it('FR-1: author != adjudicator is structurally enforced', async () => {
      const completeFn = vi.fn().mockResolvedValue([VALID_CLAIM()]);
      const detectFamiliesFn = () => ['anthropic', 'openai'];
      await expect(assemblePanel({
        question: 'q', stakesLevel: 'medium', lenses: ['market'], adjudicatorSessionId: 'panel:anthropic:market', completeFn, detectFamiliesFn,
      })).rejects.toThrow(/author != adjudicator/);
    });

    it('rejects a panel response violating the provenance shape (missing evidence_grade)', async () => {
      const completeFn = vi.fn().mockResolvedValue([{ claim: 'x', subject: 's', value: 'v', stance: 'factual', sources: [] }]);
      const detectFamiliesFn = () => ['anthropic', 'openai'];
      await expect(assemblePanel({ question: 'q', stakesLevel: 'medium', completeFn, detectFamiliesFn }))
        .rejects.toThrow(/violates the provenance shape/);
    });
  });

  describe('shouldRunFullPanel (FR-8 cost-tiering, reuses SPEC-001 classifyTriggerPredicate)', () => {
    it('TS-7: a CRUD/nav leaf does not trigger the full panel', () => {
      expect(shouldRunFullPanel('user can view their order history in a list')).toBe(false);
    });

    it('TS-7: a derived-result leaf (pricing recommendation) triggers the full panel', () => {
      expect(shouldRunFullPanel('system generates a personalized pricing recommendation score for the user')).toBe(true);
    });
  });

  describe('isTerminated (FR-9 termination base cases)', () => {
    it('terminates via a fresh cited primary source', () => {
      const reviewState = { primarySource: { url: 'https://example.com/source', checkedAt: new Date().toISOString() } };
      expect(isTerminated(reviewState)).toBe(true);
    });

    it('does NOT terminate via a stale primary source (freshness window exceeded)', () => {
      const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      const reviewState = { primarySource: { url: 'https://example.com/source', checkedAt: staleDate } };
      expect(isTerminated(reviewState)).toBe(false);
    });

    it('terminates via a dispositioned chairman escalation', () => {
      const reviewState = { disposition: { payload: { status: 'dispositioned' } } };
      expect(isTerminated(reviewState)).toBe(true);
    });

    it('does NOT terminate on an awaiting_disposition row -- must not silently accept an unresolved escalation', () => {
      const reviewState = { disposition: { payload: { status: 'awaiting_disposition' } } };
      expect(isTerminated(reviewState)).toBe(false);
    });

    it('does NOT terminate on an ungrounded state with neither a citation nor a disposition -- never silently accepts', () => {
      expect(isTerminated({})).toBe(false);
    });
  });

  describe('runIterativeReview', () => {
    it('TS-7: cost-tiering -- a CRUD/nav question skips assemblePanel entirely and takes a single grounded pass', async () => {
      const assemblePanelFn = vi.fn();
      const runResearchFn = vi.fn().mockResolvedValue({ success: true, synthesis: {} });
      const result = await runIterativeReview({
        question: 'user can view their order history in a list', stakesLevel: 'low', assemblePanelFn, runResearchFn, supabase: {},
      });
      expect(result.mode).toBe('single_grounded_pass');
      expect(assemblePanelFn).not.toHaveBeenCalled();
      expect(runResearchFn).toHaveBeenCalled();
    });

    it('converges and stops immediately on round 1 without escalation when all responses agree and stakes is low', async () => {
      const agreeingResponses = [
        { family: 'anthropic', lens: 'general', authorSessionId: 'a', claims: [VALID_CLAIM()] },
        { family: 'openai', lens: 'general', authorSessionId: 'b', claims: [VALID_CLAIM()] },
      ];
      const assemblePanelFn = vi.fn().mockResolvedValue(agreeingResponses);
      const result = await runIterativeReview({
        question: 'system generates a personalized pricing recommendation score', stakesLevel: 'low', maxRounds: 3, assemblePanelFn, supabase: {}, detectFamiliesFn: () => ['anthropic', 'openai'],
      });
      expect(result.terminated).toBe(true);
      expect(result.mode).toBe('converged');
      expect(result.rounds).toBe(1);
      expect(assemblePanelFn).toHaveBeenCalledTimes(1);
    });

    it('TS-5: bounded iteration -- a fixture engineered to never converge runs exactly maxRounds and force-escalates at the cap, round N+1 never starts', async () => {
      const divergingResponses = [
        { family: 'anthropic', lens: 'general', authorSessionId: 'a', claims: [VALID_CLAIM({ value: 'answer-A' })] },
        { family: 'openai', lens: 'general', authorSessionId: 'b', claims: [VALID_CLAIM({ value: 'answer-B', stance: 'judgment' })] },
      ];
      const assemblePanelFn = vi.fn().mockResolvedValue(divergingResponses);
      const routeDivergenceFn = vi.fn().mockResolvedValue({ action: 'deep_research', result: {} });
      recordDisposition.mockResolvedValue({ row: { id: 'disp-cap', payload: { status: 'awaiting_disposition' } }, created: true });

      const result = await runIterativeReview({
        question: 'system generates a personalized pricing recommendation score',
        stakesLevel: 'high',
        maxRounds: 3,
        assemblePanelFn,
        routeDivergenceFn,
        supabase: {},
        detectFamiliesFn: () => ['anthropic', 'openai'],
      });

      expect(assemblePanelFn).toHaveBeenCalledTimes(3);
      expect(result.rounds).toBe(3);
      expect(result.mode).toBe('round_cap_escalation');
      expect(recordDisposition).toHaveBeenCalledTimes(1);
      expect(recordDisposition.mock.calls[0][1].decisionKey).toMatch(/round-cap/);
    });

    it('stops iterating immediately on round 2 convergence and does not run round 3', async () => {
      const divergingResponses = [
        { family: 'anthropic', lens: 'general', authorSessionId: 'a', claims: [VALID_CLAIM({ value: 'answer-A', stance: 'judgment' })] },
        { family: 'openai', lens: 'general', authorSessionId: 'b', claims: [VALID_CLAIM({ value: 'answer-B', stance: 'judgment' })] },
      ];
      const agreeingResponses = [
        { family: 'anthropic', lens: 'general', authorSessionId: 'a', claims: [VALID_CLAIM({ value: 'agreed' })] },
        { family: 'openai', lens: 'general', authorSessionId: 'b', claims: [VALID_CLAIM({ value: 'agreed' })] },
      ];
      const assemblePanelFn = vi.fn()
        .mockResolvedValueOnce(divergingResponses)
        .mockResolvedValueOnce(agreeingResponses);
      const routeDivergenceFn = vi.fn().mockResolvedValue({ action: 'chairman_escalation_not_hit', disposition: null });
      // judgment classification on round 1 -> route to chairman only if forced; use a re_spec-safe routing to continue the loop
      routeDivergenceFn.mockResolvedValue({ action: 're_spec', instruction: {} });

      const result = await runIterativeReview({
        question: 'system generates a personalized pricing recommendation score',
        stakesLevel: 'low',
        maxRounds: 3,
        assemblePanelFn,
        routeDivergenceFn,
        supabase: {},
        detectFamiliesFn: () => ['anthropic', 'openai'],
      });

      expect(assemblePanelFn).toHaveBeenCalledTimes(2);
      expect(result.rounds).toBe(2);
      expect(result.mode).toBe('converged');
    });

    it('mid-loop judgment routing to chairman escalation terminates immediately without waiting for the round cap', async () => {
      const divergingJudgment = [
        { family: 'anthropic', lens: 'general', authorSessionId: 'a', claims: [VALID_CLAIM({ value: 'A', stance: 'judgment' })] },
        { family: 'openai', lens: 'general', authorSessionId: 'b', claims: [VALID_CLAIM({ value: 'B', stance: 'judgment' })] },
      ];
      const assemblePanelFn = vi.fn().mockResolvedValue(divergingJudgment);
      const routeDivergenceFn = vi.fn().mockResolvedValue({ action: 'chairman_escalation', disposition: { id: 'disp-mid', payload: { status: 'awaiting_disposition' } } });

      const result = await runIterativeReview({
        question: 'system generates a personalized pricing recommendation score',
        stakesLevel: 'medium',
        maxRounds: 3,
        assemblePanelFn,
        routeDivergenceFn,
        supabase: {},
        detectFamiliesFn: () => ['anthropic', 'openai'],
      });

      expect(assemblePanelFn).toHaveBeenCalledTimes(1);
      expect(result.mode).toBe('chairman_escalation');
      expect(result.rounds).toBe(1);
    });

    it('TS-6: degraded mode -- single available family floors stakesLevel to degraded_ok regardless of the requested level', async () => {
      const singleFamilyResponse = [
        { family: 'anthropic', lens: 'general', authorSessionId: 'a', claims: [VALID_CLAIM()] },
      ];
      const assemblePanelFn = vi.fn().mockResolvedValue(singleFamilyResponse);
      const routeDivergenceFn = vi.fn().mockResolvedValue({ action: 'deep_research', result: {} });
      recordDisposition.mockResolvedValue({ row: { id: 'disp-degraded', payload: { status: 'awaiting_disposition' } }, created: true });
      const result = await runIterativeReview({
        question: 'system generates a personalized pricing recommendation score',
        stakesLevel: 'low',
        maxRounds: 3,
        assemblePanelFn,
        routeDivergenceFn,
        supabase: {},
        detectFamiliesFn: () => ['anthropic'],
      });

      expect(assemblePanelFn).toHaveBeenCalledWith(expect.objectContaining({ stakesLevel: 'degraded_ok' }));
      // Single-family convergence is inherently suspicious -- never terminates as a
      // trusted 'converged' verdict; it proceeds toward divergence-routing/escalation.
      expect(result.mode).not.toBe('converged');
    });
  });

  describe('MarketLens L3 replay (TS-3, SD success criterion #3)', () => {
    it('a grounded panel authors the "WTP derives from real elicitation" claim (distinct from the FNV-1a hash stub, which cannot produce sourced claims), and the persisted criteria_selection surfaces the TR-2 deferral as an E0 gap', async () => {
      const trTwoContext = {
        fr_id: 'TR-2',
        prd_text: 'System shall generate a persona and WTP pricing analysis from user input. Output differs per input.',
      };

      // The grounded panel's real output: it explicitly authors the criterion the
      // hash stub is incapable of producing (a real, sourced elicitation claim),
      // but the elicitation methodology domain claim underneath it is itself weak
      // (E0) -- no real WTP survey was actually run for this venture yet.
      const groundedPanelResponses = [
        {
          family: 'anthropic',
          lens: 'market-research',
          authorSessionId: 'panel:anthropic:market-research',
          claims: [VALID_CLAIM({
            claim: 'WTP derives from real elicitation',
            subject: 'wtp_source',
            value: 'real-elicitation',
            sources: [],
            evidence_grade: 'E0',
          })],
        },
        {
          family: 'openai',
          lens: 'market-research',
          authorSessionId: 'panel:openai:market-research',
          claims: [VALID_CLAIM({
            claim: 'WTP derives from real elicitation',
            subject: 'wtp_source',
            value: 'real-elicitation',
            sources: [],
            evidence_grade: 'E0',
          })],
        },
      ];

      const assemblePanelFn = vi.fn().mockResolvedValue(groundedPanelResponses);
      // Convergent-but-suspicious (high stakes, perfect unanimity) routes to a
      // deep-research gap-fill each round rather than auto-terminating as
      // 'converged' -- mock it so the test never makes a real API call.
      const routeDivergenceFn = vi.fn().mockResolvedValue({ action: 'deep_research', result: {} });
      const result = await runIterativeReview({
        question: 'system generates a personalized pricing recommendation score based on WTP',
        context: trTwoContext,
        stakesLevel: 'high',
        maxRounds: 3,
        assemblePanelFn,
        routeDivergenceFn,
        supabase: {},
        detectFamiliesFn: () => ['anthropic', 'openai'],
      });

      // Convergent on the CLAIM ("WTP derives from real elicitation"), but that
      // claim's own domain evidence is E0 -- the panel authors the criterion the
      // stub fails, while honestly flagging its own grounding as weak. Read
      // from roundHistory (populated every round) since this scenario never
      // reaches the trusted top-level 'converged' terminal state.
      const authoredClaim = result.roundHistory[0].responses[0].claims[0];
      expect(authoredClaim.claim).toBe('WTP derives from real elicitation');
      expect(authoredClaim.evidence_grade).toBe('E0');
      expect(result.roundHistory[0].convergence.suspiciousUnanimity).toBe(true);

      const single = vi.fn().mockResolvedValue({
        data: { id: 'sel-marketlens', effective_grade: 'E0' },
        error: null,
      });
      const supabase = { from: vi.fn().mockReturnValue({ insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) }) };

      const domainClaims = result.roundHistory[0].responses.flatMap((r) => r.claims);
      const selection = await recordCriteriaSelection(supabase, {
        sdKey: 'SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-002',
        frId: 'TR-2',
        criterionId: 'VA-T1-source-reached',
        domainClaims,
        canonicalGrade: 'E1',
      });

      // The TR-2 deferral surfaces as an E0 gap -- never laundered up to the
      // canonical E1 grade despite a confident, convergent panel claim.
      expect(selection.effective_grade).toBe('E0');
    });
  });

  describe('recordCriteriaSelection', () => {
    it('FR-5: persists the effective_grade computed via weakest-link propagation, never the canonical grade alone', async () => {
      const single = vi.fn().mockResolvedValue({
        data: { id: 'sel-1', effective_grade: 'E0', canonical_grade: 'E1', computed_weakest_link_grade: 'E0' },
        error: null,
      });
      const supabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
        }),
      };

      const row = await recordCriteriaSelection(supabase, {
        sdKey: 'SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-002',
        frId: 'FR-1',
        criterionId: 'VA-T1-source-reached',
        domainClaims: [{ evidence_grade: 'E0' }, { evidence_grade: 'E1' }],
        canonicalGrade: 'E1',
      });

      expect(supabase.from).toHaveBeenCalledWith('value_authenticity_criteria_selections');
      expect(row.effective_grade).toBe('E0');
    });

    it('throws without a supabase client', async () => {
      await expect(recordCriteriaSelection(null, { domainClaims: [{ evidence_grade: 'E1' }], canonicalGrade: 'E1' }))
        .rejects.toThrow(/supabase client is required/);
    });
  });
});
