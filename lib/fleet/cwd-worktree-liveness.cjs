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
 * SLOT-REUSE GUARD (adversarial deep-tier review, this QF's own PR): the slot-free worktree-reuse
 * policy (lib/fleet/worktree-reuse-marker.js's header) checks out a NEW branch inside a directory
 * whose NAME still names the PREVIOUS occupant -- so worktreeKeyOfCwd's path-only parse could
 * resolve a reused slot's STALE key, find it terminal, and report "leftover" for a directory that
 * currently holds a live, different checkout. Cheaply guarded here (not by importing the full
 * lib/git/branch-owner.js key-set resolver, out of this QF's scope -- that module's own header
 * proves a bare regex cannot disambiguate a suffixed branch from a child key's canonical one) by a
 * narrow sanity check: if the checked-out branch is resolvable and does not even CONTAIN the
 * path-derived key as a substring, the path and the real checkout have visibly diverged, and the
 * path-derived key is not trustworthy -- fail toward the safe default instead of querying it.
 */
const { execFileSync } = require('node:child_process');
const { worktreeKeyOfCwd } = require('./sd-executable-here.cjs');

const SD_TERMINAL = Object.freeze(['completed', 'cancelled', 'archived', 'deferred']);
const QF_TERMINAL = Object.freeze(['completed', 'cancelled', 'escalated', 'closed']);

/** Best-effort current branch of `cwd`, or null when it cannot be determined (never throws). */
function currentBranchOf(cwd) {
  try {
    const out = execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const branch = out.trim();
    return branch && branch !== 'HEAD' ? branch : null;
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
  const key = worktreeKeyOfCwd(cwd);
  if (!key) return true; // no worktree segment at all -- irrelevant, repo-match axis skips it anyway
  // Slot-reuse sanity check: a resolvable branch that visibly does not match the path-derived key
  // means the path is stale evidence of a since-reused slot -- do not trust it either way.
  const branch = currentBranchOf(cwd);
  if (branch && !branch.includes(key)) return true;
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

module.exports = { isCwdWorktreeLiveClaim };
