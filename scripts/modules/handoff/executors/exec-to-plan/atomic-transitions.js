/**
 * Atomic State Transitions for EXEC-TO-PLAN Handoff
 * SD: SD-LEO-INFRA-HARDENING-001
 *
 * Replaces the 3 independent awaits with a single atomic RPC call.
 * Features:
 * - Transaction-level advisory locking (prevents concurrent transitions)
 * - Idempotency via request_id (safe retries)
 * - Pre/post state capture in sd_transition_audit table
 * - Automatic rollback on failure
 */

/**
 * Generate deterministic request ID for idempotency
 * @param {string} sdId - Strategic Directive ID
 * @param {string} sessionId - Current session ID
 * @returns {string} Deterministic request ID
 */
export function generateRequestId(sdId, sessionId) {
  // Use timestamp bucket (1-minute granularity) for idempotency window
  const timestampBucket = Math.floor(Date.now() / 60000);
  return `${sdId}-${sessionId || 'unknown'}-${timestampBucket}`;
}

/**
 * Resolve a Strategic Directive identifier (id or sd_key) to its uuid_id column
 * value -- the SAME column fn_atomic_exec_to_plan_transition resolves p_sd_id to
 * internally (database/migrations/20260406_fix_exec_to_plan_sd_status.sql:39-43,
 * `SELECT uuid_id INTO v_sd_uuid ... WHERE id = p_sd_id OR sd_key = p_sd_id`) and
 * then matches against user_stories.sd_id. uuid_id is a separate column from the
 * primary key id (kept in sync with uuid_internal_pk via its own trigger), so this
 * must NOT be conflated with resolveSdInput()'s id field.
 * Fails soft (returns null) so a resolution error never aborts the RPC transition.
 * @param {Object} supabase
 * @param {string} sdId
 * @returns {Promise<string|null>}
 */
export async function resolveSdUuidId(supabase, sdId) {
  try {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('uuid_id')
      .or(`id.eq.${sdId},sd_key.eq.${sdId}`)
      .limit(1)
      .maybeSingle();
    return data?.uuid_id || null;
  } catch {
    return null;
  }
}

/**
 * Capture the SD's in_progress stories before the RPC call -- the only status
 * value fn_atomic_exec_to_plan_transition's own CASE actually promotes to
 * completed. Fails soft (returns []) so a read error never aborts the transition.
 * @param {Object} supabase
 * @param {string|null} sdUuidId
 * @returns {Promise<Array<{id: string, completed_by: string|null}>>}
 */
export async function captureInProgressStories(supabase, sdUuidId) {
  if (!sdUuidId) return [];
  try {
    const { data } = await supabase
      .from('user_stories')
      .select('id, completed_by')
      .eq('sd_id', sdUuidId)
      .eq('status', 'in_progress');
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Stamp provenance on exactly the stories the RPC actually promoted to
 * completed, matching the same guard discipline as finalizeUserStories()/
 * transitionUserStoriesToValidated(): only a genuine first-time completion is
 * stamped, an existing completed_by is never overwritten. Pure no-op when
 * beforeInProgress is empty (covers both "nothing to promote" and an
 * idempotent-hit retry, where the original call already promoted everything).
 * Fails soft -- a stamp failure never reverses or fails the already-successful
 * RPC transition.
 * @param {Object} supabase
 * @param {Array<{id: string, completed_by: string|null}>} beforeInProgress
 */
export async function stampRpcPromotedStories(supabase, beforeInProgress) {
  if (!beforeInProgress || beforeInProgress.length === 0) return;
  try {
    const ids = beforeInProgress.map((s) => s.id);
    const { data: after } = await supabase
      .from('user_stories')
      .select('id, status, completed_by')
      .in('id', ids);

    const now = new Date().toISOString();
    for (const story of after || []) {
      if (story.status === 'completed' && !story.completed_by) {
        await supabase
          .from('user_stories')
          .update({ completed_by: 'system:fn_atomic_exec_to_plan_transition', completed_at: now })
          .eq('id', story.id);
      }
    }
  } catch (err) {
    console.log(`   ⚠️  Provenance stamp diff failed (non-fatal, transition already succeeded): ${err.message}`);
  }
}

/**
 * Execute atomic EXEC-TO-PLAN state transition
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID (id or sd_key)
 * @param {string} prdId - PRD ID (prd_id or uuid_id)
 * @param {Object} options - Additional options
 * @param {string} [options.sessionId] - Current session ID
 * @param {string} [options.requestId] - Custom request ID for idempotency
 * @returns {Promise<{success: boolean, audit_id?: string, stories_updated?: number, error?: string}>}
 */
export async function executeAtomicExecToPlanTransition(supabase, sdId, prdId, options = {}) {
  const sessionId = options.sessionId || process.env.CLAUDE_SESSION_ID || 'unknown';
  const requestId = options.requestId || generateRequestId(sdId, sessionId);

  console.log('\n🔐 ATOMIC TRANSITION: EXEC → PLAN');
  console.log('-'.repeat(50));
  console.log(`   SD: ${sdId}`);
  console.log(`   PRD: ${prdId || '(none)'}`);
  console.log(`   Request ID: ${requestId}`);

  // Provenance-stamp diff: capture in_progress stories before the RPC call so
  // we can stamp exactly the rows it promotes afterward, without touching its
  // SQL body. Resolved/captured before the try block's RPC call so a failure
  // here (soft-failed to null/[] above) never affects the transition itself.
  const sdUuidId = await resolveSdUuidId(supabase, sdId);
  const beforeInProgress = await captureInProgressStories(supabase, sdUuidId);

  try {
    const { data, error } = await supabase.rpc('fn_atomic_exec_to_plan_transition', {
      p_sd_id: sdId,
      p_prd_id: prdId || null,
      p_session_id: sessionId,
      p_request_id: requestId
    });

    if (error) {
      console.error(`   ❌ RPC Error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }

    if (!data.success) {
      console.error(`   ❌ Transition Failed: ${data.error}`);
      return {
        success: false,
        error: data.error,
        code: data.code
      };
    }

    // Stamp provenance on whichever previously-in_progress stories the RPC
    // just promoted to completed. Covers both the fresh-success path below and
    // an idempotent-hit retry (beforeInProgress is naturally empty on a retry,
    // since the original call already promoted everything -- this is then a
    // pure no-op, requiring no special-casing of data.idempotent_hit).
    await stampRpcPromotedStories(supabase, beforeInProgress);

    // Check for idempotent hit
    if (data.idempotent_hit) {
      console.log('   ⚡ Idempotent hit - transition already completed');
      console.log(`   Audit ID: ${data.audit_id}`);
      return {
        success: true,
        idempotent_hit: true,
        audit_id: data.audit_id
      };
    }

    console.log('   ✅ Transition completed atomically');
    console.log(`   Audit ID: ${data.audit_id}`);
    console.log(`   Stories Updated: ${data.stories_updated}`);

    if (data.pre_state) {
      console.log(`   Pre-state: ${JSON.stringify(data.pre_state)}`);
    }
    if (data.post_state) {
      console.log(`   Post-state: ${JSON.stringify(data.post_state)}`);
    }

    return {
      success: true,
      audit_id: data.audit_id,
      stories_updated: data.stories_updated,
      pre_state: data.pre_state,
      post_state: data.post_state
    };

  } catch (err) {
    console.error(`   ❌ Exception: ${err.message}`);
    return {
      success: false,
      error: err.message,
      code: 'EXCEPTION'
    };
  }
}

/**
 * Check if atomic transition function is available
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @returns {Promise<boolean>}
 */
export async function isAtomicTransitionAvailable(supabase) {
  try {
    // Try to call with invalid params - if function exists, we get param error, not function-not-found
    const { error } = await supabase.rpc('fn_atomic_exec_to_plan_transition', {
      p_sd_id: 'TEST-AVAILABILITY-CHECK',
      p_prd_id: null,
      p_session_id: 'test',
      p_request_id: 'availability-check-' + Date.now()
    });

    // Function does NOT exist if any of these patterns match
    const notExistsPatterns = [
      'does not exist',
      'schema cache',
      'Could not find the function',
      'function .* does not exist',
      '42883' // PostgreSQL error code for undefined function
    ];

    if (error) {
      const errorLower = error.message?.toLowerCase() || '';
      const code = error.code || '';

      for (const pattern of notExistsPatterns) {
        if (errorLower.includes(pattern.toLowerCase()) || code === pattern) {
          console.log(`   ℹ️  Atomic transition RPC not available: ${pattern}`);
          return false;
        }
      }

      // If error is about SD not found or other business logic, function exists
      if (errorLower.includes('sd not found') || errorLower.includes('invalid')) {
        return true;
      }
    }

    return true; // Function exists (either no error, or unexpected error)
  } catch (e) {
    console.log(`   ℹ️  Atomic transition availability check failed: ${e.message}`);
    return false;
  }
}

/**
 * Fallback: Execute transitions sequentially (legacy mode)
 * Used when atomic RPC is not available
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sdId
 * @param {Object} prd
 * @returns {Promise<{success: boolean}>}
 */
export async function executeLegacyTransitions(supabase, sdId, prd) {
  console.log('\n⚠️  LEGACY TRANSITION MODE (non-atomic)');
  console.log('-'.repeat(50));

  // Import legacy functions
  const { transitionUserStoriesToValidated } = await import('./state-transitions.js');
  const { transitionPrdToVerification } = await import('./state-transitions.js');
  const { transitionSDToExecComplete } = await import('./state-transitions.js');

  try {
    await transitionUserStoriesToValidated(supabase, sdId);
    await transitionPrdToVerification(supabase, prd);
    await transitionSDToExecComplete(supabase, sdId);

    return { success: true, legacy: true };
  } catch (err) {
    return { success: false, error: err.message, legacy: true };
  }
}

export default {
  executeAtomicExecToPlanTransition,
  isAtomicTransitionAvailable,
  executeLegacyTransitions,
  generateRequestId,
  resolveSdUuidId,
  captureInProgressStories,
  stampRpcPromotedStories
};
