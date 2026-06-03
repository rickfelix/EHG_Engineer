/**
 * Reacquire Self-Live Claim — SD-FDBK-ENH-CLAIM-WORKING-GOES-001 (Approach B)
 *
 * THE BUG
 * -------
 * During long (10+ min) parallel sub-agent runs the owning Claude Code session
 * makes zero tool calls, its PostToolUse heartbeat never fires, and the sd-start
 * heartbeat daemon has already exited. stale-session-sweep
 * (scripts/stale-session-sweep.cjs) ages the claim out: claude_sessions flips
 * active->stale (~120s) then stale->released (~30s later), clearing
 * claude_sessions.sd_key AND directly clearing
 * strategic_directives_v2.{claiming_session_id, is_working_on}. The
 * sync_is_working_on_with_session trigger CLEAR branch independently flips
 * is_working_on=false on that release.
 *
 * After that, `node scripts/handoff.js execute ...` hard-fails because
 * trg_enforce_is_working_on_handoffs RAISEs
 * "Cannot create handoff for SD without active session claim" whenever
 * strategic_directives_v2.is_working_on is not TRUE.
 *
 * Critically, the sync trigger's SET branch only fires on
 *   (OLD.sd_key IS NULL AND NEW.sd_key IS NOT NULL AND NEW.status='active')
 * — i.e. a fresh NULL->non-NULL claim transition on claude_sessions. When the
 * live session's claude_sessions row is still (or again) active/idle with sd_key
 * already stamped, there is NO such transition, so re-writing claude_sessions
 * does NOT restore is_working_on. The Step-1 "activeClaim" early-return in
 * BaseExecutor._claimSDForSession only refreshes claude_sessions.heartbeat_at and
 * never touches strategic_directives_v2.is_working_on, so the handoff INSERT
 * still trips the enforce trigger. THIS is the residual gap (a prior fix,
 * 20260511_sync_is_working_on_preserve_recoverable_stale.sql, only protected the
 * ~30s recoverable-stale grace window, not the 10+min released case).
 *
 * THE FIX (Approach B — re-acquire at the handoff claim chokepoint)
 * ----------------------------------------------------------------
 * At the handoff claim chokepoint, re-acquire
 * strategic_directives_v2.is_working_on=true (+ claiming_session_id=self) for a
 * claim THIS live session legitimately owns that the sweep released — so the
 * handoff proceeds — while preserving all protection against dead/foreign
 * sessions.
 *
 * Because routing via claude_sessions would NOT re-fire the trigger SET branch
 * for the already-active-row case (see above), this uses a GUARDED, fail-closed
 * compare-and-swap directly on strategic_directives_v2 (the same column write
 * claim_sd / reaffirmClaimColumns already perform), gated by two witnesses:
 *
 *   FR-2(a) SELF-OWNERSHIP: process.cwd() is inside sd.worktree_path (normalized
 *           — same ownership signal as claim-validity-gate CHECK 3; a foreign
 *           session is not in this SD's worktree). For orchestrator SDs with no
 *           worktree_path, fall back to resolveOwnSession returning
 *           deterministically (source !== 'heartbeat_fallback') a session whose
 *           sd_key === sd.sd_key.
 *   FR-2(b) NO LIVE FOREIGN HOLDER: checkPreClaimEvidence(...).allowReclaim !== false.
 *
 * Deliberately NOT used as liveness signals (per FR-2): claude_sessions.is_alive
 * (sticky; survives kill -9), process_alive_at (fleet-broken), or a fresh
 * heartbeat (stale by definition in this bug). The implicit liveness witness is
 * that THIS handoff process is executing right now.
 *
 * FR-3 fail-closed CAS: the write only sets when claiming_session_id IS NULL OR
 * already equals self, so a concurrent FOREIGN claim wins safely and is never
 * clobbered. No DB migration / no schema change. stale-session-sweep is NOT
 * modified.
 *
 * FR-4: gated behind DEFAULT-ON env flag CLAIM_REACQUIRE_SELF_LIVE (disabled
 * only when === 'false'); disabling reverts to today's hard-fail.
 *
 * @module reacquire-self-live
 */

/**
 * FR-2(a) self-ownership predicate (pure). True when `cwd` is the SD's
 * registered worktree directory or a descendant of it.
 *
 * Mirrors the canonical normalization in claim-validity-gate.js CHECK 3:
 * on win32, convert forward slashes to backslashes and lowercase (the
 * filesystem is case-insensitive); compare exact OR prefix + separator so a
 * sibling like `.worktrees/SD-FOO-001-OTHER` does not match
 * `.worktrees/SD-FOO-001`.
 *
 * @param {string|null|undefined} cwd - current working directory
 * @param {string|null|undefined} worktreePath - SD's registered worktree_path
 * @param {string} [platform=process.platform] - injectable for tests
 * @returns {boolean}
 */
export function isCwdInsideWorktree(cwd, worktreePath, platform = process.platform) {
  if (!cwd || !worktreePath) return false;
  const normalize = (p) => {
    let s = String(p);
    if (platform === 'win32') {
      s = s.replace(/\//g, '\\').toLowerCase();
    }
    return s;
  };
  // Derive the separator from the `platform` argument (NOT path.sep, which is
  // host-dependent — on a Windows host path.sep is '\\' even when callers inject
  // platform='linux' for tests).
  const sep = platform === 'win32' ? '\\' : '/';
  const nCwd = normalize(cwd);
  const nWt = normalize(worktreePath);
  return nCwd === nWt || nCwd.startsWith(nWt + sep);
}

/**
 * Determine whether this live session legitimately self-owns `sd` (FR-2(a)),
 * returning the resolved session id when known.
 *
 * Primary signal: cwd inside worktree_path. Orchestrator/no-worktree fallback:
 * resolveOwnSession deterministic (source !== 'heartbeat_fallback') with
 * resolved sd_key === sd.sd_key.
 *
 * @param {object} args
 * @param {object} args.sd - SD record (must include sd_key; worktree_path optional)
 * @param {string} args.cwd - current working directory
 * @param {Function} args.resolveSession - async () => { data, source } (resolveOwnSession bound to supabase)
 * @param {string} [args.platform]
 * @returns {Promise<{selfOwned: boolean, via: string, sessionId: string|null}>}
 */
export async function resolveSelfOwnership({ sd, cwd, resolveSession, platform }) {
  // Primary: cwd inside the SD's registered worktree.
  if (sd?.worktree_path && isCwdInsideWorktree(cwd, sd.worktree_path, platform)) {
    // We still try to learn our session id (for the claiming_session_id write),
    // but ownership is already established by the worktree witness.
    let sessionId = null;
    try {
      const resolved = await resolveSession();
      if (resolved?.data && resolved.source !== 'heartbeat_fallback') {
        sessionId = resolved.data.session_id || null;
      }
    } catch {
      // Non-fatal — worktree witness alone proves self-ownership; sessionId stays null.
    }
    return { selfOwned: true, via: 'worktree_path', sessionId };
  }

  // Fallback (orchestrator / no worktree_path): deterministic session whose
  // sd_key matches this SD.
  try {
    const resolved = await resolveSession();
    if (
      resolved?.data &&
      resolved.source !== 'heartbeat_fallback' &&
      resolved.data.sd_key &&
      sd?.sd_key &&
      resolved.data.sd_key === sd.sd_key
    ) {
      return { selfOwned: true, via: 'resolve_own_session_sd_key', sessionId: resolved.data.session_id || null };
    }
  } catch {
    // Non-fatal — fall through to not-self-owned.
  }

  return { selfOwned: false, via: 'none', sessionId: null };
}

/**
 * Re-acquire is_working_on for a self-owned, sweep-released claim at the handoff
 * chokepoint. Fail-closed, idempotent, and a strict no-op on the healthy path.
 *
 * Returns a structured outcome describing what happened (never throws — callers
 * wrap in try/catch too, but this function additionally degrades internally so
 * any failure leaves today's behavior intact).
 *
 * @param {object} supabase - Supabase service client
 * @param {object} opts
 * @param {object} opts.sd - SD record from the handoff (used for sd_key + cheap is_working_on pre-filter)
 * @param {Function} opts.resolveSession - async () => resolveOwnSession(...) result, already bound to supabase
 * @param {Function} opts.checkPreClaimEvidence - async (supabase, sdKey, {mySessionId}) => { allowReclaim, ... }
 * @param {string} [opts.cwd=process.cwd()]
 * @param {string} [opts.platform=process.platform]
 * @param {object} [opts.env=process.env]
 * @param {Function} [opts.log=console.log]
 * @returns {Promise<{reacquired: boolean, reason: string, via?: string, sessionId?: string|null}>}
 */
export async function reacquireSelfLiveClaim(supabase, opts = {}) {
  const {
    sd,
    resolveSession,
    checkPreClaimEvidence,
    cwd = process.cwd(),
    platform = process.platform,
    env = process.env,
    log = console.log,
  } = opts;

  // FR-4: default-ON env flag; disabled only on explicit 'false'.
  if (env.CLAIM_REACQUIRE_SELF_LIVE === 'false') {
    return { reacquired: false, reason: 'flag_disabled' };
  }

  const sdKey = sd?.sd_key;
  if (!sdKey) {
    return { reacquired: false, reason: 'no_sd_key' };
  }

  try {
    // Cheap pre-filter: skip entirely on the common healthy path where the
    // caller's (possibly cached) SD already shows is_working_on=true.
    if (sd?.is_working_on === true) {
      return { reacquired: false, reason: 'already_working_cached' };
    }

    // Re-read FRESH claim state (the caller's `sd` may be stale — it was loaded
    // before the sweep ran). Only proceed when the live row confirms the claim
    // is NOT currently held as working.
    const { data: fresh, error: freshErr } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, is_working_on, claiming_session_id, active_session_id, worktree_path')
      .eq('sd_key', sdKey)
      .maybeSingle();

    if (freshErr) {
      return { reacquired: false, reason: `fresh_read_error:${freshErr.message}` };
    }
    if (!fresh) {
      return { reacquired: false, reason: 'sd_not_found' };
    }
    if (fresh.is_working_on === true) {
      // Healthy (or already restored by a concurrent path) — nothing to do.
      return { reacquired: false, reason: 'already_working' };
    }

    // FR-2(a): self-ownership witness. Prefer the fresh worktree_path; fall back
    // to the caller-provided one.
    const sdForOwnership = { sd_key: sdKey, worktree_path: fresh.worktree_path ?? sd?.worktree_path ?? null };
    const ownership = await resolveSelfOwnership({ sd: sdForOwnership, cwd, resolveSession, platform });
    if (!ownership.selfOwned) {
      // Dead/other-self protection: we cannot prove THIS live session owns the
      // claim, so we must not re-acquire.
      return { reacquired: false, reason: 'not_self_owned' };
    }

    // FR-2(b): no live foreign holder. allowReclaim === false means a live
    // holder blocks reclaim; anything else (unclaimed/clean, dead ghost, or
    // query degradation returning allowReclaim:true) permits it.
    let allowReclaim = true;
    try {
      const evidence = await checkPreClaimEvidence(supabase, sdKey, { mySessionId: ownership.sessionId || undefined });
      allowReclaim = evidence?.allowReclaim !== false;
    } catch (egErr) {
      // Fail-open on the evidence probe ONLY (matches sweep's own degradation
      // policy); the CAS guard below still prevents clobbering a foreign claim.
      log(`[claim-reacquire] evidence probe degraded for ${sdKey} (${egErr?.message || egErr}) — relying on CAS guard`);
      allowReclaim = true;
    }
    if (!allowReclaim) {
      return { reacquired: false, reason: 'live_foreign_holder' };
    }

    // FR-3: fail-closed compare-and-swap. Only set when the SD is currently
    // unclaimed (claiming_session_id IS NULL) OR already claimed by self. A
    // concurrent FOREIGN claim acquired between our read and write makes this a
    // no-op (0 rows updated) — we never clobber it.
    const selfId = ownership.sessionId;
    const orFilter = selfId
      ? `claiming_session_id.is.null,claiming_session_id.eq.${selfId}`
      : 'claiming_session_id.is.null';

    const update = { is_working_on: true };
    if (selfId) {
      update.claiming_session_id = selfId;
      update.active_session_id = selfId;
    }

    const { data: updated, error: casErr } = await supabase
      .from('strategic_directives_v2')
      .update(update)
      .eq('sd_key', sdKey)
      .or(orFilter)
      .select('sd_key, is_working_on, claiming_session_id');

    if (casErr) {
      return { reacquired: false, reason: `cas_error:${casErr.message}` };
    }
    const rowCount = Array.isArray(updated) ? updated.length : (updated ? 1 : 0);
    if (rowCount === 0) {
      // CAS lost the race to a foreign claim (or the row no longer matches).
      return { reacquired: false, reason: 'cas_noop_foreign_or_changed' };
    }

    // FR-5: one structured log line on an actual re-acquire.
    log(JSON.stringify({
      event: 'claim_reacquire_self_live',
      sd_key: sdKey,
      session: selfId || null,
      via: ownership.via,
      sweep_released: true,
      note: 'sweep-released claim re-acquired for live self-owned session at handoff chokepoint (SD-FDBK-ENH-CLAIM-WORKING-GOES-001)',
      timestamp: new Date().toISOString(),
    }));

    return { reacquired: true, reason: 'reacquired', via: ownership.via, sessionId: selfId };
  } catch (err) {
    // FR: any failure degrades to today's behavior (never throw out of the
    // claim step).
    log(`[claim-reacquire] degraded for ${sdKey} (non-fatal): ${err?.message || err}`);
    return { reacquired: false, reason: `degraded:${err?.message || err}` };
  }
}

export default { reacquireSelfLiveClaim, resolveSelfOwnership, isCwdInsideWorktree };
