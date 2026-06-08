/**
 * Claimable-work predicate for coordinator reporting.
 *
 * SD-FDBK-FIX-FIX-COORDINATOR-EMAIL-001 (follow-up to QF-20260607-608).
 *
 * The coordinator email/audit work-relative RAG must judge "remaining" against
 * genuinely CLAIMABLE work — not every non-terminal Strategic Directive. A
 * non-terminal SD does NOT "need a worker" when it is either:
 *   (a) an orchestrator PARENT (sd_type='orchestrator') — it auto-completes on its
 *       children and is never built directly by a worker; or
 *   (b) a dependency-BLOCKED child — at least one of its dependency blockers is not
 *       yet terminal (completed/cancelled/archived/deferred).
 * Counting those in `remaining` over-stated RED (false-RED on a healthy surplus belt
 * with transient parked workers).
 *
 * This module is the SINGLE SOURCE of the claimable predicate so coordinator-email-
 * summary.mjs and coordinator-audit.mjs cannot drift. The dependency resolution
 * mirrors coordinator-audit.mjs's existing blocked-vs-ready logic exactly.
 *
 * Pure / IO-free: callers fetch dependency statuses and inject them as a map.
 * CommonJS (.cjs) so both the .mjs coordinator scripts (via dynamic import) and the
 * .cjs unit tests (via createRequire) can load it.
 *
 * @module lib/coordinator/claimable-work
 */

'use strict';

/** A dependency blocker is "satisfied" when its status is terminal. Mirrors the
 *  TERMINAL set used in coordinator-email-summary.mjs and coordinator-audit.mjs. */
const TERMINAL_STATUSES = Object.freeze(['completed', 'cancelled', 'archived', 'deferred']);

/** @param {string} status @returns {boolean} */
function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Extract dependency blocker keys from an SD row. Tolerant of the three shapes the
 * `dependencies` JSONB can take ({sd_id}, {sd_key}, or a bare string) — identical to
 * coordinator-audit.mjs's depOf().
 * @param {object} sd - strategic_directives_v2 row (needs `dependencies`)
 * @returns {string[]}
 */
function parseDeps(sd) {
  const d = sd && sd.dependencies;
  if (!Array.isArray(d)) return [];
  // Only string keys survive: a malformed entry (e.g. {} with no sd_id/sd_key) is
  // dropped rather than mapped to a never-resolvable object key.
  return d.map((x) => x && (x.sd_id || x.sd_key || x)).filter((k) => typeof k === 'string' && k.length > 0);
}

/**
 * The distinct set of dependency keys referenced across a batch of SD rows — for a
 * single `.in('sd_key', dependencyKeys(rows))` status lookup.
 * @param {object[]} rows
 * @returns {string[]}
 */
function dependencyKeys(rows) {
  const set = new Set();
  for (const r of rows || []) for (const k of parseDeps(r)) set.add(k);
  return [...set];
}

/**
 * Is this non-terminal SD genuinely CLAIMABLE (i.e. it "needs a worker")?
 * False for orchestrator parents and for any SD with an unmet (non-terminal)
 * dependency. Unknown/unresolvable dependency keys are treated as UNMET (conservative,
 * matching coordinator-audit.mjs) so a row is never optimistically counted as claimable.
 * Pure: `depStatusByKey` is the injected {sd_key -> status} map for the SD's deps.
 *
 * @param {object} sd - strategic_directives_v2 row (needs `sd_type`, `dependencies`)
 * @param {Object<string,string>} [depStatusByKey] - status by dependency sd_key
 * @returns {boolean}
 */
function isClaimableSd(sd, depStatusByKey) {
  if (!sd) return false;
  if (sd.sd_type === 'orchestrator') return false;          // parent auto-completes on children
  const map = depStatusByKey || {};
  return parseDeps(sd).every((k) => isTerminalStatus(map[k]));
}

module.exports = {
  TERMINAL_STATUSES,
  isTerminalStatus,
  parseDeps,
  dependencyKeys,
  isClaimableSd,
};
