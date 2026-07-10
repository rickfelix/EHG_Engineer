import { describe, it, expect, vi } from 'vitest';
import {
  classifyDivergence,
  routeDivergence,
  evaluateConvergence,
  requiresExternalConfirmation,
} from '../../../lib/value-authenticity/divergence-router.js';

describe('value-authenticity divergence classifier-router (L4)', () => {
  describe('classifyDivergence', () => {
    it('TS-2: factual fixture -- same subject, contradictory values, not judgment -- classifies as factual', () => {
      const responses = [
        { family: 'anthropic', subject: 'US_population_2020', value: 331_000_000, stance: 'factual' },
        { family: 'openai', subject: 'US_population_2020', value: 328_000_000, stance: 'factual' },
        { family: 'google', subject: 'US_population_2020', value: 331_000_000, stance: 'factual' },
      ];
      const result = classifyDivergence({ responses, question: 'What was the US population in 2020?' });
      expect(result.type).toBe('factual');
    });

    it('TS-2: judgment fixture -- same subject, explicit tradeoff/judgment stance, no factual contradiction -- classifies as judgment', () => {
      const responses = [
        { family: 'anthropic', subject: 'pricing_model', value: 'usage-based', stance: 'judgment' },
        { family: 'openai', subject: 'pricing_model', value: 'flat-rate', stance: 'judgment' },
        { family: 'google', subject: 'pricing_model', value: 'usage-based', stance: 'judgment' },
      ];
      const result = classifyDivergence({ responses, question: 'What pricing model should we use?' });
      expect(result.type).toBe('judgment');
    });

    it('TS-2: underspecified fixture -- responses answer materially different sub-questions -- classifies as underspecified, no external call needed to classify', () => {
      const responses = [
        { family: 'anthropic', subject: 'onboarding_flow_length', value: '3 steps', stance: 'factual' },
        { family: 'openai', subject: 'pricing_tier_count', value: '4 tiers', stance: 'factual' },
        { family: 'google', subject: 'support_channel', value: 'email', stance: 'factual' },
      ];
      const result = classifyDivergence({ responses, question: 'What should the product look like?' });
      expect(result.type).toBe('underspecified');
    });

    it('returns type=null when all responses agree (nothing to classify)', () => {
      const responses = [
        { family: 'anthropic', subject: 'x', value: 1, stance: 'factual' },
        { family: 'openai', subject: 'x', value: 1, stance: 'factual' },
      ];
      expect(classifyDivergence({ responses, question: 'q' }).type).toBeNull();
    });

    it('throws on fewer than 2 responses', () => {
      expect(() => classifyDivergence({ responses: [{ subject: 'x', value: 1 }], question: 'q' })).toThrow(/2\+ panel responses/);
    });
  });

  describe('routeDivergence', () => {
    it('TS-2: factual classification routes to deep-research (runResearchFn called with the disputed question)', async () => {
      const runResearchFn = vi.fn().mockResolvedValue({ success: true, synthesis: {} });
      const result = await routeDivergence(
        { type: 'factual' },
        { question: 'What was the US population in 2020?', runResearchFn },
      );
      expect(result.action).toBe('deep_research');
      expect(runResearchFn).toHaveBeenCalledWith(expect.objectContaining({ question: 'What was the US population in 2020?' }));
    });

    it('TS-2: judgment classification creates a decision-binding disposition row (chairman escalation)', async () => {
      const recordDispositionFn = vi.fn().mockResolvedValue({ row: { id: 'disp-1', payload: { status: 'awaiting_disposition' } }, created: true });
      const result = await routeDivergence(
        { type: 'judgment' },
        { question: 'What pricing model?', supabase: {}, recordDispositionFn },
      );
      expect(result.action).toBe('chairman_escalation');
      expect(recordDispositionFn).toHaveBeenCalledWith({}, expect.objectContaining({ decisionType: 'ratification' }));
      expect(result.disposition.payload.status).toBe('awaiting_disposition');
    });

    it('judgment route throws without a supabase client', async () => {
      await expect(routeDivergence({ type: 'judgment' }, { question: 'q' })).rejects.toThrow(/supabase client is required/);
    });

    it('TS-2: underspecified classification returns a re-spec instruction with no external call made', async () => {
      const runResearchFn = vi.fn();
      const recordDispositionFn = vi.fn();
      const result = await routeDivergence(
        { type: 'underspecified' },
        { question: 'What should the product look like?', runResearchFn, recordDispositionFn },
      );
      expect(result.action).toBe('re_spec');
      expect(result.instruction.question).toBe('What should the product look like?');
      expect(runResearchFn).not.toHaveBeenCalled();
      expect(recordDispositionFn).not.toHaveBeenCalled();
    });

    it('throws on an unroutable classification type', async () => {
      await expect(routeDivergence({ type: 'nonsense' }, { question: 'q' })).rejects.toThrow(/unroutable/);
    });
  });

  describe('evaluateConvergence', () => {
    it('TS-1: perfect unanimity on a high-stakes seeded misconception is flagged suspicious and requires external confirmation', () => {
      const responses = [{ value: 'wrong-but-popular-answer' }, { value: 'wrong-but-popular-answer' }, { value: 'wrong-but-popular-answer' }];
      const result = evaluateConvergence({ responses, stakesLevel: 'high' });
      expect(result.convergent).toBe(true);
      expect(result.suspiciousUnanimity).toBe(true);
      expect(result.requiresExternalConfirmation).toBe(true);
    });

    it('non-unanimous, low-stakes convergence is not suspicious and does not require external confirmation', () => {
      const responses = [{ value: 'a' }, { value: 'a' }];
      const result = evaluateConvergence({ responses, stakesLevel: 'low' });
      expect(result.convergent).toBe(true);
      expect(result.suspiciousUnanimity).toBe(false);
      expect(result.requiresExternalConfirmation).toBe(false);
    });

    it('non-convergent responses always require external confirmation regardless of stakes', () => {
      const responses = [{ value: 'a' }, { value: 'b' }];
      const result = evaluateConvergence({ responses, stakesLevel: 'low' });
      expect(result.convergent).toBe(false);
      expect(result.requiresExternalConfirmation).toBe(true);
    });

    it('trustLevel is non-monotonic: it DECREASES as stakesLevel rises at constant (perfect) agreement', () => {
      const responses = [{ value: 'x' }, { value: 'x' }];
      const low = evaluateConvergence({ responses, stakesLevel: 'low' });
      const medium = evaluateConvergence({ responses, stakesLevel: 'medium' });
      const high = evaluateConvergence({ responses, stakesLevel: 'high' });
      expect(low.trustLevel).toBeGreaterThan(medium.trustLevel);
      expect(medium.trustLevel).toBeGreaterThan(high.trustLevel);
    });

    it('degraded_ok (single-family) trustLevel is strictly lower than full multi-family high-stakes trustLevel on identical responses', () => {
      const responses = [{ value: 'x' }, { value: 'x' }];
      const high = evaluateConvergence({ responses, stakesLevel: 'high' });
      const degraded = evaluateConvergence({ responses, stakesLevel: 'degraded_ok' });
      expect(degraded.trustLevel).toBeLessThan(high.trustLevel);
      expect(degraded.requiresExternalConfirmation).toBe(true);
    });

    it('throws on an invalid stakesLevel', () => {
      expect(() => evaluateConvergence({ responses: [{ value: 1 }], stakesLevel: 'extreme' })).toThrow(/invalid stakesLevel/);
    });
  });

  describe('requiresExternalConfirmation (FR-4 guard)', () => {
    it('TS-1/high-stakes-convergence guard: high stakes + high raw agreement still requires external confirmation, never auto-trusted on agreement alone', () => {
      const convergent = { convergent: true, requiresExternalConfirmation: false };
      expect(requiresExternalConfirmation(convergent, 'high')).toBe(true);
    });

    it('low-stakes + convergent does not over-fire the guard', () => {
      const convergent = { convergent: true, requiresExternalConfirmation: false };
      expect(requiresExternalConfirmation(convergent, 'low')).toBe(false);
    });

    it('degraded_ok always requires external confirmation via the guard', () => {
      const convergent = { convergent: true, requiresExternalConfirmation: false };
      expect(requiresExternalConfirmation(convergent, 'degraded_ok')).toBe(true);
    });
  });
});
