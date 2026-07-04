/**
 * Pure detection patterns for scripts/lint/diagnostic-gauge-citation-lint.mjs.
 * SD-LEO-INFRA-REWARD-SPINE-ONE-001-C.
 *
 * Split into its own module (no fs/git/process side effects) so tests can exercise the exact
 * regexes the CLI uses, without re-implementing them and risking silent drift.
 */

// Numeric comparison against a quality_score-shaped identifier (retrospectives.quality_score /
// feedback.quality_score — both are the process-proxy signal THE RULE names).
export const QUALITY_SCORE_RE = /[\w.?]*quality_score\s*(?:>=|<=|>|<|===|==)\s*\d/;

// Numeric comparison against a compound adherence/gate pass-rate identifier. Deliberately NOT a
// bare `pass_rate`/`passRate` match — a --all sweep during PLAN research found that word used
// for dozens of unrelated domain concepts (test-runner pass rates, venture QA-stage metrics)
// that have nothing to do with THE RULE's named "adherence-probe pass-rate" / "raw LEO gate
// pass-rate" signals. Requiring "adherence" or "gate" in the same identifier chain keeps this
// targeted, not a noisy blanket match that would make the lint ignorable.
export const ADHERENCE_OR_GATE_PASS_RATE_RE = /(?:adherence|gate)[\w.]*(?:pass_rate|passRate)\s*(?:>=|<=|>|<|===|==)\s*\d/i;

export const CITATION_RE = new RegExp(`(?:${QUALITY_SCORE_RE.source})|(?:${ADHERENCE_OR_GATE_PASS_RATE_RE.source})`);
