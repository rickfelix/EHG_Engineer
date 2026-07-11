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

export default { MARKER_FILENAME, writeReapEligibleMarker, readReapEligibleMarker, hasReapEligibleMarker };
