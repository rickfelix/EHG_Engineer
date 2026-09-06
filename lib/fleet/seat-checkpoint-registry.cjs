'use strict';

/**
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A -- the single, shared definition of "role seat" that
 * BOTH the write side (lib/fleet/seat-checkpoint-mirror.cjs, called from stale-session-sweep.cjs)
 * and the read side (scripts/seat-checkpoint-staleness-check.mjs) import, so the two can never
 * silently diverge into different denominators again (three rounds of PLAN-phase adversarial
 * review, evidence 79b61564/3fb39af9/732f0d3f, converged here after finding exactly that class of
 * defect twice in earlier drafts).
 *
 * SEAT_NAMES is fixed and small ON PURPOSE -- unrelated files already exist in `.claude/` outside
 * this set (golf-session-state-*.md, a bare session-state.md, session-state-alpha3-*.md) and must
 * never be picked up as a role seat.
 */
const SEAT_NAMES = Object.freeze(['adam', 'solomon', 'coordinator', 'michael']);

/**
 * A candidate filename counts as belonging to `seatName` if it CONTAINS the seat token (never a
 * prefix-anchored match) AND matches one of the two known naming conventions in this repo:
 * '-session-state-' (adam/solomon/coordinator) or '-seat-state-' (michael's
 * 'alpha-michael-seat-state-<suffix>.md', where the token is not leading).
 */
function isCandidateFile(seatName, filename) {
  if (typeof filename !== 'string') return false;
  if (!filename.endsWith('.md')) return false;
  if (!filename.includes(seatName)) return false;
  return filename.includes('-session-state-') || filename.includes('-seat-state-');
}

/**
 * List every local `.claude/*.md` file that is a candidate for `seatName`.
 *
 * EXEC-TO-PLAN SECURITY evidence (2026-09-06): symlinks are rejected here (via lstatSync, so the
 * link itself is inspected rather than followed) -- zero symlinks were measured in `.claude/`
 * today, but nothing upstream of this function ever did that check, and a symlink named to match
 * a candidate pattern would otherwise have its target's content durably persisted into a
 * service-role-only table. A rejected candidate is silently excluded, same fail-soft posture as
 * an unreadable file.
 * @param {string} claudeDir - absolute path to the repo's `.claude/` directory
 * @param {string} seatName - one of SEAT_NAMES
 * @param {{readdirSync?: Function, lstatSync?: Function}} [deps] - injectable for tests
 * @returns {string[]} absolute file paths
 */
function listCandidateFiles(claudeDir, seatName, deps = {}) {
  const fs = deps.fsModule || require('fs');
  const path = deps.pathModule || require('path');
  const readdirSync = deps.readdirSync || fs.readdirSync;
  const lstatSync = deps.lstatSync || fs.lstatSync;
  let entries;
  try {
    entries = readdirSync(claudeDir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => isCandidateFile(seatName, name))
    .map((name) => path.join(claudeDir, name))
    .filter((fullPath) => {
      try {
        return !lstatSync(fullPath).isSymbolicLink();
      } catch {
        return false;
      }
    });
}

module.exports = { SEAT_NAMES, isCandidateFile, listCandidateFiles };
