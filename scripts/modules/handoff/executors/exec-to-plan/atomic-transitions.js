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
  generateRequestId
};
