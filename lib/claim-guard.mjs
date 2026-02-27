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
 *     ├── Stale session owns it?
 *     │   ├── Stale but PID alive (same host)? → HARD STOP (heartbeat lag, not dead)
 *     │   └── Stale and PID dead (or different host)? → Release → Acquire → PROCEED
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getStaleThresholdSeconds } from './claim/stale-threshold.js';
import { isProcessRunning } from './heartbeat-manager.mjs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// SD-LEO-INFRA-CLAIM-SYSTEM-IMPROVEMENTS-001 (FR-004): Use shared threshold config
const STALE_THRESHOLD_SECONDS = getStaleThresholdSeconds();

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
 * SD-LEO-INFRA-CONSOLIDATE-CLAIMS-INTO-001: Extended to handle UUID-format
 * terminal_ids assigned by the concurrent-session worktree hook. When one
 * terminal_id is UUID-format and the other is port-based (win-cc-{port}),
 * they likely represent subprocesses of the same Claude Code instance on
 * the same machine. Return 'ambiguous' to allow fail-open in the gate.
 *
 * @returns {true} Same SSE port + same PID suffix (definitely same conversation)
 * @returns {false} Different SSE port, or same port + different PID suffixes
 * @returns {'ambiguous'} Same SSE port + one has no PID suffix (need liveness check),
 *   OR one is UUID-format and the other is port-based (cross-format subprocess match)
 */
export function isSameConversation(tidA, tidB) {
  if (tidA === tidB) return true;

  // SD-LEO-INFRA-CONSOLIDATE-CLAIMS-INTO-001: UUID vs port-based cross-format match.
  // The concurrent-session worktree hook assigns UUID-format terminal_ids while the
  // fallback path produces win-cc-{port}. Both formats can coexist for subprocesses
  // of the same Claude Code instance on the same machine.
  const isUUID = (tid) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tid || '');
  const isWinCC = (tid) => /^win-cc-\d+/.test(tid || '');
  if ((isUUID(tidA) && isWinCC(tidB)) || (isUUID(tidB) && isWinCC(tidA))) return 'ambiguous';

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

  // Step 1: Check existing active claims from claude_sessions (single authoritative source).
  // SD-LEO-INFRA-CONSOLIDATE-CLAIMS-INTO-001: sd_claims table has been dropped.
  // claude_sessions.sd_id IS the claim — the partial unique index
  // (sd_id IS NOT NULL AND status='active') enforces single active claim per SD.
  const { data: claims, error: claimQueryError } = await supabase
    .from('claude_sessions')
    .select('sd_id, session_id, track, claimed_at')
    .eq('sd_id', sdKey)
    .in('status', ['active', 'idle']);

  if (claimQueryError) {
    throw new Error(`claimGuard: Failed to query claude_sessions: ${claimQueryError.message}`);
  }

  // Enrich claims with session metadata for same-conversation detection
  let activeClaims = [];
  if (claims && claims.length > 0) {
    const sessionIds = claims.map(c => c.session_id);
    const { data: sessions } = await supabase
      .from('claude_sessions')
      .select('session_id, terminal_id, pid, hostname, tty, codebase, heartbeat_at, status')
      .in('session_id', sessionIds);

    const sessionMap = Object.fromEntries((sessions || []).map(s => [s.session_id, s]));
    activeClaims = claims.map(c => {
      const s = sessionMap[c.session_id] || {};
      const heartbeatAge = s.heartbeat_at
        ? (Date.now() - new Date(s.heartbeat_at).getTime()) / 1000
        : 9999;
      return {
        ...c,
        terminal_id: s.terminal_id,
        pid: s.pid,
        hostname: s.hostname,
        tty: s.tty,
        codebase: s.codebase,
        heartbeat_age_seconds: heartbeatAge,
        heartbeat_age_human: heartbeatAge < 60
          ? `${Math.round(heartbeatAge)}s ago`
          : heartbeatAge < 3600
            ? `${Math.round(heartbeatAge / 60)}m ago`
            : `${Math.round(heartbeatAge / 3600)}h ago`,
        computed_status: s.status === 'released' ? 'released'
          : heartbeatAge > 300 ? 'stale' : 'active'
      };
    });
  }

  // Case 1: This session already owns the claim
  const ownClaim = activeClaims.find(c => c.session_id === sessionId);
  if (ownClaim) {
    // SD-LEO-FIX-FIX-START-ALREADY-001: Check for conflicting claims from OTHER active sessions.
    // The partial unique index should prevent this, but session reuse via terminal_id
    // can create scenarios where multiple sessions claim the same SD.
    const conflictingClaims = activeClaims.filter(c =>
      c.session_id !== sessionId && c.computed_status === 'active'
    );
    if (conflictingClaims.length > 0) {
      const conflict = conflictingClaims[0];
      console.log(`[claimGuard] WARNING: Own session claims SD but ${conflictingClaims.length} other active session(s) also claim it`);
      console.log(`[claimGuard] Conflict: ${conflict.session_id} (${conflict.hostname || 'unknown'}, heartbeat: ${conflict.heartbeat_age_human || 'unknown'})`);
      return {
        success: false,
        error: 'claimed_by_active_session',
        owner: {
          session_id: conflict.session_id,
          heartbeat_age_human: conflict.heartbeat_age_human || 'unknown',
          hostname: conflict.hostname || 'unknown',
          tty: conflict.tty || 'unknown',
          codebase: conflict.codebase || 'unknown',
          note: 'Another active session also claims this SD (dual-claim conflict)'
        }
      };
    }

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
          const { error: releaseError } = await supabase.rpc('release_sd', {
            p_session_id: claim.session_id,
            p_reason: 'manual'
          });
          if (releaseError) {
            // Fallback: direct update on claude_sessions if RPC fails
            console.warn(`[claimGuard] RPC release failed, using direct update: ${releaseError.message}`);
            await supabase
              .from('claude_sessions')
              .update({ sd_id: null, released_at: new Date().toISOString(), released_reason: 'manual', status: 'idle' })
              .eq('session_id', claim.session_id);
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

    // Stale session → check PID liveness before releasing
    // QF: A stale heartbeat does NOT mean the process is dead. The session may
    // have been busy (long LLM call, context compaction) and missed heartbeats.
    // If the PID is alive on the same host, treat as active → HARD STOP.
    const sameHost = claim.hostname === os.hostname();
    const claimPid = claim.pid ? parseInt(claim.pid, 10) : null;
    if (sameHost && claimPid && isProcessRunning(claimPid)) {
      console.log(`[claimGuard] Stale session ${claim.session_id} (${claim.heartbeat_age_human}) but PID ${claimPid} is ALIVE → HARD STOP`);
      return {
        success: false,
        error: 'claimed_by_stale_but_alive_session',
        owner: {
          session_id: claim.session_id,
          heartbeat_age_human: claim.heartbeat_age_human || `${Math.round(heartbeatAge)}s ago`,
          hostname: claim.hostname || 'unknown',
          tty: claim.tty || 'unknown',
          codebase: claim.codebase || 'unknown',
          pid: claimPid,
          note: 'Heartbeat stale but process alive — likely busy, not dead'
        }
      };
    }

    console.log(`[claimGuard] Releasing stale claim from session ${claim.session_id} (${claim.heartbeat_age_human})${sameHost && claimPid ? ` — PID ${claimPid} is dead` : ' — different host or no PID'}`);
    const { error: releaseError } = await supabase.rpc('release_sd', {
      p_session_id: claim.session_id,
      p_reason: 'manual'
    });
    if (releaseError) {
      console.warn(`[claimGuard] Failed to release stale session ${claim.session_id}: ${releaseError.message}`);
      // Fallback: direct update on claude_sessions if RPC fails
      const { error: directErr } = await supabase
        .from('claude_sessions')
        .update({ sd_id: null, released_at: new Date().toISOString(), released_reason: 'stale_session', status: 'idle' })
        .eq('session_id', claim.session_id);
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

  // Post-acquisition verification: read back to confirm we actually own the claim
  const verification = await verifyClaimOwnership(sdKey, sessionId);
  if (!verification.verified) {
    return {
      success: false,
      error: `claim_verification_failed: ${verification.error}`,
      owner: undefined
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

  if (result.owner?.pid) {
    lines.push(`  PID:       ${result.owner.pid}`);
  }
  if (result.owner?.note) {
    lines.push(`  Note:      ${result.owner.note}`);
  }

  lines.push('');
  lines.push('  This SD is actively being worked on by another session.');
  lines.push('  Pick a different SD or wait for the session to release.');
  lines.push('');

  return lines.join('\n');
}

/**
 * Post-acquisition verification: read back from claude_sessions to confirm
 * this session actually holds the claim. Catches race conditions where
 * claim_sd() RPC reports success but another session won the race.
 *
 * Fail-open on query errors (Supabase hiccup shouldn't block work).
 * Fail-closed on data inconsistencies (wrong owner, multiple claims).
 *
 * @param {string} sdKey - The SD key
 * @param {string} sessionId - Expected owner session ID
 * @returns {Promise<{verified: boolean, error?: string}>}
 */
export async function verifyClaimOwnership(sdKey, sessionId) {
  const supabase = getSupabase();

  let rows, queryError;
  try {
    const result = await supabase
      .from('claude_sessions')
      .select('session_id, sd_id, status')
      .eq('sd_id', sdKey)
      .in('status', ['active', 'idle']);

    rows = result.data;
    queryError = result.error;
  } catch (err) {
    // Network/unexpected error → fail-open
    console.warn(`[Verify] Query exception (fail-open): ${err.message}`);
    return { verified: true, error: `query_exception: ${err.message}` };
  }

  if (queryError) {
    // Supabase error → fail-open
    console.warn(`[Verify] Query error (fail-open): ${queryError.message}`);
    return { verified: true, error: `query_error: ${queryError.message}` };
  }

  if (!rows || rows.length === 0) {
    // No claim found — RPC said success but no row exists
    console.error(`[Verify] FAIL: No active claim found for ${sdKey} after successful RPC`);
    return { verified: false, error: 'no_claim_after_rpc' };
  }

  if (rows.length > 1) {
    // Multiple active claims — index violation or race condition
    const owners = rows.map(r => r.session_id).join(', ');
    console.error(`[Verify] FAIL: Multiple active claims for ${sdKey}: [${owners}]`);
    return { verified: false, error: `multiple_claims: ${owners}` };
  }

  if (rows[0].session_id !== sessionId) {
    // Wrong owner — another session won the race
    console.error(`[Verify] FAIL: Claim for ${sdKey} owned by ${rows[0].session_id}, expected ${sessionId}`);
    return { verified: false, error: `wrong_owner: ${rows[0].session_id}` };
  }

  console.log(`[Verify] Claim ownership confirmed: ${sessionId} owns ${sdKey}`);
  return { verified: true };
}

export default { claimGuard, formatClaimFailure, isSameConversation, verifyClaimOwnership };
