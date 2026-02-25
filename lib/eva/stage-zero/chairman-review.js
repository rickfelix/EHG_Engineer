/**
 * Chairman Review Flow
 *
 * Presents the synthesized venture brief to the chairman for review.
 * The chairman can edit, approve (send to Stage 1), or park in the Venture Nursery.
 *
 * Captures raw_chairman_intent as an immutable record before any system modifications.
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-B
 */

import { validateVentureBrief } from './interfaces.js';
import { parkVenture } from './venture-nursery.js';
import { createOrReusePendingDecision as _createOrReusePendingDecision } from '../chairman-decision-watcher.js';

/**
 * Present brief to the chairman and process their decision.
 *
 * @param {Object} brief - The venture brief to review
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} Review result with decision and final brief
 */
export async function conductChairmanReview(brief, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  // Capture raw chairman intent BEFORE any modifications
  const rawChairmanIntent = brief.raw_chairman_intent || brief.problem_statement || '';

  logger.log('\n   Chairman Review');
  logger.log('   ' + '─'.repeat(50));
  logger.log(`   Venture: ${brief.name}`);
  logger.log(`   Problem: ${brief.problem_statement}`);
  logger.log(`   Solution: ${brief.solution}`);
  logger.log(`   Market: ${brief.target_market}`);
  logger.log(`   Origin: ${brief.origin_type}`);
  if (brief.archetype) logger.log(`   Archetype: ${brief.archetype}`);
  if (brief.moat_strategy) logger.log(`   Moat: ${JSON.stringify(brief.moat_strategy)}`);
  if (brief.portfolio_synergy_score !== undefined) {
    logger.log(`   Portfolio Synergy: ${brief.portfolio_synergy_score}/100`);
  }
  if (brief.time_horizon_classification) {
    logger.log(`   Time Horizon: ${brief.time_horizon_classification}`);
  }
  logger.log('   ' + '─'.repeat(50));

  // Map maturity to decision: blocked/nursery → park, everything else → direct maturity
  const maturity = brief.maturity || 'ready';
  const decision = (maturity === 'blocked' || maturity === 'nursery') ? 'park' : maturity;

  // Validate the brief before proceeding
  const validation = validateVentureBrief({
    ...brief,
    raw_chairman_intent: rawChairmanIntent,
  });

  return {
    decision, // 'ready' | 'seed' | 'sprout' | 'park'
    brief: {
      ...brief,
      raw_chairman_intent: rawChairmanIntent,
      maturity,
    },
    validation,
    reviewed_at: new Date().toISOString(),
  };
}

/**
 * Persist the approved venture brief to the database.
 *
 * @param {Object} reviewResult - Result from conductChairmanReview
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} Created venture record
 */
export async function persistVentureBrief(reviewResult, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  const { brief, decision } = reviewResult;

  // Record chairman decision in chairman_decisions table for audit trail
  if (brief.venture_id) {
    try {
      const decisionStatus = decision === 'ready' ? 'approved' : 'rejected';
      await supabase
        .from('chairman_decisions')
        .insert({
          venture_id: brief.venture_id,
          lifecycle_stage: 0,
          status: decisionStatus,
          decision: decision === 'ready' ? 'proceed' : 'park',
          summary: `Stage 0: ${decision === 'ready' ? 'Venture approved for Stage 1' : `Parked (${decision})`}`,
          brief_data: {
            name: brief.name,
            problem_statement: brief.problem_statement,
            solution: brief.solution,
            target_market: brief.target_market,
            archetype: brief.archetype,
          },
          rationale: decision === 'ready'
            ? 'Venture meets readiness criteria'
            : buildParkReason(brief),
        });
    } catch (err) {
      logger.warn(`   Chairman decision record failed (non-fatal): ${err.message}`);
    }
  }

  if (decision === 'ready') {
    // Resolve company_id: use provided value, or default to EHG company
    let companyId = deps.company_id || brief.company_id;
    if (!companyId) {
      const { data: ehg } = await supabase
        .from('companies')
        .select('id')
        .eq('name', 'EHG')
        .limit(1)
        .single();
      companyId = ehg?.id || null;
    }

    // Create venture in ventures table for Stage 1
    const { data: venture, error } = await supabase
      .from('ventures')
      .insert({
        name: brief.name,
        description: brief.problem_statement,
        problem_statement: brief.problem_statement,
        target_market: brief.target_market,
        origin_type: brief.origin_type,
        current_lifecycle_stage: 1,
        status: 'active',
        company_id: companyId,
        metadata: {
          stage_zero: {
            solution: brief.solution,
            raw_chairman_intent: brief.raw_chairman_intent,
            archetype: brief.archetype,
            moat_strategy: brief.moat_strategy,
            portfolio_synergy_score: brief.portfolio_synergy_score,
            time_horizon_classification: brief.time_horizon_classification,
            build_estimate: brief.build_estimate,
            cross_references: brief.cross_references,
            chairman_constraint_scores: brief.chairman_constraint_scores,
            origin_metadata: {
              competitor_urls: brief.competitor_ref,
              blueprint_id: brief.blueprint_id,
              discovery_strategy: brief.discovery_strategy,
            },
          },
        },
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create venture: ${error.message}`);
    }

    // Persist Stage 0 artifact for downstream stage consumption
    try {
      await supabase
        .from('venture_artifacts')
        .update({ is_current: false })
        .eq('venture_id', venture.id)
        .eq('lifecycle_stage', 0)
        .eq('is_current', true);

      const synthesisData = brief.metadata?.synthesis || brief;
      await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: venture.id,
          lifecycle_stage: 0,
          artifact_type: 'stage_0_analysis',
          title: 'Stage 0 Synthesis',
          content: JSON.stringify(synthesisData),
          metadata: synthesisData,
          is_current: true,
        });
    } catch (err) {
      logger.warn(`   Warning: Stage 0 artifact persistence failed (non-fatal): ${err.message}`);
    }

    // Also create venture_brief record for detailed tracking
    await persistBriefRecord(brief, venture.id, deps);

    logger.log(`   Venture created: ${venture.id}`);
    logger.log('   Status: Ready for Stage 1');

    return venture;
  }

  // Park in Venture Nursery via parkVenture() for proper trigger/review tracking
  const parkReason = buildParkReason(brief);
  const triggerConditions = brief.metadata?.synthesis?.chairman_constraints?.conditions || [];
  const reviewSchedule = brief.maturity === 'blocked' ? '30d' : '90d';

  const nurseryEntry = await parkVenture(
    brief,
    { reason: parkReason, triggerConditions, reviewSchedule },
    { supabase, logger }
  );

  logger.log(`   Maturity: ${brief.maturity}`);

  return nurseryEntry;
}

/**
 * Persist a detailed brief record in venture_briefs table.
 *
 * @param {Object} brief - The venture brief
 * @param {string} ventureId - UUID of the created venture
 * @param {Object} deps - Injected dependencies
 */
async function persistBriefRecord(brief, ventureId, deps) {
  const { supabase, logger = console } = deps;

  const { error } = await supabase
    .from('venture_briefs')
    .insert({
      venture_id: ventureId,
      name: brief.name,
      problem_statement: brief.problem_statement,
      raw_chairman_intent: brief.raw_chairman_intent,
      solution: brief.solution,
      target_market: brief.target_market,
      origin_type: brief.origin_type,
      archetype: brief.archetype,
      moat_strategy: brief.moat_strategy,
      portfolio_synergy_score: brief.portfolio_synergy_score,
      time_horizon_classification: brief.time_horizon_classification,
      build_estimate: brief.build_estimate,
      cross_references: brief.cross_references,
      chairman_constraint_scores: brief.chairman_constraint_scores,
      competitor_ref: brief.competitor_ref,
      blueprint_id: brief.blueprint_id,
      discovery_strategy: brief.discovery_strategy,
      maturity: brief.maturity || 'ready',
      portfolio_evaluation: brief.portfolio_evaluation
        ?? brief.metadata?.synthesis?.portfolio_evaluation ?? null,
      problem_reframings: brief.problem_reframings
        ?? brief.metadata?.synthesis?.problem_reframing?.reframings ?? null,
    });

  if (error) {
    logger.warn(`   Warning: Failed to create brief record: ${error.message}`);
  }
}

/**
 * Build a human-readable parking reason from brief metadata.
 */
function buildParkReason(brief) {
  if (brief.maturity === 'blocked') {
    const verdict = brief.metadata?.synthesis?.chairman_constraints?.summary;
    return verdict ? `Chairman constraints failed: ${verdict}` : 'Failed chairman constraint checks';
  }
  if (brief.maturity === 'nursery') {
    const horizon = brief.metadata?.synthesis?.time_horizon?.summary;
    return horizon ? `Time horizon: ${horizon}` : 'Time horizon: park and build later';
  }
  return `Early maturity stage: ${brief.maturity}`;
}
