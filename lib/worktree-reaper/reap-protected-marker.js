/**
 * Reap-PROTECTED marker (QF-20260725-821) — the opt-OUT, symmetric counterpart to
 * lib/worktree-reaper/reap-eligible-marker.js.
 *
 * WHY THIS EXISTS. LIVE INCIDENT 2026-07-25T12:20:21Z: the reaper deleted the chairman's
 * in-flight CP3 acceptance-drill worktree (.worktrees/cp3-drill-run, branch drill/cp3-live-run)
 * mid-run, verdict=stage2_remove reason=orphan-sd, because its basename did not resolve to an
 * sd_key and it carried no DB claim. Before this module the reaper had exactly TWO protections —
 * isCursorWorktree (a path pattern) and an active DB claim — so EVERY operator-created, drill,
 * and ops worktree matched the reapable profile. The existing .reap-eligible.json marker is
 * opt-IN TO REAPING; there was no opt-OUT of any kind, so recurrence was certain on the next
 * 5-minute sweep.
 *
 * Deliberately NOT solved by fabricating a claude_sessions row or a claim to make the tree look
 * owned — the coordinator rejected that as inventing evidence, which is the correct call.
 *
 * Filesystem-level by design (no DDL), matching the reap-eligible marker convention so the two
 * markers are read the same way. Presence alone is the signal; contents are advisory metadata for
 * a human reading the tree later.
 *
 * NOTE ON SCOPE: this is fix option (1) of the three the incident report ranked. Residency-based
 * protection (option 3 — HEAD/mtime advanced recently means in use) is the general operator fix
 * and is deliberately NOT bundled here.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export const PROTECTED_MARKER_FILENAME = '.reap-protected.json';

/**
 * Write the protection marker at the worktree root. Best-effort — a failure must never throw
 * into a caller's flow (mirrors writeReapEligibleMarker's contract).
 * @param {string} wtPath - worktree root
 * @param {{ reason?: string, protected_by?: string|null, expires_at?: string|null }} [fields]
 * @returns {{ written: boolean, markerPath: string|null, error: string|null }}
 */
export function writeReapProtectedMarker(wtPath, fields = {}) {
  const markerPath = path.join(wtPath, PROTECTED_MARKER_FILENAME);
  try {
    const payload = {
      reason: fields.reason ?? null,
      protected_by: fields.protected_by ?? process.env.CLAUDE_SESSION_ID ?? null,
      expires_at: fields.expires_at ?? null,
      protected_at: new Date().toISOString(),
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
export function readReapProtectedMarker(wtPath) {
  try {
    const raw = fs.readFileSync(path.join(wtPath, PROTECTED_MARKER_FILENAME), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * True when the worktree is marked protected.
 *
 * FAIL-SAFE ASYMMETRY, on purpose: a CORRUPT marker still protects. Presence is checked with
 * existsSync, not by parsing — the cost of honoring an unparseable marker is one un-reaped
 * worktree, while the cost of ignoring it is deleting a tree an operator is standing in. This is
 * the opposite bias from readReapProtectedMarker(), which returns null on corruption because its
 * job is reporting metadata, not deciding safety.
 *
 * @param {string} wtPath @returns {boolean}
 */
export function hasReapProtectedMarker(wtPath) {
  try {
    return fs.existsSync(path.join(wtPath, PROTECTED_MARKER_FILENAME));
  } catch {
    return false;
  }
}

/**
 * True when an EXISTING .reap-protected.json was INHERITED from the tree's own branch/checkout
 * rather than authored by an operator standing in this specific tree. QF-20260912-235: PR #8690
 * briefly committed this file to main; every worktree branched from main between that commit and
 * its removal (PR #8701) inherited it as a tracked path, and hasReapProtectedMarker()'s bare
 * existsSync check cannot tell that apart from a genuine opt-out — jamming the pool at its cap.
 *
 * Two independent signals, either one enough to call it inherited (does NOT change
 * hasReapProtectedMarker's own fail-safe contract — callers combine the two explicitly):
 *   1. `git ls-files --error-unmatch` exits 0 — the path is tracked in this tree's HEAD/index.
 *   2. Belt-and-braces for a tracked copy later `git rm --cached` (file left on disk, now
 *      untracked): the marker's own protected_at/created_at predates the worktree directory's
 *      birth time, i.e. it was on disk before this tree could have authored it.
 * An absent or corrupt marker is never inherited — the existing fail-safe (corrupt = protected)
 * is untouched.
 *
 * @param {string} wtPath
 * @returns {{ inherited: boolean, commit: string|null }}
 */
export function isReapProtectedMarkerInherited(wtPath) {
  try {
    execFileSync('git', ['-C', wtPath, 'ls-files', '--error-unmatch', PROTECTED_MARKER_FILENAME], { stdio: 'ignore' });
    let commit = null;
    try {
      commit = execFileSync('git', ['-C', wtPath, 'log', '-1', '--format=%h', '--', PROTECTED_MARKER_FILENAME], { encoding: 'utf8' }).trim() || null;
    } catch { /* best-effort */ }
    return { inherited: true, commit };
  } catch { /* untracked (or not a git path) — fall through to the timestamp check */ }

  try {
    const marker = readReapProtectedMarker(wtPath);
    const stampMs = Date.parse(marker?.protected_at || marker?.created_at || '');
    const birthMs = fs.statSync(wtPath).birthtimeMs;
    if (Number.isFinite(stampMs) && Number.isFinite(birthMs) && birthMs > 0 && stampMs < birthMs) {
      return { inherited: true, commit: null };
    }
  } catch { /* undetermined — fail-safe: not inherited, stays protected */ }

  return { inherited: false, commit: null };
}

export default {
  PROTECTED_MARKER_FILENAME,
  writeReapProtectedMarker,
  readReapProtectedMarker,
  hasReapProtectedMarker,
  isReapProtectedMarkerInherited,
};
