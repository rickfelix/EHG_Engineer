/**
 * Feedback Debate Adapter
 * SD-LEO-FEAT-CLARIFY-VERIFICATION-TAXONOMY-001 (FR-2)
 *
 * Wraps the existing DebateOrchestrator to accept generic feedback items
 * for evaluation without requiring /learn proposal records.
 *
 * Converts feedback items into the proposal format expected by the
 * debate orchestrator, runs the debate, and returns structured results.
 */

import { DebateOrchestrator } from './debate-orchestrator.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Run a multi-model debate evaluation on a feedback item
 *
 * @param {Object} params - Evaluation parameters
 * @param {string} params.question - The question or claim to evaluate
 * @param {string} [params.context] - Additional context
 * @param {Object} [params.constraints] - Evaluation constraints
 * @param {string} [params.feedbackId] - Original feedback item ID (for audit)
 * @returns {Object} Structured debate result
 */
export async function evaluateFeedback({ question, context, constraints, feedbackId } = {}) {
  if (!question) {
    throw new Error('Question or claim to evaluate is required');
  }

  // Convert feedback into proposal format for the debate orchestrator
  const syntheticProposal = {
    id: feedbackId || uuidv4(),
    title: question.length > 100 ? question.substring(0, 97) + '...' : question,
    summary: question,
    description: question,
    motivation: context || 'Feedback evaluation via verification lens',
    scope: constraints?.scope || [],
    affected_components: constraints?.affected_components || [],
    risk_level: constraints?.risk_level || 'medium',
    // Mark as synthetic so debate orchestrator skips proposal table checks
    _synthetic: true
  };

  const orchestrator = new DebateOrchestrator({
    maxRounds: 2, // Fewer rounds for feedback eval (speed over depth)
    correlationId: `feedback-debate-${feedbackId || Date.now()}`
  });

  // Override idempotency check for synthetic proposals
  const originalCheck = orchestrator.checkIdempotency.bind(orchestrator);
  orchestrator.checkIdempotency = async (proposalId) => {
    if (syntheticProposal._synthetic) {
      return { can_create: true };
    }
    return originalCheck(proposalId);
  };

  const result = await orchestrator.runDebate(syntheticProposal);

  if (!result.success) {
    return {
      success: false,
      error: result.error || result.reason,
      feedbackId
    };
  }

  // Transform into structured feedback evaluation format
  return {
    success: true,
    feedbackId,
    summary: question,
    verdict: result.finalVerdict,
    score: result.finalScore,
    arguments_for: result.topIssues?.filter(i => !i.toLowerCase().includes('risk')) || [],
    arguments_against: result.topIssues?.filter(i => i.toLowerCase().includes('risk')) || [],
    key_risks: result.topIssues?.slice(0, 3) || [],
    recommendation: result.recommendedNextSteps?.[0] || 'Review debate transcript',
    confidence_score: result.finalScore ? result.finalScore / 100 : 0.5,
    consensusReached: result.consensusReached,
    roundsCompleted: result.roundsCompleted,
    debateId: result.debateId,
    durationMs: result.durationMs
  };
}

export default { evaluateFeedback };
