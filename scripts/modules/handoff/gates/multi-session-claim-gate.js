/**
 * Multi-Session Claim Conflict Gate
 * PAT-MSESS-BYP-001 + SD-LEO-FIX-FIX-MULTI-SESSION-001 corrective action
 *
 * BLOCKING gate that prevents handoff execution when the target SD
 * is already claimed by an active session from a DIFFERENT Claude Code
 * conversation. This prevents duplicate work across concurrent instances.
 *
 * Identity model (PAT-SESSION-IDENTITY-002):
 *   - Different hostname → different machine → BLOCK
 *   - Same hostname + different terminal_id → different conversation → BLOCK
 *   - Same hostname + same terminal_id → same conversation (multiple CLI
 *     subprocesses from one Claude Code instance) → ALLOW
 *
 * Checks:
 *   1. Query v_active_sessions for the SD
 *   2. If claimed by session on DIFFERENT hostname → BLOCK
 *   3. If claimed by session on SAME hostname + DIFFERENT terminal_id → BLOCK
 *   4. If claimed by session on SAME hostname + SAME terminal_id → PASS
 *   5. If unclaimed or stale claim → PASS
 *
 * RCA: PAT-SESSION-IDENTITY-001 - Session identity for AI-driven CLI
 * workflows must compare by hostname, not subprocess PID.
 * FIX: SD-LEO-FIX-FIX-MULTI-SESSION-001 - Add terminal_id to discriminator.
 */

import os from 'os';

// PAT-SESSION-IDENTITY-003: Centralized terminal identity
// Import from single source of truth to prevent duplication cascade
import { getTerminalId } from '../../../../lib/terminal-identity.js';

/**
 * Validate that no session on another machine has claimed this SD
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD identifier (sd_key like "SD-XXX-001" or UUID)
 * @param {Object} [options] - Options
 * @param {string} [options.currentSessionId] - This session's ID (to exclude self)
 * @param {string} [options.currentHostname] - This machine's hostname (for same-machine detection)
 * @param {string} [options.currentTerminalId] - This conversation's terminal_id (for same-conversation detection)
 * @returns {Promise<Object>} Gate result { pass, score, max_score, issues, warnings, claimDetails }
 */
export async function validateMultiSessionClaim(supabase, sdId, options = {}) {
  const currentSessionId = options.currentSessionId || null;
  const currentHostname = options.currentHostname || os.hostname();
  const currentTerminalId = options.currentTerminalId || getTerminalId();

  console.log('\n🔒 GATE: Multi-Session Claim Conflict Check');
  console.log('-'.repeat(50));
  console.log(`   SD: ${sdId}`);

  try {
    // Query v_active_sessions for any active claim on this SD
    const { data, error } = await supabase
      .from('v_active_sessions')
      .select('session_id, sd_id, sd_title, hostname, tty, terminal_id, heartbeat_age_human, heartbeat_age_seconds, computed_status, codebase')
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

    // Filter out claims from the SAME Claude Code conversation.
    // PAT-SESSION-IDENTITY-002: A single Claude Code conversation spawns multiple
    // CLI processes (sd:start, handoff.js), each with different PIDs and session IDs.
    // These share the same hostname AND terminal_id (based on parent PID).
    // Two DIFFERENT Claude Code conversations on the same machine have the same
    // hostname but DIFFERENT terminal_ids — those ARE conflicts.
    const otherClaims = (data || []).filter(claim => {
      // Exact session ID match → always exclude (backward compat)
      if (claim.session_id === currentSessionId) return false;
      // Same hostname + same terminal_id → same conversation → not a conflict
      if (claim.hostname && claim.hostname === currentHostname &&
          claim.terminal_id && claim.terminal_id === currentTerminalId) {
        return false;
      }
      return true;
    });

    if (otherClaims.length === 0) {
      // Check if we passed due to same-conversation exclusion (log for visibility)
      const sameConversationClaims = (data || []).filter(
        claim => claim.session_id !== currentSessionId &&
                 claim.hostname === currentHostname &&
                 claim.terminal_id === currentTerminalId
      );
      if (sameConversationClaims.length > 0) {
        console.log(`   ✅ SD claimed by same-conversation session (${sameConversationClaims[0].session_id?.substring(0, 24)}...) — allowing`);
        console.log(`      (hostname: ${currentHostname}, terminal_id: ${currentTerminalId})`);
      } else {
        console.log('   ✅ No conflicting session claims found');
      }
      return {
        pass: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: []
      };
    }

    // Another active session (different machine OR different conversation) has this SD → BLOCK
    const claim = otherClaims[0];
    const isSameMachine = claim.hostname === currentHostname;

    console.log('');
    console.log('   ┌─────────────────────────────────────────────────────────────┐');
    console.log('   │  🚫 BLOCKED: SD CLAIMED BY ANOTHER ACTIVE SESSION           │');
    console.log('   ├─────────────────────────────────────────────────────────────┤');
    console.log(`   │  SD:            ${sdId}`);
    console.log(`   │  Session:       ${claim.session_id?.substring(0, 36) || 'unknown'}`);
    console.log(`   │  Hostname:      ${claim.hostname || 'unknown'}`);
    console.log(`   │  Terminal ID:   ${claim.terminal_id || 'unknown'}`);
    console.log(`   │  TTY:           ${claim.tty || 'unknown'}`);
    console.log(`   │  Heartbeat:     ${claim.heartbeat_age_human || 'unknown'}`);
    console.log(`   │  Codebase:      ${claim.codebase || 'unknown'}`);
    if (isSameMachine) {
      console.log('   ├─────────────────────────────────────────────────────────────┤');
      console.log('   │  ⚠️  SAME MACHINE, DIFFERENT CONVERSATION                   │');
      console.log(`   │  Your terminal_id:  ${currentTerminalId}`);
      console.log(`   │  Their terminal_id: ${claim.terminal_id || 'unknown'}`);
    }
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
        terminalId: claim.terminal_id,
        tty: claim.tty,
        heartbeatAgeHuman: claim.heartbeat_age_human,
        heartbeatAgeSeconds: claim.heartbeat_age_seconds,
        codebase: claim.codebase,
        isSameMachine
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
