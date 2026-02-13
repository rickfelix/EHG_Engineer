/**
 * Skip-and-Continue Module
 *
 * Implements skip-and-continue logic for validation gate failures in AUTO-PROCEED mode.
 * When a child SD fails validation gates repeatedly (not transient), marks it as blocked,
 * logs the failure, and enables continuation to the next sibling SD.
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-07
 * Discovery Decision D16: Skip failed children, mark as blocked, continue to siblings
 *
 * @module skip-and-continue
 */

import { createClient } from '@supabase/supabase-js';
import { safeTruncate } from '../../../lib/utils/safe-truncate.js';
import { getNextReadyChild, getOrchestratorContext } from './child-sd-selector.js';

// Configuration constants
const DEFAULT_MAX_RETRIES = 2;
const TRANSIENT_ERROR_PATTERNS = [
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'rate limit',
  'temporary',
  'unavailable',
  'try again'
];

/**
 * Check if an error is transient (recoverable)
 * @param {string} errorMessage - Error message to check
 * @returns {boolean} True if error appears transient
 */
export function isTransientError(errorMessage) {
  if (!errorMessage) return false;
  const lowerMessage = errorMessage.toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some(pattern =>
    lowerMessage.includes(pattern.toLowerCase())
  );
}

/**
 * Determine if skip-and-continue should be triggered
 *
 * @param {object} context - Skip decision context
 * @param {object} context.sd - Strategic Directive record
 * @param {object} context.gateResults - Gate validation results
 * @param {number} context.retryCount - Current retry count (default 0)
 * @param {boolean} context.autoProceed - Whether AUTO-PROCEED is enabled
 * @returns {{ shouldSkip: boolean, reason: string }}
 */
export function shouldSkipAndContinue(context) {
  const { sd, gateResults, retryCount = 0, autoProceed = false } = context;

  // Only trigger in AUTO-PROCEED mode
  if (!autoProceed) {
    return { shouldSkip: false, reason: 'AUTO-PROCEED not enabled' };
  }

  // Only for child SDs (must have parent)
  if (!sd?.parent_sd_id) {
    return { shouldSkip: false, reason: 'Not a child SD (no parent_sd_id)' };
  }

  // Gate must have failed
  if (gateResults?.passed) {
    return { shouldSkip: false, reason: 'Gates passed - no skip needed' };
  }

  // Check if transient error
  const failedGateMessage = gateResults?.issues?.join(' ') || '';
  if (isTransientError(failedGateMessage) && retryCount < DEFAULT_MAX_RETRIES) {
    return { shouldSkip: false, reason: `Transient error, retry ${retryCount + 1}/${DEFAULT_MAX_RETRIES}` };
  }

  // Check retry count
  if (retryCount < DEFAULT_MAX_RETRIES) {
    return { shouldSkip: false, reason: `Retry ${retryCount + 1}/${DEFAULT_MAX_RETRIES} - not yet exhausted` };
  }

  // All conditions met - should skip and continue
  return {
    shouldSkip: true,
    reason: `Gate failure after ${retryCount} retries (non-transient)`
  };
}

/**
 * Mark an SD as blocked with failure metadata
 *
 * @param {object} supabase - Supabase client
 * @param {string} sdId - SD ID to mark as blocked
 * @param {object} blockingInfo - Information about why SD is blocked
 * @param {string} blockingInfo.gate - Gate that caused blocking
 * @param {number} blockingInfo.score - Final gate score
 * @param {number} blockingInfo.threshold - Required threshold
 * @param {string[]} blockingInfo.issues - List of issues
 * @param {number} blockingInfo.retryCount - Number of retries attempted
 * @param {string} blockingInfo.correlationId - Correlation ID for tracing
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function markAsBlocked(supabase, sdId, blockingInfo) {
  try {
    // Get current SD to preserve existing metadata
    const { data: currentSD, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('metadata, status')
      .eq('id', sdId)
      .single();

    if (fetchError) {
      console.warn(`   [skip-and-continue] Could not fetch SD: ${fetchError.message}`);
      return { success: false, error: fetchError.message };
    }

    // Build blocked metadata
    const blockedMetadata = {
      ...(currentSD.metadata || {}),
      blocked_reason: `Gate ${blockingInfo.gate} failed with score ${blockingInfo.score}/${blockingInfo.threshold}`,
      blocked_at: new Date().toISOString(),
      blocked_by_gate: blockingInfo.gate,
      gate_score: blockingInfo.score,
      gate_threshold: blockingInfo.threshold,
      gate_issues: blockingInfo.issues,
      retry_count: blockingInfo.retryCount,
      correlation_id: blockingInfo.correlationId,
      can_unblock: true
    };

    // Update SD status to blocked
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'blocked',
        metadata: blockedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', sdId)
      .eq('updated_at', currentSD.updated_at); // Optimistic lock

    if (updateError) {
      // Check if it's an optimistic lock failure
      if (updateError.message.includes('0 rows')) {
        console.warn('   [skip-and-continue] Optimistic lock failed - SD may already be blocked');
        return { success: true, alreadyBlocked: true };
      }
      console.warn(`   [skip-and-continue] Could not update SD: ${updateError.message}`);
      return { success: false, error: updateError.message };
    }

    console.log(`   ✅ SD ${sdId} marked as blocked`);
    console.log(`      Gate: ${blockingInfo.gate}`);
    console.log(`      Score: ${blockingInfo.score}/${blockingInfo.threshold}`);

    return { success: true };
  } catch (err) {
    console.warn(`   [skip-and-continue] Error marking SD as blocked: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Record a SKIP_AND_CONTINUE event in system_events
 *
 * @param {object} supabase - Supabase client
 * @param {object} eventData - Event data
 * @param {string} eventData.skippedSdId - SD that was skipped
 * @param {string} eventData.nextSiblingId - Next sibling SD (or null)
 * @param {string} eventData.orchestratorId - Parent orchestrator SD ID
 * @param {string} eventData.blockedReason - Reason for blocking
 * @param {string} eventData.gateThatFailed - Name of failed gate
 * @param {string} eventData.correlationId - Correlation ID for tracing
 * @param {string} eventData.sessionId - Session ID
 * @returns {Promise<{ success: boolean, eventId?: string }>}
 */
export async function recordSkipEvent(supabase, eventData) {
  try {
    const { data, error } = await supabase
      .from('system_events')
      .insert({
        event_type: 'SKIP_AND_CONTINUE',
        sd_id: eventData.skippedSdId,
        details: {
          correlation_id: eventData.correlationId,
          blocked_reason: eventData.blockedReason,
          gate_that_failed: eventData.gateThatFailed,
          next_sibling_id: eventData.nextSiblingId,
          orchestrator_id: eventData.orchestratorId,
          session_id: eventData.sessionId,
          timestamp: new Date().toISOString()
        }
      })
      .select('id')
      .single();

    if (error) {
      // Non-fatal - continue even if event logging fails
      console.warn(`   [skip-and-continue] Could not record event: ${error.message}`);
      return { success: false };
    }

    console.log(`   📝 SKIP_AND_CONTINUE event recorded: ${data.id}`);
    return { success: true, eventId: data.id };
  } catch (err) {
    // Non-fatal - continue even if event logging fails
    console.warn(`   [skip-and-continue] Event recording error: ${err.message}`);
    return { success: false };
  }
}

/**
 * Record an ALL_CHILDREN_BLOCKED event when all siblings are blocked
 *
 * @param {object} supabase - Supabase client
 * @param {string} orchestratorId - Parent orchestrator SD ID
 * @param {array} blockedChildren - List of blocked child SDs
 * @param {string} correlationId - Correlation ID for tracing
 * @returns {Promise<{ success: boolean }>}
 */
export async function recordAllBlockedEvent(supabase, orchestratorId, blockedChildren, correlationId) {
  try {
    const { error } = await supabase
      .from('system_events')
      .insert({
        event_type: 'ALL_CHILDREN_BLOCKED',
        sd_id: orchestratorId,
        details: {
          correlation_id: correlationId,
          blocked_children: blockedChildren.map(c => ({
            id: c.id,
            title: c.title,
            blocked_reason: c.metadata?.blocked_reason
          })),
          blocked_count: blockedChildren.length,
          timestamp: new Date().toISOString()
        }
      });

    if (error) {
      console.warn(`   [skip-and-continue] Could not record ALL_CHILDREN_BLOCKED: ${error.message}`);
      return { success: false };
    }

    return { success: true };
  } catch (err) {
    console.warn(`   [skip-and-continue] ALL_CHILDREN_BLOCKED recording error: ${err.message}`);
    return { success: false };
  }
}

/**
 * Execute skip-and-continue flow
 *
 * Main entry point for skip-and-continue. Marks current SD as blocked,
 * finds next sibling, and returns continuation information.
 *
 * @param {object} params - Execution parameters
 * @param {object} params.supabase - Supabase client
 * @param {object} params.sd - Current SD that failed
 * @param {object} params.gateResults - Gate validation results
 * @param {string} params.correlationId - Correlation ID for tracing
 * @param {string} params.sessionId - Session ID
 * @returns {Promise<{
 *   executed: boolean,
 *   nextSibling: object | null,
 *   allBlocked: boolean,
 *   reason: string
 * }>}
 */
export async function executeSkipAndContinue(params) {
  const { supabase, sd, gateResults, correlationId, sessionId } = params;

  console.log('\n🔄 SKIP-AND-CONTINUE (D16)');
  console.log('═'.repeat(50));
  console.log(`   SD: ${sd.id}`);
  console.log(`   Title: ${sd.title}`);
  console.log(`   Failed Gate: ${gateResults.failedGate}`);
  console.log(`   Score: ${gateResults.totalScore}/${gateResults.totalMaxScore}`);

  // Step 1: Mark current SD as blocked
  const blockResult = await markAsBlocked(supabase, sd.id, {
    gate: gateResults.failedGate,
    score: gateResults.totalScore,
    threshold: gateResults.totalMaxScore,
    issues: gateResults.issues,
    retryCount: DEFAULT_MAX_RETRIES,
    correlationId
  });

  if (!blockResult.success && !blockResult.alreadyBlocked) {
    // Continue anyway - blocking status update is best-effort
    console.warn('   ⚠️  Could not mark SD as blocked, continuing to sibling selection');
  }

  // Step 2: Find next sibling
  const { sd: nextSibling, allComplete, reason } = await getNextReadyChild(
    supabase,
    sd.parent_sd_id,
    sd.id // Exclude current SD
  );

  // Step 3: Record skip event
  await recordSkipEvent(supabase, {
    skippedSdId: sd.id,
    nextSiblingId: nextSibling?.id || null,
    orchestratorId: sd.parent_sd_id,
    blockedReason: `Gate ${gateResults.failedGate} failed`,
    gateThatFailed: gateResults.failedGate,
    correlationId,
    sessionId
  });

  // Step 4: Check if all children are now blocked
  if (!nextSibling && !allComplete) {
    console.log('\n   ⚠️  ALL CHILDREN BLOCKED');
    console.log('   Cannot proceed - all siblings are blocked or in non-ready state');

    // Get blocked children for reporting
    const { children } = await getOrchestratorContext(supabase, sd.parent_sd_id);
    const blockedChildren = children.filter(c => c.status === 'blocked');

    await recordAllBlockedEvent(supabase, sd.parent_sd_id, blockedChildren, correlationId);

    console.log('   Blocked children:');
    blockedChildren.forEach(c => {
      console.log(`      • ${c.id}: ${safeTruncate(c.title || '', 40)}`);
    });

    console.log('═'.repeat(50));

    return {
      executed: true,
      nextSibling: null,
      allBlocked: true,
      reason: `All ${blockedChildren.length} children are blocked`
    };
  }

  // Step 5: Return next sibling for continuation
  if (nextSibling) {
    console.log('\n   ✅ CONTINUING TO NEXT SIBLING');
    console.log(`   Next: ${nextSibling.id}`);
    console.log(`   Title: ${nextSibling.title}`);
    console.log('═'.repeat(50));

    return {
      executed: true,
      nextSibling,
      allBlocked: false,
      reason: 'Skipped to next sibling'
    };
  }

  // All children complete (not blocked)
  if (allComplete) {
    console.log('\n   ✅ ALL CHILDREN COMPLETE');
    console.log('═'.repeat(50));

    return {
      executed: true,
      nextSibling: null,
      allBlocked: false,
      reason: reason
    };
  }

  // Fallback
  console.log('═'.repeat(50));
  return {
    executed: true,
    nextSibling: null,
    allBlocked: false,
    reason: reason
  };
}

/**
 * Create a Supabase client using environment variables
 * @returns {object} Supabase client
 */
export function createSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export default {
  shouldSkipAndContinue,
  markAsBlocked,
  recordSkipEvent,
  recordAllBlockedEvent,
  executeSkipAndContinue,
  isTransientError,
  createSupabaseClient,
  DEFAULT_MAX_RETRIES
};
