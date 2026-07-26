/**
 * Shared frozen contract for completion-flag metadata keys.
 *
 * SD-LEO-INFRA-COMPLETION-FLAGS-DURABLE-001 / TR-2.
 *
 * Imported by BOTH the writer (scripts/capture-completion-flags.js) and the consumer
 * (scripts/hooks/stop-subagent-enforcement/post-completion-validator.js) so the metadata
 * keys cannot drift across files — a single source of truth defeats
 * PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (writer/consumer key drift makes the
 * enforcement gate a silent permanent no-op).
 *
 * Both consumers are ESM (`import`/`export`), so this is a single ESM module — no
 * CJS mirror is needed and there is exactly ONE literal source for every key.
 *
 * @module lib/governance/completion-flag-keys
 */

export const COMPLETION_FLAG = Object.freeze({
  ORIGIN_KEY: 'origin',
  ORIGIN_VALUE: 'completion_flag',
  SOURCE_SD_KEY: 'source_sd',
});

/**
 * QF-20260725-868 — the THIRD state of the completion-flags witness.
 *
 * The witness contract was two-valued: a reason STRING means "failed", null means "verified clean".
 * Its catch block also returned null, so a CRASHED witness was byte-indistinguishable from a passing
 * one — the mechanism built to prove the post-completion tail ran could not detect its own failure
 * to run. This sentinel gives "could-not-determine" a representation so the CONSUMER decides what to
 * do about it, mirroring pre-tool-enforce.cjs's `unknown` hash return.
 *
 * COORDINATOR DECISION (a59441f4), deliberately encoded here rather than left to a caller:
 * this state SURFACES, it NEVER BLOCKS. The validator is a WITNESS sitting in a Stop hook between
 * every worker and done — making it fail-closed would convert an OBSERVABILITY gap into an
 * AVAILABILITY outage, where one transient Supabase error wedges the whole fleet. The defect is that
 * a crash is indistinguishable from a pass, not that a crash fails to block.
 *
 * Lives beside the keys it guards so writer and consumer cannot drift on it either.
 */
export const WITNESS_INDETERMINATE = Object.freeze({
  /** Distinct, non-null, and NOT a reason string — callers must test identity, never truthiness. */
  STATE: 'could_not_determine',
  /** Stable feedback category so the rate is COUNTABLE, not merely logged. */
  FEEDBACK_CATEGORY: 'witness_indeterminate',
});

/** True only for the could-not-determine sentinel — never for a genuine reason string or null. */
export function isWitnessIndeterminate(v) {
  return v === WITNESS_INDETERMINATE.STATE;
}
