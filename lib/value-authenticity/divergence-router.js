// Divergence classifier-router + stakes-weighted convergence threshold
// (SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-002, SSOT L4 §1).
//
// Triangulation is an ATTENTION-ALLOCATION MAP, never a verdict: convergence
// != correctness (correlated false convergence from shared training-corpus
// bias is real). Divergence is a typed 3-way router onto the SSOT
// termination base cases; the threshold is stakes-weighted and
// NON-MONOTONIC -- suspicious perfect unanimity on a hard question is
// itself a flag, not a trust signal.

import { recordDisposition } from '../decision-binding/disposition.js';
import { runResearch } from '../research/research-engine.js';

const STAKES_LEVELS = ['low', 'medium', 'high'];

/**
 * Classify a divergence among panel responses into one of three types that
 * route onto the SSOT termination base cases. Deterministic, pure --
 * operates on STRUCTURED response metadata (subject/value/stance), never
 * free-text NLP, so it is fully seed-fixture-testable.
 *
 * @param {object} params
 * @param {Array<{family: string, subject: string, value: *, stance?: 'factual'|'judgment'}>} params.responses
 * @param {string} params.question
 * @returns {{ type: 'factual'|'judgment'|'underspecified'|null, confidence: number }}
 */
export function classifyDivergence({ responses, question }) {
  if (!Array.isArray(responses) || responses.length < 2) {
    throw new Error('classifyDivergence: responses must be an array of 2+ panel responses');
  }
  if (!question || typeof question !== 'string') {
    throw new Error('classifyDivergence: question is required');
  }

  const subjects = [...new Set(responses.map((r) => r.subject))];
  if (subjects.length > 1) {
    // Panel members answered materially different sub-questions -- the
    // question itself is underspecified, not a factual/judgment dispute.
    return { type: 'underspecified', confidence: (subjects.length - 1) / responses.length };
  }

  const judgmentCount = responses.filter((r) => r.stance === 'judgment').length;
  if (judgmentCount > responses.length / 2) {
    return { type: 'judgment', confidence: judgmentCount / responses.length };
  }

  const values = [...new Set(responses.map((r) => r.value))];
  if (values.length > 1) {
    return { type: 'factual', confidence: (values.length - 1) / responses.length };
  }

  return { type: null, confidence: 1 };
}

/**
 * Route a classified divergence onto its termination base case. All
 * external calls are reused as-is (runResearch, recordDisposition) --
 * injectable for tests via runResearchFn/recordDispositionFn, defaulting
 * to the real implementations.
 *
 * @param {{ type: 'factual'|'judgment'|'underspecified' }} classification
 * @param {object} params
 * @param {string} params.question
 * @param {object} [params.panelContext]
 * @param {object} params.supabase - required for the 'judgment' route
 * @param {Function} [params.runResearchFn]
 * @param {Function} [params.recordDispositionFn]
 */
export async function routeDivergence(classification, {
  question,
  panelContext = {},
  supabase,
  runResearchFn = runResearch,
  recordDispositionFn = recordDisposition,
} = {}) {
  switch (classification.type) {
    case 'factual':
      return { action: 'deep_research', result: await runResearchFn({ question, context: panelContext }) };

    case 'judgment': {
      if (!supabase) throw new Error('routeDivergence: supabase client is required for the judgment (chairman) route');
      // subject is deliberately { question } only (not panelContext) -- the
      // question_key must be idempotent per logical question so repeated
      // escalations (mid-loop judgment route, round-cap force-escalation)
      // dedup onto the SAME disposition row instead of drifting per-round.
      const { row, created } = await recordDispositionFn(supabase, {
        decisionType: 'ratification',
        subject: { question },
        decisionKey: `value-authenticity-judgment:${question}`,
      });
      return { action: 'chairman_escalation', disposition: row, created };
    }

    case 'underspecified':
      return {
        action: 're_spec',
        instruction: { question, reason: 'panel responses answered materially different sub-questions', panelContext },
      };

    default:
      throw new Error(`routeDivergence: unroutable classification type "${classification.type}"`);
  }
}

/**
 * Evaluate whether a panel's responses converge, and how much to trust that
 * convergence. NON-MONOTONIC: trust does not simply rise with agreement --
 * perfect unanimity on a high-stakes (or single-family/degraded) question is
 * itself flagged suspicious, since family diversity does not break shared
 * training-corpus bias and single-family agreement is not diversity at all.
 *
 * @param {object} params
 * @param {Array<{value: *}>} params.responses
 * @param {'low'|'medium'|'high'|'degraded_ok'} params.stakesLevel
 * @returns {{ convergent: boolean, trustLevel: number, suspiciousUnanimity: boolean, requiresExternalConfirmation: boolean, rawAgreement: number }}
 */
export function evaluateConvergence({ responses, stakesLevel }) {
  if (!Array.isArray(responses) || responses.length < 1) {
    throw new Error('evaluateConvergence: responses must be a non-empty array');
  }
  if (!STAKES_LEVELS.includes(stakesLevel) && stakesLevel !== 'degraded_ok') {
    throw new Error(`evaluateConvergence: invalid stakesLevel "${stakesLevel}"`);
  }

  const values = responses.map((r) => r.value);
  const distinctValues = new Set(values);
  const convergent = distinctValues.size === 1;
  const rawAgreement = 1 - (distinctValues.size - 1) / Math.max(values.length - 1, 1);

  const isDegraded = stakesLevel === 'degraded_ok';
  const isHighStakes = stakesLevel === 'high' || isDegraded;
  const suspiciousUnanimity = convergent && isHighStakes;

  let trustLevel;
  if (!convergent) {
    trustLevel = 0;
  } else if (isDegraded) {
    trustLevel = 0.2; // single-family: never full-trust, strictly below any multi-family posture
  } else if (suspiciousUnanimity) {
    trustLevel = 0.4; // high-stakes multi-family convergence: flagged, still low
  } else if (stakesLevel === 'medium') {
    trustLevel = 0.7;
  } else {
    trustLevel = 0.9; // low-stakes convergence
  }

  return {
    convergent,
    trustLevel,
    suspiciousUnanimity,
    requiresExternalConfirmation: !convergent || suspiciousUnanimity,
    rawAgreement,
  };
}

/**
 * High-stakes-convergence-still-requires-external-confirmation guard: even
 * nominally-trusted convergence is never auto-trusted alone on high-stakes
 * (or degraded/single-family) leaves -- the caller MUST route through the
 * 'factual' deep-research path before the claim can be marked authenticated.
 *
 * @param {{ requiresExternalConfirmation: boolean }} convergenceResult
 * @param {'low'|'medium'|'high'|'degraded_ok'} stakesLevel
 * @returns {boolean}
 */
export function requiresExternalConfirmation(convergenceResult, stakesLevel) {
  if (convergenceResult.requiresExternalConfirmation) return true;
  return stakesLevel === 'high' || stakesLevel === 'degraded_ok';
}

export { STAKES_LEVELS };
