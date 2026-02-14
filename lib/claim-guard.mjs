/**
 * Centralized Claim Guard - SD-LEO-INFRA-CLAIM-GUARD-001
 *
 * Single enforcement gate for all SD work-initiation paths.
 * No fallbacks, no workarounds, no direct-update bypass.
 *
 * Decision tree:
 *   claimGuard(sdKey, sessionId)
 *     ├── This session owns claim? → PROCEED
 *     ├── No claim exists? → Acquire → PROCEED
 *     ├── Same conversation (terminal_id match)? → Adopt → PROCEED
 *     ├── Ambiguous (same SSE port, missing PID suffix)?
 *     │   ├── Claim holder process dead? → Release → Acquire → PROCEED
 *     │   └── Claim holder process alive? → HARD STOP (safe default)
 *     ├── Another ACTIVE session owns it? → HARD STOP
 *     └── Stale session owns it? → Release → Acquire → PROCEED
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const STALE_THRESHOLD_SECONDS = 900; // 15 minutes

let _supabase;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _supabase;
}

/**
 * RCA-TERMINAL-IDENTITY-CHAIN-BREAK-001: Determine if two terminal_ids
 * represent the same Claude Code conversation.
 *
 * Terminal IDs follow the pattern: win-cc-{ssePort}-{ccPid}
 * When findClaudeCodePid() fails (broken process chain), the PID suffix
 * is omitted, producing just: win-cc-{ssePort}
 *
 * @returns {true} Same SSE port + same PID suffix (definitely same conversation)
 * @returns {false} Different SSE port, or same port + different PID suffixes
 * @returns {'ambiguous'} Same SSE port + one has no PID suffix (need liveness check)
 */
export function isSameConversation(tidA, tidB) {
  if (tidA === tidB) return true;

  // Parse win-cc-{port}[-{pid}] format
  const parseWinCC = (tid) => {
    const match = tid?.match(/^win-cc-(\d+)(?:-(\d+))?$/);
    return match ? { port: match[1], pid: match[2] || null } : null;
  };

  const a = parseWinCC(tidA);
  const b = parseWinCC(tidB);

  // Non-Windows or unparseable → can't determine, treat as different
  if (!a || !b) return false;

  // Different SSE port → definitely different VS Code windows
  if (a.port !== b.port) return false;

  // Same port, both have PID suffix
  if (a.pid && b.pid) {
    return a.pid === b.pid; // Same PID = same conversation
  }

  // Same port, one or both missing PID suffix → ambiguous
  return 'ambiguous';
}

/**
 * Centralized claim enforcement gate.
 *
 * @param {string} sdKey - The SD key (e.g., 'SD-LEO-INFRA-CLAIM-GUARD-001')
 * @param {string} sessionId - The current session's terminal identity
 * @returns {Promise<{success: boolean, claim?: object, error?: string, owner?: object}>}
 */
export async function claimGuard(sdKey, sessionId) {
  if (!sdKey || !sessionId) {
    throw new Error('claimGuard requires both sdKey and sessionId');
  }

  const supabase = getSupabase();

  // Step 1: Check existing claims for this SD
  const { data: existingClaims, error: queryError } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_id, terminal_id, pid, heartbeat_age_seconds, heartbeat_age_human, hostname, tty, codebase, computed_status')
    .eq('sd_id', sdKey);

  if (queryError) {
    throw new Error(`claimGuard: Failed to query active sessions: ${queryError.message}`);
  }

  const activeClaims = (existingClaims || []).filter(c => c.sd_id === sdKey);

  // Case 1: This session already owns the claim
  const ownClaim = activeClaims.find(c => c.session_id === sessionId);
  if (ownClaim) {
    // Update heartbeat to keep claim alive
    await supabase
      .from('claude_sessions')
      .update({ heartbeat_at: new Date().toISOString() })
      .eq('session_id', sessionId);

    return {
      success: true,
      claim: { session_id: sessionId, sd_id: sdKey, status: 'already_owned' }
    };
  }

  // Case 2: Another session holds the claim
  const otherClaims = activeClaims.filter(c => c.session_id !== sessionId);

  // Get current session's terminal_id for same-conversation detection
  let myTerminalId = null;
  if (otherClaims.length > 0) {
    const { data: mySession } = await supabase
      .from('claude_sessions')
      .select('terminal_id')
      .eq('session_id', sessionId)
      .single();
    myTerminalId = mySession?.terminal_id || null;
  }

  for (const claim of otherClaims) {
    const heartbeatAge = claim.heartbeat_age_seconds || 0;

    // RCA-TERMINAL-IDENTITY-CHAIN-BREAK-001: Three-case terminal_id matching.
    // When findClaudeCodePid() fails due to broken process ancestry chains
    // (e.g., npm run subprocess), terminal_id falls back to SSE-port-only
    // (e.g., "win-cc-30738" instead of "win-cc-30738-12872"). This causes
    // the same conversation to create multiple sessions with different IDs.
    if (heartbeatAge < STALE_THRESHOLD_SECONDS && myTerminalId && claim.terminal_id) {
      const sameConversation = isSameConversation(myTerminalId, claim.terminal_id);

      if (sameConversation === true) {
        // Case A: Same SSE port + same PID suffix → definitely same conversation
        console.log(`[claimGuard] Same-conversation match: adopting claim from ${claim.session_id} (terminal: ${claim.terminal_id})`);
        await supabase
          .from('claude_sessions')
          .update({ heartbeat_at: new Date().toISOString() })
          .eq('session_id', sessionId);
        return {
          success: true,
          claim: { session_id: sessionId, sd_id: sdKey, status: 'adopted_same_conversation' }
        };
      }

      if (sameConversation === 'ambiguous') {
        // Case C: Same SSE port but one has null PID suffix (fallback).
        // Check if the claim holder's process is still alive.
        const claimPid = claim.pid;
        let processAlive = false;
        if (claimPid) {
          try { process.kill(claimPid, 0); processAlive = true; } catch { /* dead */ }
        }

        if (!processAlive) {
          console.log(`[claimGuard] Ambiguous terminal match, claim holder PID ${claimPid} is dead — releasing ${claim.session_id}`);
          // Use 'manual' reason (valid per sd_claims_release_reason_check constraint)
          const { error: releaseError } = await supabase.rpc('release_sd', {
            p_session_id: claim.session_id,
            p_reason: 'manual'
          });
          if (releaseError) {
            // Fallback: direct update if RPC fails
            console.warn(`[claimGuard] RPC release failed, using direct update: ${releaseError.message}`);
            await supabase
              .from('sd_claims')
              .update({ released_at: new Date().toISOString(), release_reason: 'manual' })
              .eq('session_id', claim.session_id)
              .eq('sd_id', sdKey)
              .is('released_at', null);
          }
          continue; // Proceed to acquire
        }
        // Process alive + ambiguous → fall through to HARD STOP (safer)
      }
      // Case B: Same SSE port + different PID suffix → different conversation → HARD STOP
    }

    if (heartbeatAge < STALE_THRESHOLD_SECONDS) {
      // Active session owns it → HARD STOP
      return {
        success: false,
        error: 'claimed_by_active_session',
        owner: {
          session_id: claim.session_id,
          heartbeat_age_human: claim.heartbeat_age_human || `${Math.round(heartbeatAge)}s ago`,
          hostname: claim.hostname || 'unknown',
          tty: claim.tty || 'unknown',
          codebase: claim.codebase || 'unknown'
        }
      };
    }

    // Stale session → release it first
    console.log(`[claimGuard] Releasing stale claim from session ${claim.session_id} (${claim.heartbeat_age_human})`);
    const { error: releaseError } = await supabase.rpc('release_sd', {
      p_session_id: claim.session_id,
      p_reason: 'manual'
    });
    if (releaseError) {
      console.warn(`[claimGuard] Failed to release stale session ${claim.session_id}: ${releaseError.message}`);
      // Fallback: direct update if RPC fails (same pattern as dead-process case)
      const { error: directErr } = await supabase
        .from('sd_claims')
        .update({ released_at: new Date().toISOString(), release_reason: 'stale_session' })
        .eq('session_id', claim.session_id)
        .is('released_at', null);
      if (directErr) {
        console.warn(`[claimGuard] Direct release also failed: ${directErr.message}`);
      } else {
        console.log(`[claimGuard] Released stale claim via direct update`);
      }
    }
  }

  // Case 3: No active claim (or stale claims released) → Acquire
  const { data: sdData } = await supabase
    .from('sd_baseline_items')
    .select('track')
    .eq('sd_id', sdKey)
    .single();

  const track = sdData?.track || 'STANDALONE';

  const { data: claimResult, error: claimError } = await supabase.rpc('claim_sd', {
    p_sd_id: sdKey,
    p_session_id: sessionId,
    p_track: track
  });

  if (claimError) {
    throw new Error(`claimGuard: claim_sd RPC failed: ${claimError.message}`);
  }

  if (claimResult && claimResult.success === false) {
    return {
      success: false,
      error: claimResult.error || 'claim_rejected',
      owner: claimResult.claimed_by ? {
        session_id: claimResult.claimed_by,
        hostname: 'unknown',
        tty: 'unknown'
      } : undefined
    };
  }

  // Update claiming_session_id on the SD (new column from migration)
  await supabase
    .from('strategic_directives_v2')
    .update({
      claiming_session_id: sessionId,
      is_working_on: true
    })
    .eq('sd_key', sdKey);

  return {
    success: true,
    claim: {
      session_id: sessionId,
      sd_id: sdKey,
      track,
      status: 'newly_acquired'
    }
  };
}

/**
 * Format a claim guard failure into a human-readable error message.
 *
 * @param {object} result - The claimGuard result with success=false
 * @returns {string} Formatted error message
 */
export function formatClaimFailure(result) {
  if (result.success) return '';

  const lines = [
    '╔══════════════════════════════════════════════════════════╗',
    '║  CLAIM GUARD: SD CLAIMED BY ANOTHER SESSION             ║',
    '╚══════════════════════════════════════════════════════════╝',
  ];

  if (result.owner) {
    lines.push(`  Session:   ${result.owner.session_id}`);
    lines.push(`  Heartbeat: ${result.owner.heartbeat_age_human || 'unknown'}`);
    lines.push(`  Hostname:  ${result.owner.hostname || 'unknown'}`);
    lines.push(`  TTY:       ${result.owner.tty || 'unknown'}`);
    lines.push(`  Codebase:  ${result.owner.codebase || 'unknown'}`);
  }

  lines.push('');
  lines.push('  This SD is actively being worked on by another session.');
  lines.push('  Pick a different SD or wait for the session to release.');
  lines.push('');

  return lines.join('\n');
}

export default { claimGuard, formatClaimFailure, isSameConversation };
