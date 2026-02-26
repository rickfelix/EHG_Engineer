/**
 * Handler: decision.submitted
 * SD: SD-EVA-FEAT-EVENT-BUS-001
 *
 * When a decision is submitted (e.g., chairman decision),
 * check if any blocked venture can be unblocked.
 */

/**
 * Handle a decision.submitted event.
 * @param {object} payload - { ventureId, decisionId, submittedAt }
 * @param {object} context - { supabase, ventureId }
 * @returns {Promise<{ outcome: string }>}
 */
export async function handleDecisionSubmitted(payload, context) {
  const { supabase } = context;
  const { ventureId, decisionId } = payload;

  // Verify the decision exists
  const { data: decision, error: decisionError } = await supabase
    .from('chairman_decisions')
    .select('id, status, venture_id, lifecycle_stage')
    .eq('id', decisionId)
    .single();

  if (decisionError || !decision) {
    const err = new Error(`Decision not found: ${decisionId}`);
    err.retryable = false;
    throw err;
  }

  // Check if the venture is currently blocked
  const { data: venture } = await supabase
    .from('eva_ventures')
    .select('id, status')
    .eq('id', ventureId)
    .single();

  if (!venture) {
    const err = new Error(`Venture not found: ${ventureId}`);
    err.retryable = false;
    throw err;
  }

  // If venture is blocked/paused, check if this decision unblocks it
  if (venture.status === 'blocked' || venture.status === 'paused' || venture.status === 'pending_review') {
    // Decision is approved or rejected - either way, it resolves the block
    if (decision.status === 'approved' || decision.status === 'rejected') {
      const newStatus = decision.status === 'approved' ? 'active' : 'cancelled';

      await supabase
        .from('eva_ventures')
        .update({ status: newStatus })
        .eq('id', ventureId);

      console.log(`[DecisionSubmitted] Venture ${ventureId} unblocked: ${venture.status} → ${newStatus} (decision ${decisionId} ${decision.status})`);
      return { outcome: 'unblocked', ventureId, decisionId, previousStatus: venture.status, newStatus };
    }

    // Decision is still pending - no change
    console.log(`[DecisionSubmitted] Decision ${decisionId} still pending, venture ${ventureId} remains ${venture.status}`);
    return { outcome: 'no_change', ventureId, decisionId, reason: 'decision_still_pending' };
  }

  // Venture is not blocked - decision submitted but no unblocking needed
  console.log(`[DecisionSubmitted] Venture ${ventureId} is ${venture.status}, no unblocking needed`);
  return { outcome: 'no_change', ventureId, decisionId, reason: 'venture_not_blocked' };
}
