/**
 * Verify layer — completeness critic
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 3 (FR-006)
 *
 * Checks the whole SD tree AGAINST the vision: which vision capability (or persona
 * job) is covered by NO SD. This is what would have caught the DataDistill engine
 * being under-scoped — no per-section agent sees the whole-tree gap, only a critic
 * comparing the vision's capability list to the SDs that exist.
 *
 * Pure logic over a capability list + the SD tree, with a pluggable matcher (the
 * default is a deterministic token match; a live run can pass an LLM-backed
 * matcher for semantic coverage). Headlessly unit-testable.
 *
 * @module lib/eva/bridge/completeness-critic
 */

const MIN_TOKEN_LEN = 4;

/** Default matcher: a capability is covered by an SD if all its significant tokens appear in title+description. */
export function defaultMatcher(capability, sd) {
  const hay = `${(sd && sd.title) || ''} ${(sd && sd.description) || ''}`.toLowerCase();
  const tokens = String(capability || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= MIN_TOKEN_LEN);
  if (tokens.length === 0) return false;
  return tokens.every((t) => hay.includes(t));
}

/**
 * Return the vision capabilities that NO SD covers.
 * @param {string[]} capabilities - capability labels/keys expected from the vision
 * @param {Array<{title?:string, description?:string}>} sds - the SD tree
 * @param {(capability:string, sd:object)=>boolean} [matcher=defaultMatcher]
 * @returns {string[]} the uncovered capabilities (subset of `capabilities`, order preserved)
 */
export function findUncoveredCapabilities(capabilities = [], sds = [], matcher = defaultMatcher) {
  const list = Array.isArray(capabilities) ? capabilities : [];
  const tree = Array.isArray(sds) ? sds : [];
  return list.filter((cap) => !tree.some((sd) => matcher(cap, sd)));
}

/**
 * Assess whole-tree completeness against the vision capability list.
 * @returns {{complete:boolean, uncovered:string[], coverage:number}}
 */
export function assessCompleteness(capabilities = [], sds = [], matcher = defaultMatcher) {
  const list = Array.isArray(capabilities) ? capabilities : [];
  const uncovered = findUncoveredCapabilities(list, sds, matcher);
  return {
    complete: uncovered.length === 0,
    uncovered,
    coverage: list.length ? (list.length - uncovered.length) / list.length : 1,
  };
}
