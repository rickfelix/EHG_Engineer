/**
 * Live-claim removal guard — the last line before any worktree removal.
 * QF-20260710-432 (Alpha-2 incident, coordinator RCA ffa87253)
 *
 * The incident: a worktree CLAIMED by a live SD session but with ZERO commits was
 * reaped mid-PLAN — before first commit is exactly when a worktree looks reap-able
 * and is not. The existing protections key on session-derived path maps
 * (v_active_sessions with a heartbeat threshold) which can miss a genuinely live
 * claim; the orphan sweep additionally swallowed claim-map load errors into an
 * EMPTY owner set (silent fail-open).
 *
 * This guard asks the authoritative question directly, per the canonical claim
 * machinery worker-checkin uses (claiming_session_id + isSessionAlive — NOT a
 * hand-rolled second liveness predicate):
 *
 *   Is the SD/QF this worktree belongs to claimed, and is the claimant alive?
 *
 * FAIL-CLOSED: any lookup error refuses removal. A reaper that cannot verify a
 * claim must not destroy the worktree (data-loss adjacency beats tidiness).
 */

import path from 'node:path';
import { createRequire } from 'node:module';

const requireCjs = createRequire(import.meta.url);
const { isSessionAlive } = requireCjs('../fleet/session-liveness.cjs');

/** Fields isSessionAlive() consumes (same set worker-checkin selects). */
const SESSION_FIELDS = 'session_id, is_alive, heartbeat_at, heartbeat_age_seconds, terminal_id, current_branch';

/**
 * Derive the owning work-item key from a worktree path.
 * Conventions: .worktrees/SD-<...> | .worktrees/qf/<QF-...> | qf/fix branch dirs
 * named QF-*. Returns null when the dir name maps to no SD/QF key.
 *
 * @param {string} wtPath
 * @returns {{kind: 'sd'|'qf', key: string} | null}
 */
export function keyFromWorktreePath(wtPath) {
  if (!wtPath) return null;
  const base = path.basename(String(wtPath));
  const parent = path.basename(path.dirname(String(wtPath)));
  const norm = base.replace(/[\\/]+$/, '');
  if (/^SD-/i.test(norm)) return { kind: 'sd', key: norm.replace(/^sd-/, 'SD-') };
  // QF worktrees: .worktrees/qf/QF-... (typed subdir) or ad-hoc qf-.../QF-... basenames.
  // Keys are canonically uppercase (quick_fixes.id) — normalize the prefix.
  if (/^QF-/i.test(norm)) return { kind: 'qf', key: norm.replace(/^qf-/i, 'QF-') };
  if (parent.toLowerCase() === 'qf') return null; // qf/<non-QF-name> — no derivable key
  return null;
}

/**
 * Should removal of this worktree be BLOCKED because its owning SD/QF is
 * live-claimed? A live-claimed worktree is never reaped regardless of commit
 * count, age, or registration state.
 *
 * @param {Object} supabase
 * @param {string} wtPath
 * @param {Object} [opts]
 * @param {Function} [opts.isSessionAliveFn] - injectable for tests
 * @param {Function} [opts.logger]
 * @returns {Promise<{blocked: boolean, reason: string, detail?: object}>}
 */
export async function liveClaimBlocksRemoval(supabase, wtPath, opts = {}) {
  const { isSessionAliveFn = isSessionAlive, logger = null } = opts;

  const parsed = keyFromWorktreePath(wtPath);
  if (!parsed) return { blocked: false, reason: 'no_work_key_in_path' };
  if (!supabase) {
    // No DB access = cannot verify = refuse (fail-closed).
    return { blocked: true, reason: 'unverifiable_no_supabase', detail: parsed };
  }

  try {
    const table = parsed.kind === 'sd' ? 'strategic_directives_v2' : 'quick_fixes';
    const keyCol = parsed.kind === 'sd' ? 'sd_key' : 'id'; // quick_fixes keys on id (QF-...)
    const { data: row, error } = await supabase
      .from(table)
      .select('claiming_session_id')
      .eq(keyCol, parsed.key)
      .maybeSingle();
    if (error) {
      return { blocked: true, reason: 'unverifiable_claim_lookup_error', detail: { ...parsed, error: error.message } };
    }

    const claimant = row?.claiming_session_id || null;

    if (claimant) {
      const { data: session, error: sErr } = await supabase
        .from('v_active_sessions')
        .select(SESSION_FIELDS)
        .eq('session_id', claimant)
        .maybeSingle();
      if (sErr) {
        return { blocked: true, reason: 'unverifiable_session_lookup_error', detail: { ...parsed, claimant, error: sErr.message } };
      }
      if (session && isSessionAliveFn(session).alive) {
        logger?.(`live-claim-guard: BLOCKED removal of ${parsed.key} — claimed by live session ${claimant}`);
        return { blocked: true, reason: 'live_claimed', detail: { ...parsed, claimant } };
      }
      // Claim set but claimant not visibly alive: the claim TTL/steal machinery
      // arbitrates ownership; the REAPER still must not destroy a claimed worktree.
      return { blocked: true, reason: 'claimed_claimant_not_verifiably_alive', detail: { ...parsed, claimant } };
    }

    // Half-write case: SD-side claim cleared but a LIVE session still points at the
    // key via its session row (the same case foreignClaimantBlocksSteal covers).
    const col = parsed.kind === 'sd' ? 'sd_key' : 'qf_id';
    const { data: sessions, error: vErr } = await supabase
      .from('v_active_sessions')
      .select(SESSION_FIELDS)
      .eq(col, parsed.key)
      .limit(1);
    if (vErr) {
      return { blocked: true, reason: 'unverifiable_session_scan_error', detail: { ...parsed, error: vErr.message } };
    }
    const pointing = sessions && sessions[0];
    if (pointing && isSessionAliveFn(pointing).alive) {
      logger?.(`live-claim-guard: BLOCKED removal of ${parsed.key} — live session ${pointing.session_id} points at it (claim half-write)`);
      return { blocked: true, reason: 'live_session_pointing', detail: { ...parsed, session: pointing.session_id } };
    }

    return { blocked: false, reason: 'no_live_claim' };
  } catch (e) {
    return { blocked: true, reason: 'unverifiable_guard_exception', detail: { ...parsed, error: String(e?.message || e) } };
  }
}
