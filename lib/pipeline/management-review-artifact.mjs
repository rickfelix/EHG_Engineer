/**
 * Pure builder for the management_reviews upsert artifact.
 * SD-LEO-FEAT-PRE-EXISTING-BUG-001.
 *
 * Pre-existing bug: scripts/pipeline/management-review-generator.js wrote a `capability_gaps` field into
 * the management_reviews upsert, but that column does NOT exist in the live schema — so every live run
 * failed with a PostgREST 42703 ("column does not exist") and the generator was non-functional. No code
 * reads management_reviews.capability_gaps, so the correct minimal fix is to STOP writing it (not add a
 * dead column). The gap data is still computed and surfaced in the console summary + the narrative.
 *
 * Extracting the payload construction into a pure function makes it unit-testable without a DB or running
 * the CLI, and the exported column allowlist guards against re-introducing a non-existent column.
 */

/**
 * The real columns of the live `management_reviews` table (writable subset the generator targets).
 * A key not in this set is a non-existent column and must never be written.
 */
export const MANAGEMENT_REVIEWS_COLUMNS = Object.freeze([
  'review_date',
  'review_type',
  'baseline_version_from',
  'baseline_version_to',
  'planned_capabilities',
  'actual_capabilities',
  'planned_ventures',
  'actual_ventures',
  'planned_sds',
  'actual_sds',
  'okr_snapshot',
  'risk_snapshot',
  'strategy_health',
  'decisions',
  'actions',
  'pipeline_snapshot',
  'eva_narrative',
  'eva_proposals',
  'chairman_notes',
  'chairman_approved_proposals',
  'overall_score',
]);

/**
 * PURE: build the management_reviews upsert payload from the gathered data.
 * Writes ONLY real columns — notably it does NOT write `capability_gaps` (the non-existent column that
 * 42703-errored the upsert). `reviewDate` is injected so the function stays deterministic for tests.
 *
 * @param {object} parts
 *   reviewDate    - YYYY-MM-DD string (injected; caller passes new Date().toISOString().split('T')[0])
 *   baselineData  - { version?, totalItems? }
 *   sdData        - { completed }
 *   ventureData   - { activeCount, ventures: [{stage}] }
 *   okrData       - { snapshot }
 *   riskData      - { hasForecasts } (+ the forecast object itself when hasForecasts)
 *   pipelineData  - any (pipeline snapshot)
 *   narrative     - string
 * @returns {object} the review row (real columns only)
 */
export function buildReviewArtifact(parts = {}) {
  const {
    reviewDate,
    baselineData = {},
    sdData = {},
    ventureData = {},
    okrData = {},
    riskData = {},
    pipelineData = null,
    narrative = null,
  } = parts;

  const ventures = Array.isArray(ventureData.ventures) ? ventureData.ventures : [];

  return {
    review_date: reviewDate,
    review_type: 'weekly',
    baseline_version_from: baselineData.version || 1,
    baseline_version_to: baselineData.version || 1,
    planned_sds: baselineData.totalItems || 0,
    actual_sds: sdData.completed,
    planned_ventures: ventureData.activeCount,
    actual_ventures: ventures.filter((v) => v.stage >= 5).length,
    okr_snapshot: okrData.snapshot,
    risk_snapshot: riskData.hasForecasts ? riskData : null,
    // capability_gaps intentionally OMITTED — the column does not exist in management_reviews (42703) and
    // nothing reads it. Gap data remains in the console summary + the narrative. (SD-LEO-FEAT-PRE-EXISTING-BUG-001)
    strategy_health: null,
    pipeline_snapshot: pipelineData,
    eva_narrative: narrative,
    eva_proposals: null,
  };
}

export default { MANAGEMENT_REVIEWS_COLUMNS, buildReviewArtifact };
