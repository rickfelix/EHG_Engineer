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
 */

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

  const { data, error } = await supabase
    .from('venture_nursery')
    .insert({
      name: brief.name,
      problem_statement: brief.problem_statement,
      solution: brief.solution,
      target_market: brief.target_market,
      origin_type: brief.origin_type,
      raw_chairman_intent: brief.raw_chairman_intent || brief.problem_statement,
      maturity: brief.maturity || 'seed',
      parked_reason: params.reason,
      status: 'parked',
      metadata: {
        stage_zero_brief: brief,
        trigger_conditions: triggerConditions,
        review_schedule: reviewSchedule,
        next_review_date: nextReviewDate,
        parked_at: new Date().toISOString(),
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
  if (entry.status === 'reactivated') throw new Error('Venture already reactivated');

  logger.log(`   Reactivating nursery item: ${entry.name}`);

  // Update status
  const { data: updated, error: updateError } = await supabase
    .from('venture_nursery')
    .update({
      status: 'reactivated',
      metadata: {
        ...entry.metadata,
        reactivation: {
          reason: params.reason,
          updated_context: params.updatedContext || null,
          reactivated_at: new Date().toISOString(),
          previous_status: entry.status,
        },
      },
    })
    .eq('id', nurseryId)
    .select()
    .single();

  if (updateError) throw new Error(`Failed to reactivate: ${updateError.message}`);

  logger.log('   Status: parked → reactivated');

  // Build path output for re-entry into synthesis
  const pathOutput = {
    origin_type: entry.origin_type || 'nursery_reeval',
    raw_material: {
      nursery_id: nurseryId,
      previous_synthesis: entry.metadata?.synthesis_snapshot || null,
      reactivation_context: params.updatedContext || null,
    },
    suggested_name: entry.name,
    suggested_problem: entry.problem_statement,
    suggested_solution: entry.solution,
    target_market: entry.target_market,
    metadata: {
      path: 'nursery_reeval',
      nursery_id: nurseryId,
      reactivation_reason: params.reason,
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

  const { data, error } = await supabase
    .from('venture_synthesis_feedback')
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

  // Fetch parked items
  const { data: items, error } = await supabase
    .from('venture_nursery')
    .select('id, name, metadata, status')
    .eq('status', 'parked')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch nursery items: ${error.message}`);
  if (!items || items.length === 0) {
    logger.log('   No parked items in nursery');
    return [];
  }

  const now = new Date();
  const readyForReview = [];

  for (const item of items) {
    const nextReview = item.metadata?.next_review_date;
    if (nextReview && new Date(nextReview) <= now) {
      readyForReview.push({
        id: item.id,
        name: item.name,
        reason: 'scheduled_review',
        next_review_date: nextReview,
        trigger_conditions: item.metadata?.trigger_conditions || [],
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

  const { data: items, error } = await supabase
    .from('venture_nursery')
    .select('id, name, status, maturity, metadata, created_at');

  if (error) throw new Error(`Failed to fetch nursery: ${error.message}`);
  if (!items) return { total: 0, parked: 0, reactivated: 0, stale: 0, items: [] };

  const now = new Date();
  const staleThreshold = 180 * 24 * 60 * 60 * 1000; // 180 days

  const parked = items.filter(i => i.status === 'parked');
  const reactivated = items.filter(i => i.status === 'reactivated');
  const stale = parked.filter(i => (now - new Date(i.created_at)) > staleThreshold);

  return {
    total: items.length,
    parked: parked.length,
    reactivated: reactivated.length,
    stale: stale.length,
    items: items.map(i => ({
      id: i.id,
      name: i.name,
      status: i.status,
      maturity: i.maturity,
      age_days: Math.round((now - new Date(i.created_at)) / (24 * 60 * 60 * 1000)),
      has_triggers: (i.metadata?.trigger_conditions || []).length > 0,
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
