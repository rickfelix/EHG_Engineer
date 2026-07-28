/**
 * Pre-claim DEPENDENCY gate — pure decision logic.
 * SD-FDBK-INFRA-DEPENDENCY-BLOCKS-ADVISORY-001
 *
 * Dependency BLOCKS were advisory-only: the sweep/dashboard computed and
 * displayed BLOCKED, but sd-start.js never enforced it, so workers repeatedly
 * claimed dependency-blocked child SDs. This converts the advisory BLOCK into an
 * enforced one at claim time: refuse the claim when a declared dependency SD is
 * not yet 'completed', with a --force warn-and-proceed override.
 *
 * Kept as a pure function (no DB/IO) so it is unit-testable without a live claim.
 */

/** A dependency is satisfied iff its referenced SD has reached this status. */
export const SATISFIED_STATUS = 'completed';

/**
 * Decide whether a claim may proceed given the resolved statuses of an SD's
 * declared dependencies.
 *
 * @param {Array<{sd_id: string, status: string|null}>} resolved
 *   One entry per declared dependency. `status` is the referenced SD's current
 *   status, or null when the reference could not be resolved.
 * @param {{force?: boolean}} [opts]
 * @returns {{verdict: 'proceed'|'refuse', blocking: Array, unresolved: Array, warn: boolean}}
 */
export function evaluateDependencyGate(resolved, opts = {}) {
  const list = Array.isArray(resolved) ? resolved : [];
  const force = Boolean(opts.force);

  // Confirmed-incomplete dependencies: resolved to a real, non-completed status.
  const incomplete = list.filter(d => d && d.status && d.status !== SATISFIED_STATUS);
  // QF-20260727-251: an incomplete dependency whose RELATION constrains part of the work
  // (blocks_objective_N, sequence_after_for_X, land_before_X, overlaps_X) does not block the
  // CLAIM. Classified upstream in lib/claim/gates/dependency-gate.cjs so both callers partition
  // from one source. `!== false` is deliberate: an entry without the field — an older caller, a
  // hand-built fixture — keeps today's blocking behaviour, so the permissive path is reachable
  // only by an explicit, recognised classification.
  const blocking = incomplete.filter(d => d.claimBlocking !== false);
  const scopeConstrained = incomplete.filter(d => d.claimBlocking === false);
  // Unresolvable references (deleted / typo'd): surfaced as a warning, never a
  // hard block — blocking on a bad reference would strand the SD forever.
  const unresolved = list.filter(d => d && !d.status);

  if (blocking.length === 0) {
    // A scope-constrained dep permits the claim but must never do so SILENTLY: an unexplained
    // permit is the same ambiguity as an unexplained refusal, one level down.
    return {
      verdict: 'proceed', blocking, scopeConstrained, unresolved,
      warn: unresolved.length > 0 || scopeConstrained.length > 0,
    };
  }
  if (force) {
    return { verdict: 'proceed', blocking, scopeConstrained, unresolved, warn: true };
  }
  return { verdict: 'refuse', blocking, scopeConstrained, unresolved, warn: false };
}

/**
 * Human-readable body for dependencies that constrain PART of the work but permit the claim.
 * Names the relation so the reader knows what is constrained, not merely that something is.
 * @param {Array<{sd_id: string, status: string|null, relation: string|null}>} scopeConstrained
 * @returns {string}
 */
export function formatScopeConstraints(scopeConstrained = []) {
  return scopeConstrained
    .map(d => `  • ${d.sd_id} — status='${d.status}', relation='${d.relation}' (constrains this scope, does NOT block the claim)`)
    .join('\n');
}

/**
 * Human-readable body listing the offending dependencies (one per line).
 * @param {Array<{sd_id: string, status: string|null}>} blocking
 * @param {Array<{sd_id: string, status: string|null}>} unresolved
 * @returns {string}
 */
export function formatDependencyRefusal(blocking = [], unresolved = []) {
  const lines = [];
  for (const d of blocking) lines.push(`  • ${d.sd_id} — status='${d.status}' (not completed)`);
  // QF-20260727-168: the old text asserted "could not resolve (deleted or typo?)" — a
  // DIAGNOSIS the gate is not entitled to make. It sent readers hunting a data-integrity bug
  // that did not exist: all three refs on the reporting SD were present in quick_fixes, and
  // the gate simply had not looked in that table. A gate that cannot see a table must report
  // WHERE IT LOOKED, not claim absence everywhere. State the searched scope and let the
  // reader draw the conclusion; deletion and typo are now offered as possibilities, not facts.
  for (const d of unresolved) {
    lines.push(`  • ${d.sd_id} — matched no strategic_directives_v2.sd_key/id and no quick_fixes.id (deleted, mistyped, or not yet created)`);
  }
  return lines.join('\n');
}
