/**
 * OKR Cycle Guard — Day-28 Hard Stop (BLOCKING)
 *
 * Blocking guard that prevents new SD creation within the final
 * days of an OKR cycle. Escalates to chairman_decisions with
 * blocking flag. Chairman can override with explicit reason.
 *
 * Part of SD-MAN-ORCH-VISION-HEAL-SCORE-93-001-04-B
 */

import { createClient } from '@supabase/supabase-js';

const DEFAULT_GUARD_DAYS = 3; // Warn when ≤3 days remain in OKR cycle

/**
 * Load guard_days threshold from leo_config table, falling back to default.
 * @param {Object} supabase - Supabase client
 * @returns {Promise<number>}
 */
async function loadGuardDaysFromConfig(supabase) {
  try {
    const { data } = await supabase
      .from('leo_config')
      .select('value')
      .eq('key', 'okr_guard_days')
      .single();

    if (data?.value != null) {
      const parsed = parseInt(data.value, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
  } catch {
    // Fall through to default
  }
  return DEFAULT_GUARD_DAYS;
}

/**
 * Check if current date is within the hard-stop window of any active OKR cycle.
 *
 * @param {Object} options
 * @param {Object} [options.supabase] - Supabase client
 * @param {Object} [options.logger] - Logger
 * @param {string} [options.ventureId] - Filter to specific venture
 * @param {number} [options.guardDays] - Days before cycle end to trigger (default: from leo_config or 3)
 * @returns {Promise<{allowed: boolean, advisory: boolean, daysRemaining: number|null, message: string, nearestDeadline: string|null}>}
 */
export async function checkDay28HardStop({
  supabase: supabaseClient,
  logger = console,
  ventureId = null,
  guardDays = null,
} = {}) {
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Load threshold from DB config if not explicitly provided
  if (guardDays === null) {
    guardDays = await loadGuardDaysFromConfig(supabase);
  }

  // Query active key results with end_date
  let query = supabase
    .from('key_results')
    .select('id, title, end_date, objective_id')
    .not('end_date', 'is', null)
    .gte('end_date', new Date().toISOString());

  if (ventureId) {
    query = query.eq('venture_id', ventureId);
  }

  const { data: keyResults, error } = await query
    .order('end_date', { ascending: true })
    .limit(10);

  if (error) {
    logger.warn(`OKR cycle guard: Could not query key_results: ${error.message}`);
    return { allowed: true, advisory: false, daysRemaining: null, message: 'Could not check OKR cycle dates', nearestDeadline: null };
  }

  if (!keyResults || keyResults.length === 0) {
    return { allowed: true, advisory: false, daysRemaining: null, message: 'No active OKR cycles with end dates', nearestDeadline: null };
  }

  // Find nearest deadline
  const now = new Date();
  const nearest = keyResults[0];
  const endDate = new Date(nearest.end_date);
  const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysRemaining <= guardDays) {
    // SD-MAN-FEAT-CORRECTIVE-VISION-GAP-070: Changed from hard-block to
    // auto-deferral with advisory notification. Unfinished OKR-linked work
    // is deferred to the next cycle instead of simply blocking SD creation.
    const message = `ADVISORY: OKR cycle ends in ${daysRemaining} day(s) (${nearest.end_date}). Unfinished OKR-linked SDs will auto-defer to next cycle.`;
    logger.warn(`OKR cycle guard: ${message}`);

    return {
      allowed: true,  // Advisory — no longer blocks SD creation
      blocked: false,
      advisory: true,  // Signals that deferral should be offered
      autoDeferral: true,
      daysRemaining,
      message,
      nearestDeadline: nearest.end_date,
      nearestKeyResult: nearest.title,
    };
  }

  return {
    allowed: true,
    advisory: false,
    daysRemaining,
    message: `OKR cycle has ${daysRemaining} days remaining`,
    nearestDeadline: nearest.end_date,
  };
}

/**
 * Get OKR date proximity for urgency scoring.
 * Returns { daysRemaining } for use with calculateUrgencyScore().
 *
 * @param {Object} options
 * @param {Object} options.sd - Strategic directive with strategic_objectives
 * @param {Object} [options.supabase] - Supabase client
 * @returns {Promise<{daysRemaining: number|null}>}
 */
export async function getOkrDateProximity({
  sd,
  supabase: supabaseClient,
} = {}) {
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Find OKR links from SD's strategic_objectives or metadata
  const objectiveIds = sd?.metadata?.objective_ids || [];
  if (objectiveIds.length === 0) {
    return { daysRemaining: null };
  }

  const { data: keyResults, error } = await supabase
    .from('key_results')
    .select('end_date')
    .in('objective_id', objectiveIds)
    .not('end_date', 'is', null)
    .gte('end_date', new Date().toISOString())
    .order('end_date', { ascending: true })
    .limit(1);

  if (error || !keyResults || keyResults.length === 0) {
    return { daysRemaining: null };
  }

  const endDate = new Date(keyResults[0].end_date);
  const daysRemaining = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return { daysRemaining };
}

/**
 * Auto-defer unfinished OKR-linked SDs at day-28.
 * Queries in-progress SDs that have OKR linkage and defers them
 * to the next cycle by updating status to 'deferred'.
 *
 * Part of SD-MAN-FEAT-CORRECTIVE-VISION-GAP-070
 *
 * @param {Object} options
 * @param {Object} [options.supabase] - Supabase client
 * @param {Object} [options.logger] - Logger
 * @param {boolean} [options.dryRun=false] - Preview without persisting
 * @returns {Promise<{deferred: Array, skipped: Array, error: string|null}>}
 */
export async function autoDeferOkrLinkedSDs({
  supabase: supabaseClient,
  logger = console,
  dryRun = false,
} = {}) {
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Check if we're in the deferral window
  const guardResult = await checkDay28HardStop({ supabase, logger });
  if (!guardResult.autoDeferral) {
    return { deferred: [], skipped: [], error: null };
  }

  // Find in-progress SDs with OKR linkage (metadata.objective_ids is not empty)
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, metadata')
    .in('status', ['in_progress', 'draft'])
    .not('metadata->objective_ids', 'is', null);

  if (error) {
    logger.error(`OKR auto-deferral: query failed: ${error.message}`);
    return { deferred: [], skipped: [], error: error.message };
  }

  const okrLinked = (sds || []).filter(sd => {
    const ids = sd.metadata?.objective_ids;
    return Array.isArray(ids) && ids.length > 0;
  });

  if (okrLinked.length === 0) {
    return { deferred: [], skipped: [], error: null };
  }

  const deferred = [];
  const skipped = [];

  for (const sd of okrLinked) {
    if (dryRun) {
      deferred.push({ sd_key: sd.sd_key, title: sd.title, action: 'would_defer' });
      continue;
    }

    const { error: updateErr } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'deferred',
        metadata: {
          ...sd.metadata,
          deferred_reason: 'okr_cycle_end',
          deferred_at: new Date().toISOString(),
          deferred_from_deadline: guardResult.nearestDeadline,
        },
      })
      .eq('id', sd.id);

    if (updateErr) {
      skipped.push({ sd_key: sd.sd_key, reason: updateErr.message });
    } else {
      deferred.push({ sd_key: sd.sd_key, title: sd.title, action: 'deferred' });
      logger.log(`OKR auto-deferral: Deferred ${sd.sd_key} (${sd.title})`);
    }
  }

  return { deferred, skipped, error: null };
}
