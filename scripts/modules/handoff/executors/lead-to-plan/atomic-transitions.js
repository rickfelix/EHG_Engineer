/**
 * Atomic State Transitions for LEAD-TO-PLAN Handoff
 *
 * SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-D Fix 2:
 *   Replace the non-atomic `.update()` in state-transitions.js with a single
 *   PG RPC call that handles advisory locking, idempotency, pre/post state
 *   capture, and transactional rollback on failure.
 *
 *   Pattern mirrors the existing exec-to-plan atomic-transitions.js.
 */

/**
 * Generate deterministic request ID for idempotency
 *
 * @param {string} sdId
 * @param {string} sessionId
 * @returns {string}
 */
export function generateRequestId(sdId, sessionId) {
  const timestampBucket = Math.floor(Date.now() / 60000);
  return `${sdId}-${sessionId || 'unknown'}-${timestampBucket}`;
}

/**
 * Execute atomic LEAD-TO-PLAN state transition via PG RPC.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sdId - SD UUID or sd_key
 * @param {Object} [options]
 * @param {string} [options.sessionId]
 * @param {string} [options.requestId]
 * @returns {Promise<{success: boolean, idempotent_hit?: boolean, audit_id?: string, pre_state?: object, post_state?: object, error?: string, code?: string}>}
 */
export async function executeAtomicLeadToPlanTransition(supabase, sdId, options = {}) {
  const sessionId = options.sessionId || process.env.CLAUDE_SESSION_ID || 'unknown';
  const requestId = options.requestId || generateRequestId(sdId, sessionId);

  console.log('\n🔐 ATOMIC TRANSITION: LEAD → PLAN');
  console.log('-'.repeat(50));
  console.log(`   SD: ${sdId}`);
  console.log(`   Request ID: ${requestId}`);

  try {
    const { data, error } = await supabase.rpc('fn_atomic_lead_to_plan_transition', {
      p_sd_id: sdId,
      p_session_id: sessionId,
      p_request_id: requestId
    });

    if (error) {
      console.error(`   ❌ RPC Error: ${error.message}`);
      return { success: false, error: error.message, code: error.code };
    }

    if (!data?.success) {
      console.error(`   ❌ Transition Failed: ${data?.error}`);
      return { success: false, error: data?.error, code: data?.code };
    }

    if (data.idempotent_hit) {
      console.log('   ⚡ Idempotent hit — transition already completed');
      console.log(`   Audit ID: ${data.audit_id}`);
    } else {
      console.log('   ✅ Transition completed atomically');
      console.log(`   Audit ID: ${data.audit_id}`);
      if (data.pre_state) console.log(`   Pre-state:  ${JSON.stringify(data.pre_state)}`);
      if (data.post_state) console.log(`   Post-state: ${JSON.stringify(data.post_state)}`);
    }

    return {
      success: true,
      idempotent_hit: !!data.idempotent_hit,
      audit_id: data.audit_id,
      pre_state: data.pre_state,
      post_state: data.post_state
    };

  } catch (err) {
    console.error(`   ❌ Exception: ${err.message}`);
    return { success: false, error: err.message, code: 'EXCEPTION' };
  }
}

/**
 * Check whether the atomic RPC is available in the DB (graceful fallback
 * detection).  Mirrors the availability check in exec-to-plan.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<boolean>}
 */
export async function isAtomicLeadToPlanTransitionAvailable(supabase) {
  try {
    const { error } = await supabase.rpc('fn_atomic_lead_to_plan_transition', {
      p_sd_id: 'TEST-AVAILABILITY-CHECK-NOT-A-REAL-SD',
      p_session_id: 'availability-check',
      p_request_id: 'availability-check-' + Date.now()
    });

    if (error) {
      const errorLower = (error.message || '').toLowerCase();
      const code = error.code || '';
      const notExistsPatterns = [
        'does not exist',
        'schema cache',
        'could not find the function',
        '42883' // PostgreSQL undefined-function code
      ];
      for (const p of notExistsPatterns) {
        if (errorLower.includes(p) || code === p) return false;
      }
    }
    // Function exists (either no error, or "SD not found" business error).
    return true;
  } catch {
    return false;
  }
}

export default {
  executeAtomicLeadToPlanTransition,
  isAtomicLeadToPlanTransitionAvailable,
  generateRequestId
};
