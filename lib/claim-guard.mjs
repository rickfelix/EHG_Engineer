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

import { createSupabaseServiceClient } from './supabase-client.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import { getStaleThresholdSeconds } from './claim/stale-threshold.js';
import { isProcessRunning } from './heartbeat-manager.mjs';
import { claimQuickFix } from './quick-fix-claim.mjs';
import { stampClaim } from './fleet/claim-stamp.cjs';
// SD-LEO-INFRA-CLAIM-SILENCE-CONSUME-VERIFY-001: shared CONSUME-side silence predicate — a parked
// /loop worker inside an armed within-cap window is legitimately quiet, NOT a stale claim to reap.
import { isWithinArmedSilenceWindow } from './fleet/silence-cap.cjs';
import os from 'os';

// stampBranch keeps current_branch fresh on heartbeat writes — see
// lib/session-writer.cjs and SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001.
const { stampBranch } = createRequire(import.meta.url)('./session-writer.cjs');
// QF-20260711-937: coordinator-authority fence at THIS claim-write boundary too. claimGuard is
// the acquire path for handoff.js (BaseExecutor._claimSDForSession) — the orchestrator-children
// lane: a worker running the handoff chain on a child key claims it here without ever passing
// belt/checkin/sd-start eligibility. Sixth fence-bypass call site (after QF-272's three,
// displacement, sd-start-identity).
const { liveClaimWriteFenceReason } = createRequire(import.meta.url)('./fleet/claim-eligibility.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// SD-LEO-INFRA-SIDE-CLAIM-ELIGIBILITY-001 (FR-2): stamped on every claim write so the
// DB-side observe-only trigger (claim_eligibility_observe) can compare against the
// chairman_dashboard_config.metadata.claim_gate_version_floor. Bump this constant (and
// the floor via scripts/bump-claim-gate-version.js) together on future gate-code merges.
const CLAIM_GUARD_CODE_VERSION = 1;

// SD-LEO-INFRA-CLAIM-SYSTEM-IMPROVEMENTS-001 (FR-004): Use shared threshold config
let STALE_THRESHOLD_SECONDS = getStaleThresholdSeconds();

// SD-LEO-INFRA-SESSION-CLAIM-LIFECYCLE-001 (FR19): hard cap (seconds) bounding any
// per-sd_type TTL override so a misconfigured map cannot hold a dead claim
// indefinitely. Overridable via env; defaults to 60min.
const CLAIM_TTL_HARD_CAP_SECONDS = (() => {
  const v = parseInt(process.env.CLAIM_TTL_HARD_CAP_SECONDS, 10);
  return (!isNaN(v) && v > 0) ? v : 3600;
})();

// SD-LEO-INFRA-SESSION-CLAIM-LIFECYCLE-001 (FR19): optional per-sd_type TTL
// override map { <sd_type>: <minutes> }, cached alongside the global default by
// fetchClaimTTL(). Null when unconfigured (pure backward-compat).
let _ttlByTypeMinutes = null;

// SD-LEO-INFRA-CLAIM-DEFAULT-LEO-001 (FR4): TTL-based claim expiry from chairman_dashboard_config
let _ttlFetched = false;
async function fetchClaimTTL() {
  if (_ttlFetched) return;
  _ttlFetched = true;
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('chairman_dashboard_config')
      .select('metadata')
      .eq('config_key', 'default')
      .single();
    if (data?.metadata?.claim_ttl_minutes) {
      const ttlMinutes = parseInt(data.metadata.claim_ttl_minutes, 10);
      if (!isNaN(ttlMinutes) && ttlMinutes > 0) {
        STALE_THRESHOLD_SECONDS = ttlMinutes * 60;
        console.log(`[claimGuard] TTL from chairman_dashboard_config: ${ttlMinutes}min (${STALE_THRESHOLD_SECONDS}s)`);
      }
    }
    // SD-LEO-INFRA-SESSION-CLAIM-LIFECYCLE-001 (FR19): cache the per-sd_type map
    // from the SAME config read (no extra round-trip).
    const byType = data?.metadata?.claim_ttl_minutes_by_type;
    if (byType && typeof byType === 'object' && !Array.isArray(byType)) {
      _ttlByTypeMinutes = byType;
    }
  } catch (e) {
    // Fail-open: config unavailable, use default threshold
    console.warn(`[claimGuard] ⚠️  TTL config fetch failed (using default ${STALE_THRESHOLD_SECONDS}s): ${e.message}`);
  }
}

/**
 * SD-LEO-INFRA-SESSION-CLAIM-LIFECYCLE-001 (FR19): resolve the effective claim
 * staleness TTL (seconds) for a specific SD, making it sd_type-aware.
 *
 * effective = clamp( perTypeOverrideSeconds, [globalDefault, max(globalDefault, HARD_CAP)] )
 *
 * Invariants:
 *  - LENGTHEN-ONLY: the result is NEVER below the global default
 *    (STALE_THRESHOLD_SECONDS) — a per-type override lower than the default is
 *    ignored. So no claim can ever expire SOONER than today.
 *  - BOUNDED: the result never exceeds max(globalDefault, HARD_CAP), so a
 *    misconfigured override cannot hold a dead claim indefinitely.
 *  - RACE-SAFE: returns a LOCAL value; the module-global STALE_THRESHOLD_SECONDS
 *    is never mutated per-call.
 *  - FAIL-OPEN: any error resolving sd_type / config returns the global default
 *    (never throws, never shortens).
 *
 * @param {object} supabase - service-role client
 * @param {string} sdKey - SD key (or QF- id)
 * @returns {Promise<number>} effective TTL in seconds
 */
export async function resolveClaimTtlSeconds(supabase, sdKey) {
  await fetchClaimTTL(); // ensures STALE_THRESHOLD_SECONDS + _ttlByTypeMinutes are populated
  const base = STALE_THRESHOLD_SECONDS;
  try {
    if (!_ttlByTypeMinutes || !sdKey) return base;

    // Resolve the work item's type (SD- → strategic_directives_v2.sd_type;
    // QF- → quick_fixes.type).
    let sdType = null;
    if (sdKey.startsWith('QF-')) {
      const { data } = await supabase
        .from('quick_fixes').select('type').eq('id', sdKey).single();
      sdType = data?.type || null;
    } else {
      const { data } = await supabase
        .from('strategic_directives_v2').select('sd_type').eq('sd_key', sdKey).single();
      sdType = data?.sd_type || null;
    }
    if (!sdType) return base;

    const overrideMin = Number(_ttlByTypeMinutes[sdType]);
    if (!Number.isFinite(overrideMin) || overrideMin <= 0) return base;

    const overrideSec = overrideMin * 60;
    const ceiling = Math.max(base, CLAIM_TTL_HARD_CAP_SECONDS); // never below base, even if base > cap
    const effective = Math.min(Math.max(overrideSec, base), ceiling);
    if (effective !== base) {
      console.log(`[claimGuard] TTL sd_type-aware: ${sdType} → ${Math.round(effective / 60)}min (${effective}s) [default ${Math.round(base / 60)}min]`);
    }
    return effective;
  } catch (e) {
    // Fail-open: never throw, never shorten below the global default.
    console.warn(`[claimGuard] ⚠️  per-type TTL resolution failed (using default ${base}s): ${e.message}`);
    return base;
  }
}

let _supabase;
function getSupabase() {
  if (!_supabase) {
    _supabase = createSupabaseServiceClient();
  }
  return _supabase;
}

// QF-20260511-016: Re-affirm SD-row claim columns idempotently. Closes
// feedback 67de177a — Case 1 (already_owned) and Case 2A (adopted_same_conversation)
// previously updated only claude_sessions heartbeat, leaving SD-row claim cols
// unrestored if any prior UPDATE (cascade-trigger overreach, stale cleanup, etc.)
// had cleared them. Defense-in-depth: every successful return now writes the
// claim cols, so re-running sd-start always converges to a consistent state.
async function reaffirmClaimColumns(supabase, sdKey, sessionId) {
  if (sdKey.startsWith('QF-')) {
    // SD-LEO-INFRA-SESSION-AWARE-AUTO-001 (FR-1b, prospective DEFECT 4):
    // The previous NON-CAS `.update(...).eq('id', sdKey)` would clobber a
    // DIFFERENT live holder's claim on every reaffirm. Route through the shared
    // fail-closed CAS (null-OR-self guard) so reaffirm stays idempotent for the
    // OWNING session but refuses to steal a peer's QF. Reaffirm is best-effort
    // defense-in-depth — the authoritative claim/bail lives at the adopt
    // entrypoint (classify-quick-fix.js, FR-2) — so a lost CAS here only warns.
    const { claimed, holder } = await claimQuickFix(supabase, sdKey, sessionId);
    if (!claimed) {
      console.warn(
        `[claimGuard] reaffirm: QF ${sdKey} held by another session ` +
        `(${holder ? String(holder).slice(0, 8) : 'unknown'}) — not clobbering. ` +
        `Authoritative claim is enforced at the QF adopt entrypoint.`
      );
    }
  } else {
    await supabase
      .from('strategic_directives_v2')
      .update({ claiming_session_id: sessionId, is_working_on: true, claim_gate_client_version: CLAIM_GUARD_CODE_VERSION }) // schema-lint-disable-line — new column (this SD's migration), chairman-apply-gated, not yet in the live snapshot
      .eq('sd_key', sdKey);
  }
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

  // Format detectors
  const isUUID = (tid) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tid || '');
  const isWinCC = (tid) => /^win-cc-\d+/.test(tid || '');
  // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-4): Parse win-pid-{pid} fallback format.
  // When getTerminalId() falls to the lowest fallback, it produces win-pid-{process.pid}.
  // Previously unparseable, causing line 117 to return false for all win-pid comparisons.
  const isWinPid = (tid) => /^win-pid-\d+$/.test(tid || '');
  const parseWinPid = (tid) => {
    const match = tid?.match(/^win-pid-(\d+)$/);
    return match ? match[1] : null;
  };

  // SD-LEO-INFRA-CONSOLIDATE-CLAIMS-INTO-001: UUID vs port-based cross-format match.
  if ((isUUID(tidA) && isWinCC(tidB)) || (isUUID(tidB) && isWinCC(tidA))) return 'ambiguous';

  // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-4): UUID vs win-pid cross-format match.
  // win-pid-* is a per-process fallback — it cannot be matched to a UUID deterministically.
  // Return 'ambiguous' to allow evidence-gated adoption upstream (heartbeat + SD phase check).
  if ((isUUID(tidA) && isWinPid(tidB)) || (isUUID(tidB) && isWinPid(tidA))) return 'ambiguous';

  // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-4): win-pid vs win-pid comparison.
  // Same PID = same process = same conversation. Different PIDs = ambiguous (could be
  // different Bash tool invocations from the same Claude Code instance).
  if (isWinPid(tidA) && isWinPid(tidB)) {
    const pidA = parseWinPid(tidA);
    const pidB = parseWinPid(tidB);
    return pidA === pidB ? true : 'ambiguous';
  }

  // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001: win-cc vs win-pid cross-format match.
  // Both are Windows fallback formats from the same machine — ambiguous.
  if ((isWinCC(tidA) && isWinPid(tidB)) || (isWinCC(tidB) && isWinPid(tidA))) return 'ambiguous';

  // Two UUID-format terminal_ids: compare literally.
  // Post PR #2231, getTerminalId() resolves via SSE port marker match,
  // producing stable UUIDs. Two different UUIDs = different conversations.
  if (isUUID(tidA) && isUUID(tidB)) return false;

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
 * @param {object} [options] - Options
 * @param {boolean} [options.autoFallback=false] - When true, return {success: false, fallback: true}
 *   instead of throwing/hard-stopping on claim conflicts. Used by auto-proceed paths to enable
 *   graceful fallback to the next available SD. SD-MAN-INFRA-CLAIM-AUTO-PROCEED-001.
 * @returns {Promise<{success: boolean, claim?: object, error?: string, owner?: object, fallback?: boolean}>}
 */
export async function claimGuard(sdKey, sessionId, options = {}) {
  const { autoFallback = false } = options;
  if (!sdKey || !sessionId) {
    throw new Error('claimGuard requires both sdKey and sessionId');
  }

  const supabase = getSupabase();

  // FR-1 (SD-LEO-INFRA-SHIP-UNMERGED-LAYERS-001): pre-acquire refusal on cancelled SDs.
  // The original SD-LEO-INFRA-BLOCK-CLAIMS-CANCELLED-001 was marked completed but this
  // layer never merged (PR #3672) — claimGuard previously never read
  // strategic_directives_v2.status, so a session could acquire a claim on a cancelled SD.
  // Refuse early with a distinct sd_cancelled reason. FAIL-OPEN: a missing row or a query
  // error must NOT block (the identity/claim logic below still runs); only a definite
  // status='cancelled' blocks. The DB trigger (migration 393) backstops this at the data
  // layer for any writer that bypasses claimGuard.
  const { data: sdStatusRow, error: sdStatusError } = await supabase
    .from('strategic_directives_v2')
    .select('status, cancellation_reason')
    .eq('sd_key', sdKey)
    .maybeSingle();
  if (!sdStatusError && sdStatusRow && sdStatusRow.status === 'cancelled') {
    return {
      success: false,
      error: 'sd_cancelled',
      cancelled: true,
      cancellation_reason: sdStatusRow.cancellation_reason || null
    };
  }
  // SD-LEO-FIX-CLAIM-RPC-TERMINAL-001: refuse the other terminal lifecycle states too
  // (completed/deferred) so claimGuard does not optimistically claim a finished SD, and
  // formatClaimFailure can render an accurate terminal banner instead of the misleading
  // "claimed by another session". Same FAIL-OPEN contract as cancelled above; the claim_sd
  // RPC guard backstops the QF path and any caller that bypasses claimGuard.
  if (!sdStatusError && sdStatusRow && (sdStatusRow.status === 'completed' || sdStatusRow.status === 'deferred')) {
    return {
      success: false,
      error: 'sd_terminal_status',
      status: sdStatusRow.status
    };
  }

  // SD-LEO-INFRA-CLAIM-DEFAULT-LEO-001: Fetch TTL from config on first call.
  // SD-LEO-INFRA-SESSION-CLAIM-LIFECYCLE-001 (FR19): resolve a LOCAL sd_type-aware
  // effective TTL (lengthen-only; the module-global STALE_THRESHOLD_SECONDS stays
  // the default floor and is never mutated per-call — race-safe). resolveClaimTtlSeconds
  // calls fetchClaimTTL() internally.
  const effectiveTtlSeconds = await resolveClaimTtlSeconds(supabase, sdKey);

  // Step 1: Check existing active claims from claude_sessions (single authoritative source).
  // SD-LEO-INFRA-CONSOLIDATE-CLAIMS-INTO-001: sd_claims table has been dropped.
  // claude_sessions.sd_id IS the claim — the partial unique index
  // (sd_id IS NOT NULL AND status='active') enforces single active claim per SD.
  const { data: claims, error: claimQueryError } = await supabase
    .from('claude_sessions')
    .select('sd_key, session_id, track, claimed_at')
    .eq('sd_key', sdKey)
    .in('status', ['active', 'idle']);

  if (claimQueryError) {
    throw new Error(`claimGuard: Failed to query claude_sessions: ${claimQueryError.message}`);
  }

  // Enrich claims with session metadata for same-conversation detection
  let activeClaims = [];
  if (claims && claims.length > 0) {
    const sessionIds = claims.map(c => c.session_id);
    // SD-FDBK-INFRA-NODE-CLOCK-SKEW-001: age heartbeats against the DB server clock (not the
    // node clock) so a skewed coordinator node can't false-stale (computed_status) a live claim.
    // Batched with the session fetch (no added latency); fail-open (getDbNowMs -> node clock).
    const { getDbNowMs } = await import('./fleet/db-clock.mjs');
    const [{ data: sessions, error: sessionEnrichError }, dbNowMs] = await Promise.all([
      supabase
        .from('claude_sessions')
        .select('session_id, terminal_id, pid, hostname, tty, codebase, heartbeat_at, status, expected_silence_until')
        .in('session_id', sessionIds),
      getDbNowMs(supabase),
    ]);
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 (guard read, fail-CLOSED):
    // this enrichment read decides computed_status. If it silently fails, every claimant
    // gets heartbeatAge=9999 → 'stale' → the claim looks stealable while the holder is
    // alive. Mirror the claimQueryError policy above: GUARD_UNAVAILABLE → throw, never
    // classify liveness from a failed read. (.in(sessionIds) bounds the row count.)
    if (sessionEnrichError) {
      throw new Error(`claimGuard: GUARD_UNAVAILABLE — session enrichment read failed, cannot assess claim liveness: ${sessionEnrichError.message}`);
    }

    const sessionMap = Object.fromEntries((sessions || []).map(s => [s.session_id, s]));
    activeClaims = claims.map(c => {
      const s = sessionMap[c.session_id] || {};
      const heartbeatAge = s.heartbeat_at
        ? (dbNowMs - new Date(s.heartbeat_at).getTime()) / 1000
        : 9999;
      return {
        ...c,
        terminal_id: s.terminal_id,
        pid: s.pid,
        hostname: s.hostname,
        tty: s.tty,
        codebase: s.codebase,
        expected_silence_until: s.expected_silence_until,
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

    // Update heartbeat to keep claim alive (also stamps current_branch)
    await supabase
      .from('claude_sessions')
      .update(stampBranch({ heartbeat_at: new Date().toISOString() }))
      .eq('session_id', sessionId);

    // QF-20260511-016: Re-affirm SD-row claim cols (idempotent defense vs. trigger overreach).
    await reaffirmClaimColumns(supabase, sdKey, sessionId);

    return {
      success: true,
      claim: { session_id: sessionId, sd_key: sdKey, status: 'already_owned' }
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
    if (heartbeatAge < effectiveTtlSeconds && myTerminalId && claim.terminal_id) {
      const sameConversation = isSameConversation(myTerminalId, claim.terminal_id);

      if (sameConversation === true) {
        // Case A: Definite same-conversation match → adopt claim
        // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-6): Audit log on every identity transfer
        console.log(`[claimGuard] IDENTITY_TRANSFER: prior_session=${claim.session_id}, new_session=${sessionId}, staleness_delta=${heartbeatAge}s, gate_result=ALLOW, my_terminal=${myTerminalId}, their_terminal=${claim.terminal_id}`);
        await supabase
          .from('claude_sessions')
          .update(stampBranch({ heartbeat_at: new Date().toISOString() }))
          .eq('session_id', sessionId);
        // QF-20260511-016: Re-affirm SD-row claim cols on adoption (idempotent).
        await reaffirmClaimColumns(supabase, sdKey, sessionId);
        return {
          success: true,
          claim: { session_id: sessionId, sd_key: sdKey, status: 'adopted_same_conversation' }
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
          // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-6): Audit log on ambiguous release
          console.log(`[claimGuard] IDENTITY_TRANSFER: prior_session=${claim.session_id}, new_session=${sessionId}, staleness_delta=${heartbeatAge}s, gate_result=ALLOW_AMBIGUOUS_DEAD_PID, claim_pid=${claimPid}, my_terminal=${myTerminalId}, their_terminal=${claim.terminal_id}`);
          const { error: releaseError } = await supabase.rpc('release_sd', {
            p_session_id: claim.session_id,
            p_reason: 'manual'
          });
          if (releaseError) {
            // Fallback: dual-surface direct release if the release_sd RPC fails. Co-clears the
            // SD-side AND nulls sd_key + worktree_* together (a bare sd_key clear trips the
            // ck_worktree_state_consistency CHECK — SD-LEO-FIX-CLAIM-RELEASE-DESYNC-001). Mirrors
            // release_sd's status='idle'. tryRpc:false — the release_sd RPC just failed.
            console.warn(`[claimGuard] RPC release failed, using dual-surface direct update: ${releaseError.message}`);
            const { releaseClaimBothSurfaces } = await import('./claim/release-claim-both-surfaces.mjs');
            await releaseClaimBothSurfaces(supabase, {
              sdKey, holderSessionId: claim.session_id, reason: 'manual', sessionStatus: 'idle', tryRpc: false,
            });
          }
          continue; // Proceed to acquire
        }
        // Process alive + ambiguous → fall through to HARD STOP (safer)
      }
      // Case B: Same SSE port + different PID suffix → different conversation → HARD STOP
    }

    if (heartbeatAge < effectiveTtlSeconds) {
      // Active session owns it → HARD STOP (or fallback if autoFallback enabled)
      const result = {
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
      if (autoFallback) {
        result.fallback = true;
        return result;
      }
      return result;
    }

    // SD-LEO-INFRA-CLAIM-SILENCE-CONSUME-VERIFY-001 (SEAM: claimGuard stale-release): a parked
    // /loop worker arms expected_silence_until and lets its heartbeat lapse legitimately — landing
    // here (hb >= ttl) looking stale. Honor a within-cap armed silence window (same predicate the
    // sweep + the gate + cold-recovery use) → HARD STOP: never release a silenced holder, and never
    // fall through to the Case-3 claim_sd acquisition for this SD (which would also reap it). This
    // closes the sd-start / handoff / reclaim acquisition path. Fail-open: an absent/expired/beyond-
    // cap window => not silenced => today's stale-release behavior.
    if (isWithinArmedSilenceWindow(claim.expected_silence_until, Date.now())) {
      console.log(`[claimGuard] Stale session ${claim.session_id} (${claim.heartbeat_age_human}) is within an ARMED SILENCE WINDOW (until ${claim.expected_silence_until}) → HARD STOP (parked worker, not dead)`);
      const result = {
        success: false,
        error: 'claimed_by_silenced_session',
        owner: {
          session_id: claim.session_id,
          heartbeat_age_human: claim.heartbeat_age_human || `${Math.round(heartbeatAge)}s ago`,
          hostname: claim.hostname || 'unknown',
          expected_silence_until: claim.expected_silence_until,
          note: 'Heartbeat stale but holder is in an armed within-cap silence window — parked /loop worker, do not reap'
        }
      };
      if (autoFallback) { result.fallback = true; }
      return result;
    }

    // Stale session → check PID liveness before releasing
    // QF: A stale heartbeat does NOT mean the process is dead. The session may
    // have been busy (long LLM call, context compaction) and missed heartbeats.
    // If the PID is alive on the same host, treat as active → HARD STOP.
    const sameHost = claim.hostname === os.hostname();
    const claimPid = claim.pid ? parseInt(claim.pid, 10) : null;
    if (sameHost && claimPid && isProcessRunning(claimPid)) {
      console.log(`[claimGuard] Stale session ${claim.session_id} (${claim.heartbeat_age_human}) but PID ${claimPid} is ALIVE → HARD STOP`);
      const result = {
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
      if (autoFallback) {
        result.fallback = true;
        return result;
      }
      return result;
    }

    // SD-LEO-INFRA-CLAIM-DEFAULT-LEO-001 (FR6): Structured audit log on claim transfer
    console.log(JSON.stringify({
      event: 'claim_transfer',
      sd_key: sdKey,
      from_session: claim.session_id,
      to_session: sessionId,
      reason: sameHost && claimPid ? `stale_pid_dead_${claimPid}` : 'stale_different_host',
      heartbeat_age: claim.heartbeat_age_human,
      ttl_seconds: effectiveTtlSeconds,
      timestamp: new Date().toISOString()
    }));
    console.log(`[claimGuard] Releasing stale claim from session ${claim.session_id} (${claim.heartbeat_age_human})${sameHost && claimPid ? ` — PID ${claimPid} is dead` : ' — different host or no PID'}`);
    const { error: releaseError } = await supabase.rpc('release_sd', {
      p_session_id: claim.session_id,
      p_reason: 'manual'
    });
    if (releaseError) {
      console.warn(`[claimGuard] Failed to release stale session ${claim.session_id}: ${releaseError.message}`);
      // Fallback: dual-surface direct release. Co-clears the SD-side AND nulls sd_key +
      // worktree_* together (a bare sd_key clear trips the ck_worktree_state_consistency
      // CHECK — SD-LEO-FIX-CLAIM-RELEASE-DESYNC-001). Mirrors release_sd's status='idle';
      // tryRpc:false since the release_sd RPC just failed.
      const { releaseClaimBothSurfaces } = await import('./claim/release-claim-both-surfaces.mjs');
      const r = await releaseClaimBothSurfaces(supabase, {
        sdKey, holderSessionId: claim.session_id, reason: 'stale_session', sessionStatus: 'idle', tryRpc: false,
      });
      if (r.error) {
        console.warn(`[claimGuard] Direct release also failed: ${r.error}`);
      } else {
        console.log(`[claimGuard] Released stale claim via dual-surface direct update`);
      }
    }
  }

  // Case 3: No active claim (or stale claims released) → Acquire
  // QF-20260711-937: live fence re-check at THIS write boundary (same predicate as QF-272's
  // three lanes). Binds only the ACQUIRE — an existing self-owned claim above proceeds
  // unchanged. FAIL-CLOSED: 'eligibility_check_error' refuses the claim.
  const fenceReason = await liveClaimWriteFenceReason(supabase, sdKey);
  if (fenceReason) {
    return {
      success: false,
      error: `claim_write_fence:${fenceReason}`,
      fence: fenceReason
    };
  }

  const { data: sdData } = await supabase
    .from('sd_baseline_items')
    .select('track')
    .eq('sd_key', sdKey)
    .single();

  const track = sdData?.track || 'STANDALONE';

  let { data: claimResult, error: claimError } = await supabase.rpc('claim_sd', {
    p_sd_id: sdKey,
    p_session_id: sessionId,
    p_track: track,
    p_client_gate_version: CLAIM_GUARD_CODE_VERSION
  });

  // QF-20260705-057: p_client_gate_version is added by SD-LEO-INFRA-SIDE-CLAIM-ELIGIBILITY-001's
  // migration, which is intentionally chairman-apply-gated and may not be live. PGRST202
  // ("function not found") on that specific param combination means the live claim_sd()
  // doesn't have this parameter yet — fall back to the pre-migration 3-arg signature rather
  // than hard-failing every worker's claim path until the migration is applied.
  if (claimError?.code === 'PGRST202' && /p_client_gate_version/.test(claimError.message || '')) {
    ({ data: claimResult, error: claimError } = await supabase.rpc('claim_sd', {
      p_sd_id: sdKey,
      p_session_id: sessionId,
      p_track: track
    }));
  }

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

  // Fail-soft boundary instrumentation (SD-MAN-INFRA-SAME-TURN-NEXT-001 FR-3)
  await stampClaim(supabase, sdKey, sessionId, process.env.CLAUDE_SESSION_ID === sessionId ? 'env' : 'pointer_fallback'); // SD-LEO-INFRA-CLAIM-IDENTITY-INTEGRITY-001: provenance stamped on every claim_sd path

  // Post-acquisition verification: read back to confirm we actually own the claim
  const verification = await verifyClaimOwnership(sdKey, sessionId);
  if (!verification.verified) {
    return {
      success: false,
      error: `claim_verification_failed: ${verification.error}`,
      owner: undefined
    };
  }

  // QF-20260511-016: Use unified helper so all three success branches converge.
  await reaffirmClaimColumns(supabase, sdKey, sessionId);

  return {
    success: true,
    claim: {
      session_id: sessionId,
      sd_key: sdKey,
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

  // QF-20260711-937: coordinator-authority fence refusal — name the fence, not a claim conflict.
  if (result.fence || /^claim_write_fence:/.test(result.error || '')) {
    const fence = result.fence || String(result.error).replace(/^claim_write_fence:/, '');
    return [
      '╔══════════════════════════════════════════════════════════╗',
      '║  CLAIM GUARD: COORDINATOR-AUTHORITY FENCE — CANNOT CLAIM ║',
      '╚══════════════════════════════════════════════════════════╝',
      `  Fence:     ${fence}`,
      '',
      '  This SD is fenced at the claim-write boundary. Only coordinator/human',
      '  authority clears it (e.g. clear-coordinator-review, flag removal,',
      '  not_before expiry). Do NOT work this SD; pick another.',
      '',
    ].join('\n');
  }

  // FR-1 (SD-LEO-INFRA-SHIP-UNMERGED-LAYERS-001): distinct banner for a cancelled-SD
  // refusal — this is NOT a foreign-claim conflict, so the message must differ.
  if (result.cancelled || result.error === 'sd_cancelled') {
    return [
      '╔══════════════════════════════════════════════════════════╗',
      '║  CLAIM GUARD: SD IS CANCELLED — CANNOT CLAIM            ║',
      '╚══════════════════════════════════════════════════════════╝',
      `  Reason:    ${result.cancellation_reason || '(none recorded)'}`,
      '',
      '  This SD has status=cancelled. Cancelled SDs cannot be claimed.',
      '  Pick a different SD; if this is wrong, re-open the SD first.',
      '',
    ].join('\n');
  }

  // SD-LEO-FIX-CLAIM-RPC-TERMINAL-001: distinct banner for a terminal-status refusal
  // (completed/deferred SD, or completed/cancelled/escalated QF from the claim_sd RPC guard).
  // This is NOT a foreign-claim conflict, so it must not read "claimed by another session".
  if (result.error === 'sd_terminal_status') {
    const st = result.status || 'terminal';
    return [
      '╔══════════════════════════════════════════════════════════╗',
      '║  CLAIM GUARD: ITEM IS TERMINAL — CANNOT CLAIM          ║',
      '╚══════════════════════════════════════════════════════════╝',
      `  Status:    ${st}`,
      '',
      `  This item has status=${st} (a finished/closed lifecycle state).`,
      '  Terminal items cannot be claimed. Pick a different SD/QF;',
      '  if this is wrong, re-open it first.',
      '',
    ].join('\n');
  }

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
      .select('session_id, sd_key, status')
      .eq('sd_key', sdKey)
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
