/**
 * LEO Protocol Automated Shipping Module
 *
 * Provides LLM-powered automated shipping decisions for:
 * - PR Creation (after EXEC-TO-PLAN handoff)
 * - PR Merge (after LEAD-FINAL-APPROVAL handoff)
 * - Branch Cleanup (after successful merge)
 *
 * Uses GPT-5.2 for intelligent decision-making with human escalation
 * only when confidence is LOW.
 *
 * @module shipping
 * @version 1.0.0
 */

export { ShippingContextBuilder } from './ShippingContextBuilder.js';
export { ShippingDecisionEvaluator } from './ShippingDecisionEvaluator.js';
export { ShippingExecutor } from './ShippingExecutor.js';

/**
 * Convenience function to run automated shipping for a given decision type
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} repoPath - Path to git repository
 * @param {string} handoffType - EXEC-TO-PLAN or LEAD-FINAL-APPROVAL
 * @param {string} decisionType - PR_CREATION, PR_MERGE, or BRANCH_CLEANUP
 * @returns {Promise<Object>} Shipping result
 */
export async function runAutomatedShipping(sdId, repoPath, handoffType, decisionType) {
  const { ShippingContextBuilder } = await import('./ShippingContextBuilder.js');
  const { ShippingDecisionEvaluator } = await import('./ShippingDecisionEvaluator.js');
  const { ShippingExecutor } = await import('./ShippingExecutor.js');

  console.log(`\n🚢 [AUTO-SHIP] Starting ${decisionType} decision...`);
  console.log(`   SD: ${sdId}`);
  console.log(`   Handoff: ${handoffType}`);
  console.log('-'.repeat(50));

  // Build context
  const contextBuilder = new ShippingContextBuilder(sdId, repoPath);
  const context = await contextBuilder.buildContext(handoffType);

  // Make decision
  const evaluator = new ShippingDecisionEvaluator(decisionType);
  const decision = await evaluator.makeDecision(context);

  console.log(`   Decision: ${decision.decision}`);
  console.log(`   Confidence: ${decision.confidence} (${decision.confidenceScore}%)`);
  console.log(`   Reasoning: ${decision.reasoning}`);

  // Execute if not escalating
  if (!decision.shouldEscalate) {
    const executor = new ShippingExecutor(decision.executionContext);
    const result = await executor.execute(decision.decision, decisionType);

    return {
      ...decision,
      executionResult: result
    };
  }

  return decision;
}

/**
 * Run all shipping decisions for LEAD-FINAL-APPROVAL
 * (PR Merge + Branch Cleanup)
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} repoPath - Path to git repository
 * @returns {Promise<Object>} Combined shipping results
 */
export async function runFinalApprovalShipping(sdId, repoPath) {
  const results = {
    merge: null,
    cleanup: null
  };

  // First, try to merge PR
  results.merge = await runAutomatedShipping(
    sdId,
    repoPath,
    'LEAD-FINAL-APPROVAL',
    'PR_MERGE'
  );

  // If merge succeeded, cleanup branch
  if (results.merge.executionResult?.success) {
    results.cleanup = await runAutomatedShipping(
      sdId,
      repoPath,
      'LEAD-FINAL-APPROVAL',
      'BRANCH_CLEANUP'
    );
  }

  return results;
}
