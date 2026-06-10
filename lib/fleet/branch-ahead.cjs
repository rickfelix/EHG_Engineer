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

module.exports = { parseAheadCount, countAhead };
