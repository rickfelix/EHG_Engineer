/**
 * Multi-Session Claim Conflict Gate
 * PAT-MSESS-BYP-001 corrective action
 *
 * BLOCKING gate that prevents handoff execution when the target SD
 * is already claimed by another active session. This prevents duplicate
 * work across concurrent Claude Code instances.
 *
 * Previously, _claimSDForSession() in BaseExecutor only WARNED about
 * conflicts but proceeded anyway. This gate makes claim conflicts a
 * hard block.
 *
 * Checks:
 *   1. Query v_active_sessions for the SD
 *   2. If claimed by another session with active heartbeat → BLOCK
 *   3. If claimed by THIS session → PASS
 *   4. If unclaimed or stale claim → PASS
 */

/**
 * Validate that no other active session has claimed this SD
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD identifier (sd_key like "SD-XXX-001" or UUID)
 * @param {Object} [options] - Options
 * @param {string} [options.currentSessionId] - This session's ID (to exclude self)
 * @returns {Promise<Object>} Gate result { pass, score, max_score, issues, warnings, claimDetails }
 */
export async function validateMultiSessionClaim(supabase, sdId, options = {}) {
  const currentSessionId = options.currentSessionId || null;

  console.log('\n🔒 GATE: Multi-Session Claim Conflict Check');
  console.log('-'.repeat(50));
  console.log(`   SD: ${sdId}`);

  try {
    // Query v_active_sessions for any active claim on this SD
    const { data, error } = await supabase
      .from('v_active_sessions')
      .select('session_id, sd_id, sd_title, hostname, tty, heartbeat_age_human, heartbeat_age_seconds, computed_status, codebase')
      .eq('sd_id', sdId)
      .in('computed_status', ['active']);

    if (error) {
      // DB error → fail-open (don't block on infrastructure issues)
      console.log(`   ⚠️  Could not check session claims: ${error.message}`);
      console.log('   → Proceeding (fail-open on DB error)');
      return {
        pass: true,
        score: 80,
        max_score: 100,
        issues: [],
        warnings: [`Could not verify session claims: ${error.message}`]
      };
    }

    // Filter out our own session
    const otherClaims = (data || []).filter(
      claim => claim.session_id !== currentSessionId
    );

    if (otherClaims.length === 0) {
      console.log('   ✅ No conflicting session claims found');
      return {
        pass: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: []
      };
    }

    // Another active session has this SD claimed → BLOCK
    const claim = otherClaims[0];

    console.log('');
    console.log('   ┌─────────────────────────────────────────────────────────────┐');
    console.log('   │  🚫 BLOCKED: SD CLAIMED BY ANOTHER ACTIVE SESSION           │');
    console.log('   ├─────────────────────────────────────────────────────────────┤');
    console.log(`   │  SD:         ${sdId}`);
    console.log(`   │  Session:    ${claim.session_id?.substring(0, 36) || 'unknown'}`);
    console.log(`   │  Hostname:   ${claim.hostname || 'unknown'}`);
    console.log(`   │  TTY:        ${claim.tty || 'unknown'}`);
    console.log(`   │  Heartbeat:  ${claim.heartbeat_age_human || 'unknown'}`);
    console.log(`   │  Codebase:   ${claim.codebase || 'unknown'}`);
    console.log('   ├─────────────────────────────────────────────────────────────┤');
    console.log('   │  Another Claude Code instance is actively working on this   │');
    console.log('   │  SD. Starting work here would cause duplicate effort.       │');
    console.log('   │                                                             │');
    console.log('   │  OPTIONS:                                                   │');
    console.log('   │  1. Pick a different SD (run npm run sd:next)               │');
    console.log('   │  2. Wait for the other session to finish                    │');
    console.log('   │  3. Release the claim in the other session first            │');
    console.log('   └─────────────────────────────────────────────────────────────┘');
    console.log('');

    return {
      pass: false,
      score: 0,
      max_score: 100,
      issues: [
        `SD ${sdId} is claimed by another active session (${claim.hostname || 'unknown'}, heartbeat: ${claim.heartbeat_age_human || 'unknown'})`
      ],
      warnings: [],
      claimDetails: {
        sessionId: claim.session_id,
        hostname: claim.hostname,
        tty: claim.tty,
        heartbeatAgeHuman: claim.heartbeat_age_human,
        heartbeatAgeSeconds: claim.heartbeat_age_seconds,
        codebase: claim.codebase
      }
    };
  } catch (err) {
    // Unexpected error → fail-open
    console.log(`   ⚠️  Claim check error: ${err.message}`);
    console.log('   → Proceeding (fail-open on unexpected error)');
    return {
      pass: true,
      score: 80,
      max_score: 100,
      issues: [],
      warnings: [`Multi-session claim check failed: ${err.message}`]
    };
  }
}

/**
 * Create Multi-Session Claim Conflict Gate for handoff integration
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD identifier
 * @param {Object} [options] - Options including currentSessionId
 * @returns {Object} Gate configuration
 */
export function createMultiSessionClaimGate(supabase, sdId, options = {}) {
  return {
    name: 'GATE_MULTI_SESSION_CLAIM_CONFLICT',
    validator: async () => {
      return validateMultiSessionClaim(supabase, sdId, options);
    },
    required: true,
    blocking: true,
    remediation: `SD ${sdId} is claimed by another active session. Pick a different SD with 'npm run sd:next' or release the claim in the other session.`
  };
}

export default { validateMultiSessionClaim, createMultiSessionClaimGate };
