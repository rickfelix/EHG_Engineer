/**
 * Stage 0 Synthesis Engine
 *
 * Runs all 9 synthesis components on a PathOutput to enrich it
 * before chairman review. Optionally applies an evaluation profile
 * for weighted scoring.
 *
 * Child F components (1-3):
 * 1. Cross-Reference Intellectual Capital + Outcome History
 * 2. Portfolio-Aware Evaluation
 * 3. Active Problem Reframing
 *
 * Child G components (4-6):
 * 4. Moat Architecture
 * 5. Chairman Constraints
 * 6. Time-Horizon Positioning
 *
 * Child H components (7-8):
 * 7. Venture Archetype Recognition
 * 8. Build Cost Estimation
 *
 * Component 9 (SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-A):
 * 9. Virality Analysis
 *
 * Component 10 (SD-EVA-FEAT-DESIGN-PERSONA-001):
 * 10. Design Evaluation
 *
 * Component 11 (SD-LEO-FIX-BRAINSTORM-NARRATIVE-RISK-001):
 * 11. Narrative Risk Analysis (advisory signal — not in weighted composite)
 *
 * Component 12 (SD-LEO-FEAT-TECHNOLOGY-TRAJECTORY-MODEL-001):
 * 12. Technology Trajectory Model (advisory weight 0.05 in weighted composite)
 *
 * Component 13 (SD-LEO-FEAT-ATTENTION-CAPITAL-SYNTHESIS-001):
 * 13. Attention Capital Analysis (advisory signal — not in weighted composite)
 *
 * Component 14 (SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001):
 * 14. Mental Model Analysis (advisory signal — not in weighted composite)
 *
 * Profile System (SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-B):
 * - Resolves evaluation profile (explicit, active, or legacy defaults)
 * - Calculates weighted venture score from component results
 * - Includes profile metadata + weighted breakdown in output
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-F/G/H
 */

import { crossReferenceIntellectualCapital } from './cross-reference.js';
import { evaluatePortfolioFit } from './portfolio-evaluation.js';
import { reframeProblem } from './problem-reframing.js';
import { designMoat } from './moat-architecture.js';
import { applyChairmanConstraints } from './chairman-constraints.js';
import { assessTimeHorizon } from './time-horizon.js';
import { classifyArchetype } from './archetypes.js';
import { estimateBuildCost } from './build-cost-estimation.js';
import { analyzeVirality } from './virality.js';
import { evaluateDesignPotential } from './design-evaluation.js';
import { analyzeNarrativeRisk } from './narrative-risk.js';
import { analyzeTechTrajectory } from './tech-trajectory.js';
import { analyzeAttentionCapital } from './attention-capital.js';
import { analyzeAgenticFit } from './agentic-fit.js';
import { runMentalModelAnalysis } from './mental-model-analysis.js';
import { resolveProfile, calculateWeightedScore } from '../profile-service.js';
// SD-LEO-INFRA-STAGE0-THESIS-CONTRACT-001: thesis/kills/decisions contract producers.
import { buildThesisFromSynthesis, deriveDefaultKillCriteria, buildExplicitDecisions, THESIS_CORE_FIELDS } from '../thesis-contract.js';

/**
 * Run all 14 synthesis components on a PathOutput.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @param {string} [deps.profileId] - Explicit evaluation profile UUID
 * @returns {Promise<Object>} Enriched venture brief with synthesis results
 */
export async function runSynthesis(pathOutput, deps = {}) {
  const { logger = console, profileId } = deps;

  logger.log('   Running synthesis engine (14/14 components)...');

  // Resolve evaluation profile (parallel with component execution).
  // SD-LEO-INFRA-STAGE0-POSTURE-SUCCESSOR-001 (CH-2): NO catch-to-null — profile
  // resolution fails closed and the synthesis run fails loudly with it. Scoring a
  // venture without governed weights was the second fail-open scorer's escape hatch.
  const profilePromise = resolveProfile(deps, profileId);

  // Run all 10 components - grouped by dependency
  // Group 1 (no inter-dependencies): components 1-4, 6-10
  // Group 2 (depends on nothing but run separately): component 5 (chairman constraints)
  const [crossRef, portfolio, reframing, moat, timeHorizon, archetype, buildCost, virality, design, narrativeRisk, techTrajectory, attentionCapital, agenticFit, mentalModelAnalysis] = await Promise.all([
    crossReferenceIntellectualCapital(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Cross-reference failed: ${err.message}`);
      return { component: 'cross_reference', matches: [], lessons: [], relevance_score: 0, summary: `Failed: ${err.message}`, _failed: true };
    }),
    evaluatePortfolioFit(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Portfolio evaluation failed: ${err.message}`);
      return { component: 'portfolio_evaluation', dimensions: {}, composite_score: 0, summary: `Failed: ${err.message}`, _failed: true };
    }),
    reframeProblem(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Problem reframing failed: ${err.message}`);
      return { component: 'problem_reframing', reframings: [], summary: `Failed: ${err.message}`, _failed: true };
    }),
    designMoat(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Moat design failed: ${err.message}`);
      return { component: 'moat_architecture', primary_moat: null, secondary_moats: [], moat_score: 0, summary: `Failed: ${err.message}`, _failed: true };
    }),
    assessTimeHorizon(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Time-horizon assessment failed: ${err.message}`);
      return { component: 'time_horizon', position: 'build_now', confidence: 0, summary: `Failed: ${err.message}`, _failed: true };
    }),
    classifyArchetype(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Archetype classification failed: ${err.message}`);
      return { component: 'archetypes', primary_archetype: 'automator', primary_confidence: 0, summary: `Failed: ${err.message}`, _failed: true };
    }),
    estimateBuildCost(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Build cost estimation failed: ${err.message}`);
      return { component: 'build_cost', complexity: 'moderate', summary: `Failed: ${err.message}`, _failed: true };
    }),
    analyzeVirality(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Virality analysis failed: ${err.message}`);
      return { component: 'virality_analysis', virality_score: 0, k_factor: 0, cycle_time_days: 0, mechanic_type: 'word_of_mouth', channel_fit: 0, shareability: 0, decay_rate: 0, organic_ratio: 0, growth_loops: [], viral_channels: [], compounding_factors: '', risks: [], summary: `Failed: ${err.message}`, _failed: true };
    }),
    evaluateDesignPotential(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Design evaluation failed: ${err.message}`);
      return { component: 'design_evaluation', dimensions: { ux_simplicity: 0, design_differentiation: 0, adoption_friction: 0, design_scalability: 0, aesthetic_moat: 0 }, composite_score: 0, design_risks: [], design_opportunities: [], recommendation: 'design_minimal', summary: `Failed: ${err.message}`, _failed: true };
    }),
    analyzeNarrativeRisk(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Narrative risk analysis failed: ${err.message}`);
      return { component: 'narrative_risk', nr_score: 0, nr_band: 'NR-Unknown', nr_interpretation: 'Analysis unavailable', component_scores: { decision_sensitivity: 0, demand_distortion: 0, hype_persistence: 0, influence_exposure: 0 }, narrative_flags: [], confidence: 0, confidence_caveat: 'Analysis failed.', summary: `Failed: ${err.message}`, _failed: true };
    }),
    analyzeTechTrajectory(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Technology trajectory analysis failed: ${err.message}`);
      return { component: 'tech_trajectory', trajectory_score: 0, axes: { reasoning_autonomy: { current: 0, bull_6m: 0, base_6m: 0, bear_6m: 0, venture_impact: '' }, cost_deflation: { current: 0, bull_6m: 0, base_6m: 0, bear_6m: 0, venture_impact: '' }, multimodal_expansion: { current: 0, bull_6m: 0, base_6m: 0, bear_6m: 0, venture_impact: '' } }, competitive_timing: { signal: 'contested', confidence: 0, window_months: 0, rationale: '' }, next_disruption_event: { event: 'Unknown', estimated_months: 0, invalidation_scope: 'Unknown' }, gap_windows: [], confidence_caveat: 'Analysis failed.', summary: `Failed: ${err.message}`, data_feed_active: false, _failed: true };
    }),
    analyzeAttentionCapital(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Attention capital analysis failed: ${err.message}`);
      return { component: 'attention_capital', ac_score: 0, ac_band: 'AC-Unknown', ac_interpretation: 'Analysis unavailable', component_scores: { organic_search_momentum: 0, engagement_depth: 0, earned_media_ratio: 0, advocacy_signal: 0, return_engagement: 0 }, confidence: 0, confidence_caveat: 'Analysis failed.', summary: `Failed: ${err.message}`, _failed: true };
    }),
    // SD-EHG-FACTORY-AGENTIC-FIT-SELECTION-001: agentic-fit lens (weighted Stage-0 component + S3 advisory)
    analyzeAgenticFit(pathOutput, deps).catch(err => {
      logger.warn(`   Warning: Agentic-fit analysis failed: ${err.message}`);
      return { component: 'agentic_fit', agentic_fit_score: 0, fit_composite: 0, queue_jump_score: 0, dimension_scores: { agent_leverage: 0, compounding: 0, kill_speed: 0, attention_economy: 0 }, machine_improvement: 0, machine_improvement_bonus: 0, disadvantage_flags: [], disadvantage_down_weight: 1, hardest_disadvantage_flags: [], chairman_review_required: false, af_band: 'AF-Unknown', af_interpretation: 'Analysis unavailable', confidence: 0, confidence_caveat: 'Analysis failed.', summary: `Failed: ${err.message}`, _failed: true };
    }),
    runMentalModelAnalysis({
      venture: pathOutput,
      stage: 0,
      path: pathOutput.metadata?.path,
      strategy: pathOutput.discovery_strategy,
      archetype: pathOutput.metadata?.synthesis?.archetypes?.primary_archetype,
    }, deps).catch(err => {
      logger.warn(`   Warning: Mental model analysis failed: ${err.message}`);
      return null;
    }),
  ]);

  // Chairman constraints run after others (uses pathOutput directly, no inter-dependency)
  const constraints = await applyChairmanConstraints(pathOutput, deps).catch(err => {
    logger.warn(`   Warning: Chairman constraints failed: ${err.message}`);
    return { component: 'chairman_constraints', verdict: 'review', score: 0, summary: `Failed: ${err.message}`, _failed: true };
  });

  // Await profile resolution
  const profile = await profilePromise;

  // Calculate weighted score if profile is available
  // Note: narrative_risk is advisory only — excluded from weighted composite
  const synthesisResults = {
    cross_reference: crossRef,
    portfolio_evaluation: portfolio,
    problem_reframing: reframing,
    moat_architecture: moat,
    chairman_constraints: constraints,
    time_horizon: timeHorizon,
    archetypes: archetype,
    build_cost: buildCost,
    virality: virality,
    design_evaluation: design,
    tech_trajectory: techTrajectory,
    // SD-EHG-FACTORY-AGENTIC-FIT-SELECTION-001 (FR-4 primary): weighted Stage-0 component
    agentic_fit: agenticFit,
  };

  let profileMetadata = null;
  let weightedScore = null;

  if (profile) {
    const scoreResult = calculateWeightedScore(synthesisResults, profile.weights);
    weightedScore = scoreResult;
    profileMetadata = {
      name: profile.name,
      version: profile.version,
      source: profile.source,
      weights_used: profile.weights,
    };
    logger.log(`   Profile: ${profile.name} v${profile.version} (${profile.source}) → weighted score: ${scoreResult.total_score}/100`);
  }

  // Aggregate token usage from all components
  const componentUsages = [crossRef, portfolio, reframing, moat, timeHorizon, archetype, buildCost, virality, design, narrativeRisk, techTrajectory, attentionCapital, agenticFit, mentalModelAnalysis]
    .filter(c => c != null)
    .map(c => c.usage)
    .filter(Boolean);
  const usage = componentUsages.length > 0 ? {
    inputTokens: componentUsages.reduce((sum, u) => sum + (u.inputTokens || 0), 0),
    outputTokens: componentUsages.reduce((sum, u) => sum + (u.outputTokens || 0), 0),
  } : null;

  logger.log(`   Synthesis complete: cross-ref=${crossRef?.relevance_score || 0}, portfolio=${portfolio?.composite_score || 0}, reframings=${(reframing?.reframings || []).length}, moat=${moat?.moat_score || 0}, constraints=${constraints?.verdict || 'unknown'}, horizon=${timeHorizon?.position || 'unknown'}, archetype=${archetype?.primary_archetype || 'unknown'}, cost=${buildCost?.complexity || 'unknown'}, virality=${virality?.virality_score || 0}, design=${design?.composite_score || 0}, narrative_risk=${narrativeRisk?.nr_score || 0} (${narrativeRisk?.nr_band || 'unknown'}), tech_trajectory=${techTrajectory?.trajectory_score || 0} (${techTrajectory?.competitive_timing?.signal || 'unknown'}), attention_capital=${attentionCapital?.ac_score || 0} (${attentionCapital?.ac_band || 'unknown'})`);

  // Build enriched brief
  const recommendedProblem = reframing?.recommended_framing?.framing || pathOutput.suggested_problem;

  // SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001 (FR-2): components_run/components_total are
  // computed from the actual 15 synthesis outcomes (14 Promise.all results + chairman_constraints),
  // never a hardcoded stamp. mentalModelAnalysis fails to null (its own pre-existing signal,
  // distinct from the other 14's zeroed-object fallback) rather than a `_failed` marker.
  const allComponentResults = [crossRef, portfolio, reframing, moat, timeHorizon, archetype, buildCost, virality, design, narrativeRisk, techTrajectory, attentionCapital, agenticFit, mentalModelAnalysis, constraints];
  const componentsTotal = allComponentResults.length;
  const failedCount = allComponentResults.filter(c => c === null || c?._failed === true).length;
  const componentsRun = componentsTotal - failedCount;

  // SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001 (FR-3): fail-closed maturity — a run with ANY
  // failed component can never emit 'ready' (the weakest-link policy). mentalModelAnalysis is
  // EXCLUDED from this gate (though still counted in the componentsRun gauge above): its null
  // return is ambiguous by pre-existing design (analyzeMentalModels resolves null both on a
  // genuinely thrown error AND on the ordinary, non-error outcome "no curated model matched this
  // venture's stage/path/archetype" — lib/eva/mental-models/index.js:77) and it is already
  // documented as advisory-only, excluded from the weighted composite (see synthesisResults
  // above). Gating on an ambiguous signal would false-block healthy ventures whenever the
  // (finite, curated) model repository simply has nothing applicable to say — the inverse of the
  // bug this SD fixes. Pre-existing branches (constraints verdict==='fail', park_and_build_later)
  // are unchanged and still take precedence. Round-2 adversarial review: the exclusion is built
  // as a SEPARATE array that structurally omits mentalModelAnalysis, not a `c !== mentalModelAnalysis`
  // filter over allComponentResults — the latter compares against the primitive `null` by VALUE,
  // not by array-slot identity, so it would silently (and incorrectly) exclude ANY other component
  // that ever legitimately resolved to null too, not just this one. No other component can today,
  // but this construction makes that a structural guarantee rather than an implicit, untested one.
  const gatingComponents = [crossRef, portfolio, reframing, moat, timeHorizon, archetype, buildCost, virality, design, narrativeRisk, techTrajectory, attentionCapital, agenticFit, constraints];
  const gatingFailedCount = gatingComponents.filter(c => c === null || c?._failed === true).length;
  const anyComponentFailed = gatingFailedCount > 0;

  // SD-LEO-INFRA-STAGE0-THESIS-CONTRACT-001 (spec R3+R5): the brief is a falsifiable
  // THESIS with pre-registered kills and named decisions, not a bare score. Derivation is
  // deterministic from fields the candidate/synthesis already carries (per-field
  // provenance; nothing invented — missing sources are DECLARED in incomplete_fields).
  // Candidate resolution uses the PRODUCTION shapes: discovery-mode emits
  // raw_material.top_candidate (paths/discovery-mode.js); competitor-teardown/blueprint
  // paths carry no revenue-shaped candidate (their soft thesis fields stay honestly
  // incomplete). NO pathOutput fallback — that shape never carries candidate fields and
  // masked the real derivation gap (adversarial round-1 of PR #5809, CRITICAL).
  const candidate = pathOutput.raw_material?.top_candidate || pathOutput.raw_material?.candidate || pathOutput.metadata?.candidate || {};
  const thesis = buildThesisFromSynthesis(pathOutput, synthesisResults, candidate);
  const killCriteria = deriveDefaultKillCriteria(thesis);
  const explicitDecisions = buildExplicitDecisions(pathOutput.metadata?.decision_overrides || {});

  // Maturity: ENGINE-FAIL-CLOSED-001's weakest-link gate takes precedence (blocked on any
  // failed gating component), then the pre-existing branches, then THESIS-CONTRACT-001's
  // demotion. Only a CORE-incomplete thesis (cannot state who pays for what / no testable
  // plan) demotes 'ready' -> 'seed'. SOFT fields (price_point, reached_how) missing are
  // recorded honestly but do NOT park the venture — the demand-test plan is exactly the
  // instrument that refines them (round-1 CRITICAL of PR #5809: demoting on soft fields
  // would have nursery-parked every competitor-teardown/blueprint venture).
  const coreIncomplete = thesis.incomplete_fields.filter((f) => THESIS_CORE_FIELDS.includes(f));
  const baseMaturity = constraints?.verdict === 'fail' ? 'blocked'
    : anyComponentFailed ? 'blocked'
    : timeHorizon?.position === 'park_and_build_later' ? 'nursery'
    : 'ready';
  const maturity = baseMaturity === 'ready' && coreIncomplete.length > 0 ? 'seed' : baseMaturity;
  if (thesis.incomplete_fields.length > 0) {
    logger.log(`   Thesis incomplete (${thesis.incomplete_fields.join(', ')}; core: ${coreIncomplete.length ? coreIncomplete.join(', ') : 'none'}) — maturity ${coreIncomplete.length && baseMaturity === 'ready' ? "demoted to 'seed'" : `'${maturity}'`}`);
  }

  return {
    thesis,
    kill_criteria: killCriteria,
    explicit_decisions: explicitDecisions,
    name: pathOutput.suggested_name,
    problem_statement: recommendedProblem,
    solution: pathOutput.suggested_solution,
    target_market: pathOutput.target_market,
    origin_type: pathOutput.origin_type,
    raw_chairman_intent: pathOutput.suggested_problem,
    competitor_ref: pathOutput.competitor_urls,
    blueprint_id: pathOutput.blueprint_id,
    discovery_strategy: pathOutput.discovery_strategy,
    // SD-LEO-FIX-FIX-STAGE-VENTURE-001: Extract typed fields from synthesis
    archetype: archetype?.primary_archetype || 'automator',
    moat_strategy: moat || null,
    portfolio_synergy_score: (portfolio?.composite_score || 0) / 100,
    time_horizon_classification: timeHorizon?.position || null,
    build_estimate: buildCost || null,
    // SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001 (adversarial-review CRITICAL fix):
    // required_capabilities was declared on the candidate (single-candidate paths stamp
    // it directly on pathOutput; discovery_mode stamps it on raw_material.top_candidate)
    // but synthesis never carried it into the persisted brief, so seeded_from_venture's
    // carry-forward (venture-reseeding.js reads ventures.metadata.stage_zero) always saw
    // undefined in production — the gate still ran (honest auto-pass), but the carry-
    // forward enhancement was silently vacuous end-to-end. Thread it through here.
    required_capabilities: pathOutput.required_capabilities ?? pathOutput.raw_material?.top_candidate?.required_capabilities ?? null,
    // SD-FDBK-FIX-STAGE-PROMOTION-NEVER-001: nursery_id rides on raw_material directly for the
    // reactivation path (venture-nursery.js's reactivateVenture stamps it there) or on the
    // selected candidate for discovery_mode's nursery_reeval strategy (the LLM echoes it back
    // per-candidate, same shape as required_capabilities above) — thread it through so
    // persistVentureBrief can stamp venture_nursery.promoted_to_venture_id back on promotion.
    nursery_id: pathOutput.raw_material?.nursery_id ?? pathOutput.raw_material?.top_candidate?.nursery_id ?? pathOutput.metadata?.nursery_id ?? null,
    maturity,
    usage,
    metadata: {
      ...pathOutput.metadata,
      synthesis: {
        cross_reference: crossRef,
        portfolio_evaluation: portfolio,
        problem_reframing: reframing,
        moat_architecture: moat,
        chairman_constraints: constraints,
        time_horizon: timeHorizon,
        archetypes: archetype,
        build_cost: buildCost,
        virality: virality,
        design_evaluation: design,
        narrative_risk: narrativeRisk,
        tech_trajectory: techTrajectory,
        attention_capital: attentionCapital,
        // SD-EHG-FACTORY-AGENTIC-FIT-SELECTION-001 (FR-5): record the full agentic-fit record
        // (4 dimension sub-scores + disadvantage flags + multiplier) for chairman explainability.
        agentic_fit: agenticFit,
        advisory: {
          mental_model_analysis: mentalModelAnalysis,
        },
        components_run: componentsRun,
        components_total: componentsTotal,
        profile: profileMetadata,
        weighted_score: weightedScore,
      },
    },
  };
}

export {
  crossReferenceIntellectualCapital,
  evaluatePortfolioFit,
  reframeProblem,
  designMoat,
  applyChairmanConstraints,
  assessTimeHorizon,
  classifyArchetype,
  estimateBuildCost,
  analyzeVirality,
  evaluateDesignPotential,
  analyzeNarrativeRisk,
  analyzeTechTrajectory,
  analyzeAttentionCapital,
};
