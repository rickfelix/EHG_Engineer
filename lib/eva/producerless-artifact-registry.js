// eva-logger-lint-ignore: pure Set.has() lookup, no I/O, no branches, no failure mode --
// nothing here is worth logging (see docs/reference/eva-logging-standard.md).
/**
 * Producerless artifact-type registry.
 * SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 (FR-4).
 *
 * Answers the open decision FR-4 flagged: "does this artifact_type have zero
 * automatic producers" as a queryable fact. Implemented as a hardcoded allowlist
 * (one of the two shapes the PRD names as acceptable) rather than a live
 * producer-registry scan -- only one concrete instance is known today, and an
 * allowlist fails safe: a wrong/missing entry just means a real gap escalates
 * normally to chairman_decisions instead of harness_backlog, never the reverse.
 *
 * launch_usage_signal: its sole producer (database/chairman-gated/
 * 20260826_venture_usage_events_rpc.sql) is a post-launch-only RPC insert -- usage
 * events can only exist AFTER a venture goes live, so this artifact_type can never
 * be satisfied by the time a pre-launch/launch-boundary gate checks for it. This is
 * a structural automation gap, not a venture-specific decision (chairman_decision
 * 906e19fa named it as the concrete ARTIFACT_MISSING case this FR addresses).
 */
const PRODUCERLESS_ARTIFACT_TYPES = new Set(['launch_usage_signal']);

/**
 * @param {string} artifactType
 * @returns {boolean}
 */
export function hasZeroAutomaticProducers(artifactType) {
  return PRODUCERLESS_ARTIFACT_TYPES.has(artifactType);
}

export { PRODUCERLESS_ARTIFACT_TYPES };
