/**
 * Pure parse of `git rev-list --count` output, shared by the FR-1 pre-park
 * durable-WIP writer and the FR-4 sd-start resume reader so the "commits ahead"
 * signal cannot drift between them (mirrors the silence-cap writer<=reader
 * single-source pattern).
 *
 * SD-FDBK-INFRA-AUTO-PUSH-WIP-001 (FR-1 + FR-4).
 */
'use strict';

const { execSync } = require('child_process');

/**
 * Parse the stdout of `git rev-list --count <range>` to a non-negative integer.
 * Empty / non-numeric / NaN all collapse to 0 (fail-closed: "no commits ahead"),
 * so a probe failure never fabricates phantom unpushed work.
 * @param {string} revListStdout
 * @returns {number}
 */
function parseAheadCount(revListStdout) {
  if (revListStdout == null) return 0;
  const n = parseInt(String(revListStdout).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Count commits on `range` (e.g. "origin/main..feat/x" or "@{u}..HEAD") within
 * a git worktree. Pure-ish IO: returns 0 on ANY error (missing ref, no remote,
 * git unavailable) — never throws. Callers treat 0 as "nothing ahead".
 * @param {string} worktreePath
 * @param {string} range
 * @returns {number}
 */
function countAhead(worktreePath, range) {
  try {
    const out = execSync(`git rev-list --count ${range}`, {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15000,
    });
    return parseAheadCount(out);
  } catch {
    return 0;
  }
}

/**
 * SD-LEO-INFRA-RELEASE-WORK-ITEM-001 (FR-6) — countAhead's 0 IS AMBIGUOUS, AND FOR SOME CALLERS
 * THAT AMBIGUITY IS DANGEROUS.
 *
 * countAhead collapses every failure — missing or archived worktree, unfetched or deleted branch
 * ref, git unavailable, 15s timeout — to a bare 0, and the docstring above calls that "fail-closed:
 * no commits ahead". THAT LABEL IS TRUE ONLY FOR ITS ORIGINAL CALLER. prepark-wip runs INSIDE the
 * worktree it measures, so the worktree is guaranteed present and a 0 really does mean "nothing
 * ahead"; there, inventing phantom work would be the harm.
 *
 * A CALLER DECIDING WHETHER TO REVERT SOMEONE ELSE'S ROW HAS THE OPPOSITE POLARITY. There, 0 reads
 * as "no work — safe to revert", so an unreadable probe silently authorises the destructive branch.
 * And the case that motivated using this signal at all — a stranded branch with unpushed commits and
 * an open PR — is precisely the one that would be misread, because an ended session's worktree is
 * routinely archived and therefore unreadable from the releasing process.
 *
 * So this variant SEPARATES "measured zero" from "could not measure" instead of overloading one
 * number, on the principle already stated in release-work-item.mjs: an unreadable sample must not
 * look like an answer. countAhead is left exactly as it was — its existing caller depends on the
 * current behaviour, and changing a shared contract to suit a new consumer is how the next
 * polarity mismatch gets built.
 *
 * @param {string} worktreePath
 * @param {string} range
 * @returns {{ok: boolean, count: number, reason: string|null}} ok:false means INDETERMINATE
 */
function probeAhead(worktreePath, range) {
  if (!worktreePath) return { ok: false, count: 0, reason: 'no worktree path supplied' };
  try {
    const out = execSync(`git rev-list --count ${range}`, {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15000,
    });
    if (out == null || String(out).trim() === '') {
      return { ok: false, count: 0, reason: 'git produced no output' };
    }
    const n = parseInt(String(out).trim(), 10);
    if (!Number.isFinite(n)) return { ok: false, count: 0, reason: `unparseable rev-list output: ${String(out).trim().slice(0, 40)}` };
    return { ok: true, count: n > 0 ? n : 0, reason: null };
  } catch (err) {
    // Every failure mode lands here — missing worktree, absent ref, no git, timeout. The caller
    // cannot tell them apart and must not need to: all of them mean "unknown", not "none".
    return { ok: false, count: 0, reason: (err && err.message ? String(err.message).slice(0, 120) : 'git probe failed') };
  }
}

module.exports = { parseAheadCount, countAhead, probeAhead };
