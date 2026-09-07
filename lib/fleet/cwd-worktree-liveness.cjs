'use strict';
/**
 * cwd-worktree-liveness.cjs — QF-20260905-060.
 *
 * Answers: does the SD/QF whose worktree the current process cwd sits inside still have a LIVE
 * in-progress claim right now? A "leftover" worktree -- its own build already shipped or the
 * claim released, the session simply never cd'd away -- has no committed context left to
 * conflict with, and sd-executable-here.cjs's repo-match axis should not treat it as one (that
 * false positive purged a directed venture-targeted WORK_ASSIGNMENT from ANY leftover harness
 * worktree cwd, not only a genuinely conflicting in-progress build — the QF specimen: WA 89c1faec
 * read from an EHG_Engineer .worktrees path left over from the already-completed QF-20260903-347).
 *
 * FAIL-OPEN TOWARD THE PRE-FIX DEFAULT (true = "assume live"), not toward the new leniency: an
 * uncertain read must never WEAKEN the existing repo-match check beyond what this QF measured and
 * fixed. Only a POSITIVELY-confirmed terminal/unclaimed row returns false.
 *
 * SLOT-REUSE CORRECTION (two rounds of adversarial deep-tier review, this QF's own PR): the
 * slot-free worktree-reuse policy (lib/fleet/worktree-reuse-marker.js's header) checks out a NEW
 * branch inside a directory whose NAME still names the PREVIOUS occupant, so worktreeKeyOfCwd's
 * path-only parse can resolve a stale key.
 *
 * ROUND 1 FIX (branch-substring sanity check) WAS ITSELF DEFEATED, ROUND 2 FOUND: a branch that
 * merely CONTAINS the stale path-derived key as a substring passed the check unchanged -- and this
 * exact codebase's parent/child SD naming convention (e.g. 'SD-X-001' parent, 'SD-X-001-F' child,
 * branch 'feat/SD-X-001-F') makes that collision routine, not a corner case. Replaced with a
 * PRECISE correction instead of a heuristic sanity check: worktree-reuse-marker.js's marker file
 * names the TRUE current occupant directly (no inference), read here without a cross-format ESM
 * require (the format is a small, stable, gitignored JSON file -- reimplemented inline rather than
 * importing the ESM module from this CJS one). When the marker is present, unexpired, and names a
 * DIFFERENT key than the path, the marker's key is used for the liveness lookup below -- not a
 * blind fail-to-true, an ACTUALLY CORRECT answer for the real current occupant.
 *
 * DISCLOSED RESIDUAL: the marker is itself best-effort (worktree-reuse-marker.js's own docblock) --
 * a reuse that never wrote a fresh marker, or one whose TTL has since expired, still resolves via
 * the stale path-derived key, same as before this guard existed. Accepted rather than hidden: this
 * QF's scope is the measured false-positive on a LEFTOVER (unreused) worktree, not a full solve of
 * slot-reuse identity resolution (that already-scoped problem lives in lib/git/branch-owner.js,
 * whose own header proves a bare regex cannot disambiguate the general case).
 */
const fs = require('node:fs');
const path = require('node:path');
const { worktreeKeyOfCwd } = require('./sd-executable-here.cjs');

const SD_TERMINAL = Object.freeze(['completed', 'cancelled', 'archived', 'deferred']);
const QF_TERMINAL = Object.freeze(['completed', 'cancelled', 'escalated', 'closed']);

// Mirrors lib/fleet/worktree-reuse-marker.js's WORKTREE_REUSE_MARKER_FILENAME /
// DEFAULT_MARKER_TTL_MIN constants (that module is ESM; this one is CJS).
const REUSE_MARKER_FILENAME = '.worktree-reuse.json';
const REUSE_MARKER_TTL_MIN = 120;

/** Best-effort read of the reuse marker's `key` field, or null when absent, corrupt, or past its
 *  TTL (matches worktree-reuse-marker.js's readReuseMarker semantics: all three read as "no
 *  marker", never as an error). Never throws. */
function readReuseMarkerKey(cwd, nowMs = Date.now()) {
  try {
    const raw = fs.readFileSync(path.join(cwd, REUSE_MARKER_FILENAME), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.key !== 'string' || !parsed.key) return null;
    const markedAt = Date.parse(parsed.marked_at || '');
    if (!Number.isFinite(markedAt)) return null;
    if (Math.max(0, nowMs - markedAt) > REUSE_MARKER_TTL_MIN * 60 * 1000) return null;
    return parsed.key;
  } catch {
    return null;
  }
}

/**
 * @param {object} sb - service-role Supabase client
 * @param {string} cwd
 * @returns {Promise<boolean>} true = treat as live/committed context (default, safe); false =
 *   positively confirmed the cwd's own worktree SD/QF has no live claim (a "leftover")
 */
async function isCwdWorktreeLiveClaim(sb, cwd) {
  let key = worktreeKeyOfCwd(cwd);
  if (!key) return true; // no worktree segment at all -- irrelevant, repo-match axis skips it anyway
  // Slot-reuse correction: an unexpired marker naming a DIFFERENT key IS the true current
  // occupant -- use it, not a defensive bail-to-true, for the lookup below.
  const markerKey = readReuseMarkerKey(cwd);
  if (markerKey && markerKey !== key) key = markerKey;
  try {
    if (/^QF-/.test(key)) {
      const { data, error } = await sb.from('quick_fixes').select('status').eq('id', key).maybeSingle();
      if (error || !data) return true; // could-not-determine -> old (stricter) behavior
      return !QF_TERMINAL.includes(data.status) && data.status === 'in_progress';
    }
    const { data, error } = await sb.from('strategic_directives_v2')
      .select('status, claiming_session_id').eq('sd_key', key).maybeSingle();
    if (error || !data) return true;
    return !SD_TERMINAL.includes(data.status) && !!data.claiming_session_id;
  } catch {
    return true; // any thrown error -> old (stricter) behavior, never the new leniency
  }
}

module.exports = { isCwdWorktreeLiveClaim, readReuseMarkerKey };
