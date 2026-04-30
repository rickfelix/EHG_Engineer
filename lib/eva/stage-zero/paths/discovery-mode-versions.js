/**
 * Single-source-of-truth prompt-version constants for Stage Zero discovery-mode strategies.
 *
 * Bumped deliberately when a strategy's LLM prompt changes meaningfully.
 * Used by:
 *  - runTrendScanner (stamps metadata.prompt_version on candidate output)
 *  - chairman-review.persistVentureBrief (writes metadata.stage_zero.origin_metadata.prompt_version)
 *  - useStageZeroQueue (adds metadata.prompt_version_hint to queue inserts)
 *  - stage-zero-queue-processor (surfaces in result payload)
 *  - get_discovery_strategy_scores RPC (groups by COALESCE(prompt_version, 'v1-pre-versioning'))
 *
 * Version format: 'YYYY-MM-DD-vN'. Hashes are NOT used — they change on whitespace edits
 * and are unreadable in score history. A human-curated string bumps deliberately.
 */

export const TREND_SCANNER_PROMPT_VERSION = '2026-04-28-v2';

/**
 * Sentinel surfaced by the get_discovery_strategy_scores RPC's COALESCE default
 * for legacy ventures that pre-date prompt versioning (prompt_version IS NULL).
 */
export const LEGACY_PROMPT_VERSION_SENTINEL = 'v1-pre-versioning';
