/**
 * QF-20260727-876: shared predicate for recognizing a deliberate stacked-PR landing
 * (N sibling PRs for the same SD, all independently based on the target branch) so
 * ship-preflight's Branch Verification and Multi-Repo Coordination checks can report
 * them as CONTEXT instead of BLOCKED. A single PR (N===1) is unchanged/still
 * blocking -- that is indistinguishable from one genuinely forgotten branch, which
 * both checks must keep catching.
 *
 * @module shipping/stack-landing-detector
 */

/**
 * @param {Array<string|null|undefined>} baseRefNames - baseRefName of each still-open PR
 *   matching one SD's branch patterns.
 * @param {{ targetBase?: string }} [opts]
 * @returns {boolean} true when this is a deliberate multi-part landing, not orphaned work.
 */
export function isStackedLanding(baseRefNames, { targetBase = 'main' } = {}) {
  return baseRefNames.length > 1 && baseRefNames.every((b) => b === targetBase);
}

export default isStackedLanding;
