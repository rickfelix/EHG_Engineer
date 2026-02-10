/**
 * Chairman Override Tracker
 *
 * Tracks when the chairman overrides system-recommended scores,
 * recording both values and enabling pattern analysis of overrides
 * vs outcomes.
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-H
 */

import { VALID_COMPONENTS } from './profile-service.js';

/**
 * Record a chairman override of a system-recommended score.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} override
 * @param {string} override.ventureId - Venture UUID
 * @param {string} override.component - Synthesis component name
 * @param {number} override.systemScore - Original system-recommended score
 * @param {number} override.overrideScore - Chairman's chosen score
 * @param {string} [override.reason] - Chairman's reasoning for the override
 * @returns {Promise<Object|null>} Created override record or null on error
 */
export async function recordOverride(deps, override) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    logger.warn('   Override tracker: No supabase client');
    return null;
  }

  const { ventureId, component, systemScore, overrideScore, reason } = override;

  if (!ventureId || !component) {
    logger.warn('   Override tracker: ventureId and component are required');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('chairman_overrides')
      .insert({
        venture_id: ventureId,
        component,
        system_score: systemScore,
        override_score: overrideScore,
        reason: reason || null,
        outcome: 'pending',
      })
      .select('id, venture_id, component, system_score, override_score, reason, outcome')
      .single();

    if (error) {
      logger.warn(`   Override tracker: Insert error: ${error.message}`);
      return null;
    }

    return data;
  } catch (err) {
    logger.warn(`   Override tracker: Error: ${err.message}`);
    return null;
  }
}

/**
 * Get all overrides for a specific synthesis component.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {string} component - Component name (e.g. 'moat_architecture')
 * @returns {Promise<Array>} Overrides sorted by created_at descending
 */
export async function getOverridesByComponent(deps, component) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    logger.warn('   Override tracker: No supabase client');
    return [];
  }

  if (!component) return [];

  try {
    const { data, error } = await supabase
      .from('chairman_overrides')
      .select('id, venture_id, component, system_score, override_score, reason, outcome, outcome_notes, created_at')
      .eq('component', component)
      .order('created_at', { ascending: false });

    if (error) {
      logger.warn(`   Override tracker: Query error: ${error.message}`);
      return [];
    }

    return data || [];
  } catch (err) {
    logger.warn(`   Override tracker: Error: ${err.message}`);
    return [];
  }
}

/**
 * Generate insights from chairman override patterns.
 *
 * Analyzes overrides to identify:
 * - Per-component override frequency and success rate
 * - Components where chairman intuition outperforms the algorithm
 * - Average score deltas (how much the chairman typically adjusts)
 *
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<Object>} { total_overrides, components: { [name]: { count, success_rate, avg_delta, direction } } }
 */
export async function generateOverrideInsights(deps) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    logger.warn('   Override tracker: No supabase client');
    return { total_overrides: 0, components: {} };
  }

  try {
    const { data, error } = await supabase
      .from('chairman_overrides')
      .select('component, system_score, override_score, outcome')
      .order('created_at', { ascending: false });

    if (error) {
      logger.warn(`   Override tracker: Query error: ${error.message}`);
      return { total_overrides: 0, components: {} };
    }

    if (!data || data.length === 0) {
      return { total_overrides: 0, components: {} };
    }

    // Group by component
    const grouped = {};
    for (const row of data) {
      if (!grouped[row.component]) {
        grouped[row.component] = [];
      }
      grouped[row.component].push(row);
    }

    // Analyze each component
    const components = {};
    for (const [comp, overrides] of Object.entries(grouped)) {
      const resolved = overrides.filter(o => o.outcome && o.outcome !== 'pending');
      const positive = resolved.filter(o => o.outcome === 'positive').length;
      const deltas = overrides.map(o =>
        parseFloat(o.override_score) - parseFloat(o.system_score)
      );
      const avgDelta = deltas.length > 0
        ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100
        : 0;

      components[comp] = {
        count: overrides.length,
        resolved: resolved.length,
        positive,
        success_rate: resolved.length > 0
          ? Math.round((positive / resolved.length) * 100)
          : null,
        avg_delta: avgDelta,
        direction: avgDelta > 0 ? 'upward' : avgDelta < 0 ? 'downward' : 'neutral',
      };
    }

    return {
      total_overrides: data.length,
      components,
    };
  } catch (err) {
    logger.warn(`   Override tracker: Error: ${err.message}`);
    return { total_overrides: 0, components: {} };
  }
}
