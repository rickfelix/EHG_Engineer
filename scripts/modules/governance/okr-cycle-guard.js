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
    const message = `BLOCKED: OKR cycle ends in ${daysRemaining} day(s) (${nearest.end_date}). SD creation blocked — defer to next cycle or request chairman override.`;
    logger.warn(`OKR cycle guard: ${message}`);

    return {
      allowed: false, // Blocking — prevents SD creation
      blocked: true,
      advisory: false,
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
