/**
 * Stage 0 - Venture Nursery and Feedback Loop
 *
 * Manages ventures that aren't ready for Stage 1:
 * - Park ventures with trigger conditions for re-evaluation
 * - Reactivate ventures when conditions are met
 * - Record synthesis feedback for future cross-referencing
 * - Track nursery health (stale items, trigger readiness)
 *
 * The nursery is a "warm storage" - items aren't abandoned but
 * periodically re-evaluated based on trigger conditions.
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-I
 *
 * SD-LEO-INFRA-STAGE0-NURSERY-PARK-PATH-001 (Charlie ledger CH-1, Solomon-confirmed,
 * selection-gating): this module previously wrote/read 9 columns that do not exist on
 * live venture_nursery (real shape: database/migrations/20260209_stage0_venture_entry_schema.sql
 * — name, description, maturity_level CHECK seed|sprout|ready, trigger_conditions,
 * current_score, score_history, last_evaluated_at, next_evaluation_at,
 * evaluation_interval_days, promoted_to_venture_id, source_type CHECK enum, source_ref).
 * Every non-'ready' chairman-review outcome therefore THREW and failed the whole request.
 * All writes/reads now target the live columns; the rich brief travels in source_ref
 * (the jsonb vessel the table actually has — there is no metadata column). The write
 * shape mirrors the proven production insert in traversability-gate.js.
 */

import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';

/** Live maturity_level CHECK values; brief maturities outside it map to 'seed'. */
export const NURSERY_MATURITY_LEVELS = Object.freeze(['seed', 'sprout', 'ready']);

/** Live source_type CHECK values (20260209 migration). */
export const NURSERY_SOURCE_TYPES = Object.freeze(['brainstorm', 'todoist', 'youtube', 'competitor_analysis', 'discovery_mode', 'manual']);

/**
 * Total mapper: brief.maturity -> live maturity_level. 'blocked'/'nursery' (valid brief
 * maturities with no nursery CHECK counterpart) park as 'seed'; unknown values too —
 * a CHECK violation is structurally impossible. PURE.
 */
export function toNurseryMaturityLevel(maturity) {
  return NURSERY_MATURITY_LEVELS.includes(maturity) ? maturity : 'seed';
}

/**
 * Total mapper: brief.origin_type -> live source_type CHECK enum. PURE.
 */
export function toNurserySourceType(originType) {
  if (originType === 'discovery' || originType === 'nursery_reeval') return 'discovery_mode';
  if (originType === 'competitor_teardown') return 'competitor_analysis';
  return 'manual'; // blueprint, manual, seeded_from_venture, unknown
}

/** Parse a review schedule ('30d'/'12h'/'3m') into whole days for evaluation_interval_days. */
export function scheduleToIntervalDays(schedule) {
  const match = typeof schedule === 'string' ? schedule.match(/^(\d+)([dhm])$/) : null;
  if (!match) return 90;
  const n = parseInt(match[1], 10);
  if (match[2] === 'd') return n;
  if (match[2] === 'h') return Math.max(1, Math.round(n / 24));
  return n * 30; // months
}

/**
 * Park a venture in the nursery with trigger conditions.
 *
 * @param {Object} brief - Venture brief from synthesis/chairman review
 * @param {Object} params
 * @param {string} params.reason - Why it's being parked
 * @param {string[]} [params.triggerConditions] - Conditions that would trigger re-evaluation
 * @param {string} [params.reviewSchedule] - When to next review (e.g., '30d', '90d')
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} Created nursery entry
 */
export async function parkVenture(brief, params, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) throw new Error('supabase client is required');
  if (!params?.reason) throw new Error('reason is required');

  logger.log(`   Parking venture in nursery: ${brief.name}`);

  const triggerConditions = params.triggerConditions || [];
  const reviewSchedule = params.reviewSchedule || '90d';
  const nextReviewDate = calculateNextReview(reviewSchedule);
  const parkedAt = new Date().toISOString();
  const currentScore = brief.metadata?.synthesis?.weighted_score?.total_score
    ?? (Number.isFinite(brief.composite_score) ? brief.composite_score : null);

  // Live-schema insert (shape mirrors traversability-gate.js parkFailedCandidate —
  // the proven production write against this table). The rich brief rides source_ref.
  const { data, error } = await supabase
    .from('venture_nursery')
    .insert({
      name: brief.name,
      description: [brief.problem_statement, brief.solution].filter(Boolean).join(' → ')
        || `Parked: ${params.reason}`,
      maturity_level: toNurseryMaturityLevel(brief.maturity),
      trigger_conditions: triggerConditions,
      current_score: currentScore,
      score_history: currentScore != null
        ? [{ date: parkedAt, score: currentScore, reason: 'parked', details: params.reason }]
        : [],
      next_evaluation_at: nextReviewDate,
      evaluation_interval_days: scheduleToIntervalDays(reviewSchedule),
      source_type: toNurserySourceType(brief.origin_type),
      source_ref: {
        park: {
          parked_reason: params.reason,
          review_schedule: reviewSchedule,
          parked_at: parkedAt,
          origin_type: brief.origin_type || null,
          raw_chairman_intent: brief.raw_chairman_intent || brief.problem_statement || null,
          maturity_original: brief.maturity || 'seed',
        },
        brief: {
          name: brief.name,
          problem_statement: brief.problem_statement || null,
          solution: brief.solution || null,
          target_market: brief.target_market || null,
          origin_type: brief.origin_type || null,
          thesis: brief.thesis || null,
          kill_criteria: brief.kill_criteria || null,
          explicit_decisions: brief.explicit_decisions || null,
        },
        synthesis_snapshot: brief.metadata?.synthesis || null,
      },
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to park venture: ${error.message}`);

  logger.log(`   Nursery entry created: ${data.id}`);
  logger.log(`   Next review: ${nextReviewDate}`);
  logger.log(`   Triggers: ${triggerConditions.length} condition(s)`);

  return data;
}

/**
 * Reactivate a nursery item back into Stage 0 for re-evaluation.
 *
 * @param {string} nurseryId - ID of the nursery entry
 * @param {Object} params
 * @param {string} params.reason - Why it's being reactivated
 * @param {Object} [params.updatedContext] - New context that triggered reactivation
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} Reactivated nursery entry with path output for re-synthesis
 */
export async function reactivateVenture(nurseryId, params, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) throw new Error('supabase client is required');
  if (!nurseryId) throw new Error('nurseryId is required');
  if (!params?.reason) throw new Error('reason is required');

  // Fetch current nursery entry
  const { data: entry, error: fetchError } = await supabase
    .from('venture_nursery')
    .select('*')
    .eq('id', nurseryId)
    .single();

  if (fetchError || !entry) throw new Error(`Nursery entry not found: ${nurseryId}`);
  // Live schema has no status column: reactivation is marked in source_ref.reactivation;
  // promotion is promoted_to_venture_id (a promoted row is beyond reactivation too).
  if (entry.source_ref?.reactivation) throw new Error('Venture already reactivated');
  if (entry.promoted_to_venture_id) throw new Error('Venture already promoted');

  logger.log(`   Reactivating nursery item: ${entry.name}`);

  const reactivatedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('venture_nursery')
    .update({
      last_evaluated_at: reactivatedAt,
      source_ref: {
        ...(entry.source_ref || {}),
        reactivation: {
          reason: params.reason,
          updated_context: params.updatedContext || null,
          reactivated_at: reactivatedAt,
        },
      },
    })
    .eq('id', nurseryId)
    .select()
    .single();

  if (updateError) throw new Error(`Failed to reactivate: ${updateError.message}`);

  logger.log('   Status: parked → reactivated (source_ref.reactivation)');

  // Build path output for re-entry into synthesis. Rich content normally rides
  // source_ref.brief (parkVenture path), but a row parked by the traversability gate
  // (traversability-gate.js parkFailedCandidate) instead stores it under source_ref.candidate
  // — fall back there so reactivating a traversability-parked item doesn't silently produce
  // an empty solution/target_market (QF-20260712-860, confirmed on row ac45469b-c700-4033-
  // 87bd-95a3b6112d84 / Image Alt Text Generator).
  const parkedBrief = entry.source_ref?.brief || entry.source_ref?.candidate || {};
  const pathOutput = {
    origin_type: 'nursery_reeval',
    raw_material: {
      nursery_id: nurseryId,
      previous_synthesis: entry.source_ref?.synthesis_snapshot || null,
      reactivation_context: params.updatedContext || null,
      candidate: entry.source_ref?.candidate || null,
    },
    suggested_name: entry.name,
    suggested_problem: parkedBrief.problem_statement || entry.description || '',
    suggested_solution: parkedBrief.solution || '',
    target_market: parkedBrief.target_market || '',
    metadata: {
      path: 'nursery_reeval',
      nursery_id: nurseryId,
      reactivation_reason: params.reason,
      candidate: entry.source_ref?.candidate || null,
    },
    competitor_urls: [],
    blueprint_id: null,
    discovery_strategy: null,
  };

  return { entry: updated, pathOutput };
}

/**
 * Record synthesis feedback for a venture (used after Stage 0 completes).
 * This creates a learning record that future cross-referencing can use.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture or nursery entry ID
 * @param {string} params.outcome - 'approved' | 'parked' | 'killed'
 * @param {Object} [params.synthesisData] - Key synthesis findings
 * @param {string[]} [params.lessons] - Lessons learned
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} Created feedback record
 */
export async function recordSynthesisFeedback(params, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) throw new Error('supabase client is required');
  if (!params?.ventureId) throw new Error('ventureId is required');
  if (!params?.outcome) throw new Error('outcome is required');

  const validOutcomes = ['approved', 'parked', 'killed'];
  if (!validOutcomes.includes(params.outcome)) {
    throw new Error(`Invalid outcome: ${params.outcome}. Must be: ${validOutcomes.join(', ')}`);
  }

  logger.log(`   Recording synthesis feedback: ${params.outcome}`);

  // PRE-EXISTING LATENT DRIFT (surfaced by diff-lint when SD-LEO-INFRA-STAGE0-NURSERY-PARK-PATH-001
  // touched this file; NOT introduced or fixed here): venture_synthesis_feedback does not exist
  // in the live schema, so recordSynthesisFeedback is dead in production. Out of this SD's
  // enumerated scope (park path); routed to the coordinator for a dedicated sourcing decision.
  const { data, error } = await supabase
    .from('venture_synthesis_feedback') // schema-lint-disable-line
    .insert({
      venture_id: params.ventureId,
      outcome: params.outcome,
      synthesis_data: params.synthesisData || {},
      lessons: params.lessons || [],
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to record feedback: ${error.message}`);

  logger.log(`   Feedback recorded: ${data.id}`);
  return data;
}

/**
 * Check nursery items for trigger condition readiness.
 *
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object[]>} Items ready for re-evaluation
 */
export async function checkNurseryTriggers(deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) throw new Error('supabase client is required');

  logger.log('   Checking nursery triggers...');

  // Fetch parked items (live schema: parked = not yet promoted; schedule lives in
  // next_evaluation_at; trigger_conditions is a first-class column).
  // Paginated (FR-6 batch 7): the trigger sweep must see every parked item.
  let items;
  try {
    items = await fetchAllPaginated(() => supabase
      .from('venture_nursery')
      .select('id, name, trigger_conditions, next_evaluation_at, promoted_to_venture_id, source_ref')
      .is('promoted_to_venture_id', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`Failed to fetch nursery items: ${e.message}`);
  }
  if (!items || items.length === 0) {
    logger.log('   No parked items in nursery');
    return [];
  }

  const now = new Date();
  const readyForReview = [];

  for (const item of items) {
    const nextReview = item.next_evaluation_at;
    if (nextReview && new Date(nextReview) <= now) {
      readyForReview.push({
        id: item.id,
        name: item.name,
        reason: 'scheduled_review',
        next_review_date: nextReview,
        trigger_conditions: item.trigger_conditions || [],
      });
    }
  }

  logger.log(`   ${readyForReview.length} of ${items.length} item(s) ready for review`);
  return readyForReview;
}

/**
 * Get nursery health summary.
 *
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @returns {Promise<Object>} Health summary
 */
export async function getNurseryHealth(deps = {}) {
  const { supabase } = deps;

  if (!supabase) throw new Error('supabase client is required');

  // Paginated (FR-6 batch 7): health counts are rows.length gauges over the full table.
  let items;
  try {
    items = await fetchAllPaginated(() => supabase
      .from('venture_nursery')
      .select('id, name, maturity_level, trigger_conditions, source_ref, promoted_to_venture_id, created_at')
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`Failed to fetch nursery: ${e.message}`);
  }
  if (!items) return { total: 0, parked: 0, reactivated: 0, stale: 0, items: [] };

  const now = new Date();
  const staleThreshold = 180 * 24 * 60 * 60 * 1000; // 180 days

  const statusOf = (i) => i.promoted_to_venture_id ? 'promoted'
    : i.source_ref?.reactivation ? 'reactivated'
    : 'parked';
  const parked = items.filter(i => statusOf(i) === 'parked');
  const reactivated = items.filter(i => statusOf(i) === 'reactivated');
  const stale = parked.filter(i => (now - new Date(i.created_at)) > staleThreshold);

  return {
    total: items.length,
    parked: parked.length,
    reactivated: reactivated.length,
    stale: stale.length,
    items: items.map(i => ({
      id: i.id,
      name: i.name,
      status: statusOf(i),
      maturity: i.maturity_level,
      age_days: Math.round((now - new Date(i.created_at)) / (24 * 60 * 60 * 1000)),
      has_triggers: (i.trigger_conditions || []).length > 0,
    })),
  };
}

// ── Helpers ──────────────────────────────

function calculateNextReview(schedule) {
  const now = new Date();
  const match = schedule.match(/^(\d+)([dhm])$/);
  if (!match) {
    // Default: 90 days
    now.setDate(now.getDate() + 90);
    return now.toISOString();
  }

  const [, amount, unit] = match;
  const num = parseInt(amount, 10);

  switch (unit) {
    case 'd':
      now.setDate(now.getDate() + num);
      break;
    case 'h':
      now.setHours(now.getHours() + num);
      break;
    case 'm':
      now.setMonth(now.getMonth() + num);
      break;
    default:
      now.setDate(now.getDate() + 90);
  }

  return now.toISOString();
}
