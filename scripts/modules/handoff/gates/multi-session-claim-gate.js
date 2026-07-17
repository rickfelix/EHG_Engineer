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

// RCA-TERMINAL-IDENTITY-CHAIN-BREAK-001: Three-case terminal_id matching
// Handles ambiguous case where one terminal_id has PID suffix and the other doesn't
import { isSameConversation } from '../../../../lib/claim-guard.mjs';

// SD-LEO-INFRA-MULTI-SESSION-CLAIM-001 (FR-1/FR-2): the SAME liveness primitives
// lib/claim-validity-gate.js's assertValidClaim uses for its foreign_claim path —
// delegated here instead of re-deriving liveness from v_active_sessions.computed_status
// (a heartbeat-only view that misses the silence-window / PID-alive escape hatches and
// can read a dead peer's technically-fresh heartbeat as "active").
import { ownerIsDeadByLiveness, shouldReleaseStaleOwner, isOwnerProcessAlive } from '../../../../lib/claim-validity-gate.js';
import { isWithinArmedSilenceWindow } from '../../../../lib/fleet/silence-cap.cjs';

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
    // SD-LEO-FIX-FIX-CLAIM-CONFLICT-001: Release stale sessions from the same
    // hostname + terminal_id before checking for conflicts. Each handoff.js run
    // creates a new session, leaving the previous run's session "active" until
    // staleness timeout. This caused self-referential claim conflicts.
    try {
      await supabase.rpc('release_same_conversation_claims', {
        p_sd_id: sdId,
        p_hostname: currentHostname,
        p_terminal_id: currentTerminalId,
        p_current_session_id: currentSessionId
      });
    } catch (_) {
      // RPC may not exist yet — fall back to direct cleanup
      const { data: staleClaims } = await supabase
        .from('claude_sessions')
        .select('session_id, hostname, terminal_id')
        .eq('sd_key', sdId)
        .eq('status', 'active')
        .eq('hostname', currentHostname);

      const toRelease = (staleClaims || []).filter(s => {
        if (s.session_id === currentSessionId) return false;
        return isSameConversation(currentTerminalId, s.terminal_id) !== false;
      });

      // Dual-surface release: co-clears the SD-side AND nulls sd_key + worktree_* together
      // (a bare sd_key clear trips the ck_worktree_state_consistency CHECK —
      // SD-LEO-FIX-CLAIM-RELEASE-DESYNC-001). Mirrors release_sd's status='idle'; tryRpc:false
      // (this branch is itself the fallback for the release_same_conversation_claims RPC).
      const { releaseClaimBothSurfaces } = await import('../../../../lib/claim/release-claim-both-surfaces.mjs');
      for (const s of toRelease) {
        await releaseClaimBothSurfaces(supabase, {
          sdKey: sdId, holderSessionId: s.session_id, reason: 'stale_same_conversation', sessionStatus: 'idle', tryRpc: false,
        });
        console.log(`   🧹 Released stale same-conversation claim: ${s.session_id.substring(0, 24)}...`);
      }
    }

    // SD-LEO-INFRA-MULTI-SESSION-CLAIM-001 (FR-1): read strategic_directives_v2.claiming_session_id
    // (Surface A) FIRST — this is the AUTHORITATIVE claim owner used by every other claim-checking
    // code path (lib/claim-validity-gate.js's assertValidClaim). v_active_sessions/claude_sessions
    // is advisory context only from here on, never the decision authority. A stale/phantom sd_key
    // stamp on some OTHER session's own claude_sessions row (Surface B) must never override the
    // caller's genuine Surface-A ownership — that was the exact witnessed bug (2026-07-17 01:57Z).
    const { data: sdRow, error: sdErr } = await supabase
      .from('strategic_directives_v2')
      .select('claiming_session_id')
      .eq('sd_key', sdId)
      .maybeSingle();

    if (sdErr) {
      // DB error → fail-open (don't block on infrastructure issues)
      console.log(`   ⚠️  Could not read Surface A claiming_session_id: ${sdErr.message}`);
      console.log('   → Proceeding (fail-open on DB error)');
      return {
        pass: true,
        score: 80,
        max_score: 100,
        issues: [],
        warnings: [`Could not verify Surface A ownership: ${sdErr.message}`]
      };
    }

    const ownerSessionId = sdRow?.claiming_session_id ?? null;

    if (!ownerSessionId || ownerSessionId === currentSessionId) {
      console.log('   ✅ Surface A (strategic_directives_v2.claiming_session_id) confirms this session owns the claim (or SD is unclaimed) — passing');
      return {
        pass: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: []
      };
    }

    // FR-2: genuine foreign claim per Surface A. Delegate the "is that owner actually alive"
    // determination to the SAME primitives assertValidClaim uses, evaluated against the OWNER's
    // OWN claude_sessions row — never re-derive liveness from v_active_sessions.computed_status.
    const { data: ownerRow, error: ownerErr } = await supabase
      .from('claude_sessions')
      .select('status, is_alive, heartbeat_at, expected_silence_until, hostname, terminal_id, tty, sd_key, codebase')
      .eq('session_id', ownerSessionId)
      .maybeSingle();

    if (ownerErr) {
      // Surfaced (not silent) — a transient error here must not read as an undetected
      // "owner missing" pass. Deep-tier adversarial review flagged the asymmetry with the
      // Surface A query above, which explicitly checks/surfaces its own error.
      console.log(`   ⚠️  Could not read owner's claude_sessions row: ${ownerErr.message}`);
    }

    const nowMs = Date.now();
    const ownerIsDead = ownerIsDeadByLiveness(ownerRow, nowMs);
    const ownerIsSilenced = isWithinArmedSilenceWindow(ownerRow?.expected_silence_until, nowMs);
    const ownerPidAlive = isOwnerProcessAlive(ownerSessionId);
    // Owner's OWN session-side sd_key no longer points at this SD → they've moved on (drift).
    const ownerHasSdKeyDrifted = !!ownerRow && ownerRow.sd_key !== sdId;

    if (shouldReleaseStaleOwner({ ownerHasSdKeyDrifted, ownerIsDead, ownerIsSilenced, ownerPidAlive })) {
      console.log(`   ✅ Surface-A owner ${ownerSessionId.substring(0, 24)}... is dead/drifted (delegated liveness check) — no real conflict, passing`);
      console.log(`      (ownerIsDead=${ownerIsDead}, ownerIsSilenced=${ownerIsSilenced}, ownerPidAlive=${ownerPidAlive}, sdKeyDrifted=${ownerHasSdKeyDrifted})`);
      return {
        pass: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: ownerErr ? [`Owner liveness computed with a missing owner row (DB error: ${ownerErr.message}) — treated as dead/fail-open`] : []
      };
    }

    // Owner is genuinely alive per Surface A + delegated liveness. Preserve the EXISTING
    // same-conversation carve-out (PAT-SESSION-IDENTITY-002): multiple CLI subprocesses from
    // ONE Claude Code instance share hostname + terminal_id and must not be treated as a conflict.
    if (ownerRow?.hostname && ownerRow.hostname === currentHostname) {
      const sameConvo = isSameConversation(currentTerminalId, ownerRow.terminal_id);
      if (sameConvo === true) {
        console.log(`   ✅ SD claimed by same-conversation session (${ownerSessionId.substring(0, 24)}...) — allowing`);
        return { pass: true, score: 100, max_score: 100, issues: [], warnings: [] };
      }
      if (sameConvo === 'ambiguous') {
        // Quick-fix QF-20260404-512: Before blocking on ambiguity, check if the claiming
        // session's PID is still alive. When terminal_id uses the unstable win-pid-* fallback,
        // every Bash call gets a new PID, making the claiming PID dead by definition.
        const claimPidMatch = ownerRow.terminal_id?.match(/^win-pid-(\d+)$/);
        if (claimPidMatch) {
          const claimPid = parseInt(claimPidMatch[1], 10);
          try {
            process.kill(claimPid, 0); // Signal 0 = existence check, no actual kill
          } catch {
            console.log(`   ✅ Ambiguous terminal_id but claiming PID ${claimPid} is dead — allowing (same conversation)`);
            return { pass: true, score: 100, max_score: 100, issues: [], warnings: [] };
          }
        }
        // SD-LEO-INFRA-CLAIM-DEFAULT-LEO-001: DENY-on-ambiguity — blocking a handoff is
        // recoverable; allowing duplicate work from a different session is not.
        console.log(`   ⚠️  Ambiguous terminal_id match (${currentTerminalId} vs ${ownerRow.terminal_id}) — BLOCKING (DENY-on-ambiguity)`);
      }
      // sameConvo === false → different conversation on same machine → conflict, falls through to BLOCK
    }

    // Genuine foreign LIVE claim on a different conversation → BLOCK
    const isSameMachine = ownerRow?.hostname === currentHostname;
    const heartbeatAgeSeconds = ownerRow?.heartbeat_at
      ? Math.round((nowMs - new Date(ownerRow.heartbeat_at).getTime()) / 1000)
      : null;
    const heartbeatAgeHuman = heartbeatAgeSeconds != null ? `${heartbeatAgeSeconds}s ago` : 'unknown';

    console.log('');
    console.log('   ┌─────────────────────────────────────────────────────────────┐');
    console.log('   │  🚫 BLOCKED: SD CLAIMED BY ANOTHER ACTIVE SESSION           │');
    console.log('   ├─────────────────────────────────────────────────────────────┤');
    console.log(`   │  SD:            ${sdId}`);
    console.log(`   │  Session:       ${ownerSessionId?.substring(0, 36) || 'unknown'}`);
    console.log(`   │  Hostname:      ${ownerRow?.hostname || 'unknown'}`);
    console.log(`   │  Terminal ID:   ${ownerRow?.terminal_id || 'unknown'}`);
    console.log(`   │  TTY:           ${ownerRow?.tty || 'unknown'}`);
    console.log(`   │  Heartbeat:     ${heartbeatAgeHuman}`);
    console.log(`   │  Codebase:      ${ownerRow?.codebase || 'unknown'}`);
    if (isSameMachine) {
      console.log('   ├─────────────────────────────────────────────────────────────┤');
      console.log('   │  ⚠️  SAME MACHINE, DIFFERENT CONVERSATION                   │');
      console.log(`   │  Your terminal_id:  ${currentTerminalId}`);
      console.log(`   │  Their terminal_id: ${ownerRow?.terminal_id || 'unknown'}`);
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
        `SD ${sdId} is claimed by another active session (${ownerRow?.hostname || 'unknown'}, heartbeat: ${heartbeatAgeHuman})`
      ],
      warnings: [],
      claimDetails: {
        sessionId: ownerSessionId,
        hostname: ownerRow?.hostname,
        terminalId: ownerRow?.terminal_id,
        tty: ownerRow?.tty,
        heartbeatAgeHuman,
        heartbeatAgeSeconds,
        codebase: ownerRow?.codebase,
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
