/**
 * Reap-eligible marker (SD-LEO-INFRA-WORKTREE-REAPER-RESIDENT-001, FR-3).
 *
 * The out-of-band reap handoff: instead of a post-merge flow deleting the
 * worktree its own process is standing in (the self-reap vector), it writes
 * this durable filesystem marker and exits with the worktree intact. The
 * SCHEDULED reaper collects marker-bearing worktrees once residency clears.
 *
 * Filesystem-level by design (no DDL): mirrors the proven cleanup_pending
 * deferred-delete pattern without a migration dependency. Marker writes are
 * best-effort — a failure must never fail the merge (the reaper's normal
 * age-based classification still collects the worktree later).
 */
import fs from 'fs';
import path from 'path';

export const MARKER_FILENAME = '.reap-eligible.json';

/**
 * Write the reap-eligible marker at the worktree root. Best-effort.
 * @param {string} wtPath - worktree root
 * @param {{ sd_key?: string, merged_pr?: number|string|null, marked_by_session?: string|null }} [fields]
 * @returns {{ written: boolean, markerPath: string|null, error: string|null }}
 */
export function writeReapEligibleMarker(wtPath, fields = {}) {
  const markerPath = path.join(wtPath, MARKER_FILENAME);
  try {
    const payload = {
      sd_key: fields.sd_key ?? null,
      merged_pr: fields.merged_pr ?? null,
      marked_by_session: fields.marked_by_session ?? process.env.CLAUDE_SESSION_ID ?? null,
      marked_at: new Date().toISOString(),
    };
    fs.writeFileSync(markerPath, JSON.stringify(payload, null, 2), 'utf8');
    return { written: true, markerPath, error: null };
  } catch (e) {
    return { written: false, markerPath: null, error: e?.message || String(e) };
  }
}

/**
 * Read the marker if present and parseable.
 * @param {string} wtPath - worktree root
 * @returns {object|null} marker payload, or null when absent/corrupt
 */
export function readReapEligibleMarker(wtPath) {
  try {
    const raw = fs.readFileSync(path.join(wtPath, MARKER_FILENAME), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** @param {string} wtPath @returns {boolean} */
export function hasReapEligibleMarker(wtPath) {
  return fs.existsSync(path.join(wtPath, MARKER_FILENAME));
}

/**
 * MARKER REVALIDATION (SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B, FR-3).
 *
 * THE INCIDENT. At 2026-07-31T21:34:48Z the reaper removed the RLS posture ceremony tree
 * on the authority of a marker written 5.5 HOURS EARLIER by a DIFFERENT session, recording
 * a DIFFERENT SD (SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001) than the branch it ended up
 * deleting (scribe/rls-receipts-20260731). An affirmative "this tree is disposable"
 * decision, correct when made about one piece of work, silently licensed the deletion of
 * unrelated work that appeared in that tree hours later.
 *
 * WHY IT WAS POSSIBLE. hasReapEligibleMarker is existsSync ONLY. classifyWorktree pushed
 * the reap-eligible category on PRESENCE alone and called readReapEligibleMarker purely to
 * populate an evidence field that NO PREDICATE CONSULTS. So sd_key and marked_at were
 * parsed, recorded, and ignored: the two fields needed to expire the marker were already
 * in hand and nothing read them. Same shape as the live-claim fail-open — an input the
 * guard does not validate is treated as permission.
 *
 * hasReapEligibleMarker deliberately KEEPS its pure-presence contract; validation lives in
 * a separate predicate rather than being folded in. Existing callers and tests that ask
 * "is there a marker?" are unaffected.
 *
 * THE MISMATCH RULE IS NARROWER THAN IT FIRST LOOKS, and getting it wrong causes the exact
 * false-expiry it exists to prevent. Three of the four marker producers do NOT write a
 * canonical SD key: worktree-merge.js writes a relative PATH, post-merge-worktree-cleanup
 * falls back to a basename, and the field defaults to null. A path-shaped value reduces to
 * a real key and MATCHES — refusing it would reject legitimate markers. So: declare a
 * mismatch ONLY when BOTH sides resolve to a canonical ^(SD|QF)- key AND they differ.
 * Everything else is CANNOT-VALIDATE, which does not authorise (consistent with FR-1: the
 * inability to verify is not permission), but is reported distinctly from a real mismatch
 * so the two are never conflated in a log.
 */
export const DEFAULT_MARKER_TTL_MIN = 120;

/**
 * Reduce a recorded value to a canonical work key, or null when it is not one.
 * Tolerates the PATH shape that worktree-merge.js actually writes.
 */
export function canonicalWorkKey(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/[\\/]+$/, '');
  if (!trimmed) return null;
  const base = trimmed.split(/[\\/]/).pop();
  const m = /^(sd|qf)-(.+)$/i.exec(base || '');
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

function resolveTtlMin(explicit) {
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const env = Number(process.env.REAP_ELIGIBLE_TTL_MIN);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_MARKER_TTL_MIN;
}

/**
 * Does the marker still carry authority to license removal of THIS tree, NOW?
 *
 * nowMs and ttlMin default INTERNALLY on purpose: the reaper's classification context does
 * not supply them, and a destructure-and-assume signature would make every existing caller
 * silently pass undefined.
 *
 * @param {string} wtPath
 * @param {{ nowMs?: number, treeKey?: string|null, ttlMin?: number }} [options]
 *   treeKey — the work key the CALLER resolved for this tree (it owns keyFromWorktree;
 *   resolving it here would drag a script-level dependency into lib).
 * @returns {{ valid: boolean, reason: string|null, detail?: object }}
 */
export function isReapEligibleMarkerValid(wtPath, options = {}) {
  const { nowMs = Date.now(), treeKey = null } = options;
  const ttlMin = resolveTtlMin(options.ttlMin);

  if (!hasReapEligibleMarker(wtPath)) return { valid: false, reason: 'marker_absent' };

  const marker = readReapEligibleMarker(wtPath);
  if (!marker) return { valid: false, reason: 'marker_unreadable' }; // corrupt/unparseable

  const markedAt = Date.parse(marker.marked_at || '');
  if (!Number.isFinite(markedAt)) return { valid: false, reason: 'marker_no_timestamp' };

  const ageMs = nowMs - markedAt;
  if (ageMs > ttlMin * 60 * 1000) {
    return { valid: false, reason: 'marker_expired_age', detail: { age_ms: ageMs, ttl_min: ttlMin } };
  }

  const markerKey = canonicalWorkKey(marker.sd_key);
  const treeCanon = canonicalWorkKey(treeKey);
  if (markerKey && treeCanon) {
    if (markerKey !== treeCanon) {
      return { valid: false, reason: 'marker_sd_key_mismatch', detail: { marker_key: markerKey, tree_key: treeCanon } };
    }
    return { valid: true, reason: null, detail: { age_ms: ageMs, matched_key: markerKey } };
  }

  // One or both sides do not resolve to a work key — we cannot confirm the marker is
  // ABOUT this tree, so it does not authorise. Distinct from a positive mismatch.
  return {
    valid: false,
    reason: 'marker_key_unverifiable',
    detail: { marker_sd_key: marker.sd_key ?? null, tree_key: treeKey ?? null },
  };
}

export default {
  MARKER_FILENAME,
  DEFAULT_MARKER_TTL_MIN,
  writeReapEligibleMarker,
  readReapEligibleMarker,
  hasReapEligibleMarker,
  isReapEligibleMarkerValid,
  canonicalWorkKey,
};
