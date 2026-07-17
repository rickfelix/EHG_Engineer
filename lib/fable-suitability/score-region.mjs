/**
 * score-region.mjs — compose the three axes into a scored region row + child-A evidence jsonb.
 * SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-B (FR-5).
 *
 * Orchestrates score-impact (deterministic) + score-opportunity (deterministic) + score-reasoning-depth
 * (LLM, injected) under a duty-cluster family, then computes:
 *
 *   composite = axis_impact * axis_opportunity * axis_reasoning_depth
 *
 * MULTIPLICATIVE by design — this IS the anti-gaming floor (RISK R1). Because the product collapses
 * when any deterministic axis is low, a maxed-out LLM reasoning-depth alone can never float a region
 * whose structural impact/opportunity are low (5*1*1 = 5, a low band). The LLM axis can only AMPLIFY
 * a region the deterministic signals already rank highly.
 *
 * The emitted evidence matches child A's documented shape EXACTLY and is validated through child A's
 * validateEvidence before return, so a drift in either contract fails loud here rather than at write.
 * This module is PURE: it returns the scored row; it does NOT persist (child A's map-writer) and does
 * NOT fan out over the codebase (child C).
 */
import { scoreImpact } from './score-impact.mjs';
import { scoreOpportunity } from './score-opportunity.mjs';
import { scoreReasoningDepth } from './score-reasoning-depth.mjs';
import { validateEvidence, EVIDENCE_SCHEMA_VERSION } from './map-writer.mjs';

/**
 * @param {object} region  { region_key, repo, summary? }
 * @param {object} signals { impact:{centrality,fanOut,crossRepoCount}, opportunity:{...}, reasoning:{blastRadius,lookAhead} }
 * @param {object} opts    { dutyCluster, client (for reasoning-depth), scoredBy, computedAt }
 * @returns {Promise<{row:object, evidence:object}>} row is ready for child A upsertRegionScore
 */
export async function scoreRegion(region = {}, signals = {}, opts = {}) {
  const { dutyCluster, client, scoredBy = 'fable-scoring-engine', computedAt } = opts;
  if (!region.region_key) throw new Error('scoreRegion: region.region_key is required');
  if (!region.repo) throw new Error('scoreRegion: region.repo is required');

  const impact = scoreImpact(signals.impact || {}, dutyCluster);
  const opportunity = scoreOpportunity(signals.opportunity || {}, dutyCluster);
  const reasoning = await scoreReasoningDepth(region, signals.reasoning || {}, { client, dutyCluster });

  // Anti-gaming floor: multiplicative composite.
  const composite = impact.score * opportunity.score * reasoning.score;

  const evidence = {
    evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
    axes: {
      impact: { score: impact.score, inputs: impact.inputs, rationale: impact.rationale },
      opportunity: { score: opportunity.score, inputs: opportunity.inputs, rationale: opportunity.rationale },
      reasoning_depth: { score: reasoning.score, inputs: reasoning.inputs, rationale: reasoning.rationale },
    },
    recurrence: {
      weight: opportunity.recurrenceWeight,
      count: opportunity.inputs.realPatternCount,
      source_ids: opportunity.sourceIds,
    },
    scored_by: scoredBy,
    computed_at: computedAt || new Date().toISOString(),
  };

  // Fail loud if either contract drifted (child A owns the canonical shape validator).
  validateEvidence(evidence);

  const row = {
    region_key: region.region_key,
    repo: region.repo,
    duty_cluster: dutyCluster,
    axis_impact: impact.score,
    axis_opportunity: opportunity.score,
    axis_reasoning_depth: reasoning.score,
    composite_score: composite,
    recurrence_weight: opportunity.recurrenceWeight,
    evidence,
    reasoning_degraded: reasoning.degraded,
  };

  return { row, evidence };
}
