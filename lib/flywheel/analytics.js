/**
 * Flywheel Analytics — Query EVA interaction data for insights
 *
 * SD: SD-LEO-FEAT-DATA-FLYWHEEL-001 (FR-003, FR-004, FR-005)
 *
 * Provides query functions wrapping the v_flywheel_velocity,
 * v_cross_venture_patterns, and v_eva_accuracy views plus
 * fn_flywheel_summary() RPC.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

/**
 * Get flywheel velocity metrics — weekly interaction counts and closure rates.
 *
 * @param {object} [options]
 * @param {string} [options.ventureId] - Filter by venture UUID
 * @param {number} [options.weeksBack=8] - Number of weeks to look back
 * @returns {Promise<{data: Array, error: string|null}>}
 */
export async function getFlywheelVelocity(options = {}) {
  try {
    const supabase = createSupabaseServiceClient();
    let query = supabase
      .from('v_flywheel_velocity')
      .select('*')
      .order('week_start', { ascending: false });

    if (options.ventureId) {
      query = query.eq('venture_id', options.ventureId);
    }

    if (options.weeksBack) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (options.weeksBack || 8) * 7);
      query = query.gte('week_start', cutoff.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      return { data: [], error: error.message };
    }
    return { data: data || [], error: null };
  } catch (err) {
    return { data: [], error: err.message };
  }
}

/**
 * Get cross-venture patterns — common decision types across ventures.
 *
 * @param {object} [options]
 * @param {string} [options.decisionType] - Filter by specific decision type
 * @returns {Promise<{data: Array, error: string|null}>}
 */
export async function getCrossVenturePatterns(options = {}) {
  try {
    const supabase = createSupabaseServiceClient();
    let query = supabase
      .from('v_cross_venture_patterns')
      .select('*')
      .order('total_occurrences', { ascending: false });

    if (options.decisionType) {
      query = query.eq('decision_type', options.decisionType);
    }

    const { data, error } = await query;

    if (error) {
      return { data: [], error: error.message };
    }
    return { data: data || [], error: null };
  } catch (err) {
    return { data: [], error: err.message };
  }
}

/**
 * Get EVA accuracy metrics — chairman action distribution with trends.
 *
 * @param {object} [options]
 * @param {string} [options.decisionType] - Filter by specific decision type
 * @returns {Promise<{data: Array, error: string|null}>}
 */
export async function getEvaAccuracy(options = {}) {
  try {
    const supabase = createSupabaseServiceClient();
    let query = supabase
      .from('v_eva_accuracy')
      .select('*')
      .order('decision_type')
      .order('total_count', { ascending: false });

    if (options.decisionType) {
      query = query.eq('decision_type', options.decisionType);
    }

    const { data, error } = await query;

    if (error) {
      return { data: [], error: error.message };
    }
    return { data: data || [], error: null };
  } catch (err) {
    return { data: [], error: err.message };
  }
}

/**
 * Get flywheel summary — aggregated JSONB summary via RPC.
 *
 * @param {object} [options]
 * @param {string} [options.ventureId] - Optional venture UUID
 * @param {number} [options.weeksBack=4] - Number of weeks
 * @returns {Promise<{data: object|null, error: string|null}>}
 */
export async function getFlywheelSummary(options = {}) {
  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase.rpc('fn_flywheel_summary', {
      p_venture_id: options.ventureId || null,
      p_weeks_back: options.weeksBack || 4
    });

    if (error) {
      return { data: null, error: error.message };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}
