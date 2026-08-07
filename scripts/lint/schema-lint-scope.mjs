/**
 * Pure scope/baseline helpers for the schema-reference lint.
 * QF-20260802-742.
 *
 * THE FAILURE THIS ENCODES: the lint blocked PR #6738 on 33 violations with ZERO in its own
 * 12-file diff, and its scan scope drifted 79 -> 140 files across two runs 24 minutes apart with
 * the violation count pinned. Two independent mechanisms, both of which produce violations the
 * PR did not introduce:
 *
 *   1. SCOPE INFLATION — the file set unioned staged + working-tree + untracked files on the
 *      stated assumption that "the latter two are empty in CI". They are not: CI checkout
 *      renormalises line endings, so every CRLF-affected file appears as an unstaged
 *      modification and joins the PR's scope (measured: a 5-file diff -> a 33-file checked set).
 *
 *   2. BACKLOG INHERITANCE — violations were counted per FILE. main carries ~378 violations in
 *      --all mode, so any PR touching an affected file inherited that file's old violations as
 *      its own. The class fires on BRANCH AGE and on which files you happened to touch, not on
 *      anything the author did.
 *
 * partitionViolations() fixes (2) and, as a side effect, disarms (1): a merely renormalised file
 * has byte-identical violations at both ends, so every one of them classifies as pre-existing.
 *
 * Kept pure (no fs, no git, no DB) so both polarities are testable from fixtures — the lint's own
 * exit helper (schema-lint-exit.mjs) established this shape.
 */

/**
 * Identity of a violation for baseline comparison.
 *
 * DELIBERATELY EXCLUDES `line`. A violation that merely shifted because unrelated code was
 * inserted above it is the SAME violation. Keying on line would re-classify every pre-existing
 * violation as new the moment a PR touches the file — which is precisely the punish-the-toucher
 * behaviour this QF removes, reintroduced through the back door.
 *
 * @param {{file:string,type:string,table:string,column?:string,kind:string}} v
 * @returns {string}
 */
export function violationKey(v) {
  return `${v.file}|${v.type}|${v.table}|${v.column || ''}|${v.kind}`;
}

/**
 * Split violations found at HEAD into NEW drift (blocks) and pre-existing (reports only).
 *
 * @param {Array<object>} violations — violations found in the current working copy
 * @param {Set<string>|null} baselineKeys — violationKey()s present at the merge base.
 *        `null` means NO BASELINE IS AVAILABLE (an --all sweep, or a degraded --diff whose base
 *        could not be resolved). In that case nothing can be proven pre-existing, so every
 *        violation is returned as new and the caller's existing degraded/advisory rules decide
 *        whether that blocks. Treating an absent baseline as "everything is pre-existing" would
 *        silently disable the lint on exactly the runs that already lost their footing.
 * @returns {{newViolations:Array<object>, preExisting:Array<object>}}
 */
export function partitionViolations(violations, baselineKeys) {
  const newViolations = [];
  const preExisting = [];
  for (const v of violations || []) {
    if (baselineKeys && baselineKeys.has(violationKey(v))) preExisting.push(v);
    else newViolations.push(v);
  }
  return { newViolations, preExisting };
}
