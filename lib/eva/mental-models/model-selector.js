/**
 * Model Selection Algorithm
 *
 * Selects 3-5 relevant mental models based on:
 * - Stage applicability
 * - Path/strategy matching
 * - Archetype affinity weighting
 * - Effectiveness score ranking
 * - Exclusion of already-applied models
 *
 * Part of SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001
 */

const MAX_MODELS = 5;

/**
 * Select the best mental models for a given context.
 *
 * @param {Object} params
 * @param {number} params.stage - Stage number (e.g., 0)
 * @param {string} [params.path] - Entry path (competitor_teardown, discovery_mode, blueprint_browse)
 * @param {string} [params.strategy] - Discovery strategy (trend_scanner, etc.)
 * @param {string} [params.archetype] - Venture archetype
 * @param {string[]} [params.excludeIds] - Model IDs to exclude (already applied)
 * @param {Object} deps - Dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object[]>} Ranked list of 3-5 model objects
 */
export async function selectModels({ stage, path, strategy, archetype, excludeIds = [] }, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    logger.warn('   Mental models: No supabase client, returning empty');
    return [];
  }

  try {
    // Query active models for this stage
    let query = supabase
      .from('mental_models')
      .select('*')
      .eq('is_active', true)
      .contains('applicable_stages', [stage]);

    const { data: models, error } = await query;

    if (error) {
      logger.warn(`   Mental models: Selection query failed: ${error.message}`);
      return [];
    }

    if (!models || models.length === 0) {
      return [];
    }

    // Filter by path if specified
    let filtered = models;
    if (path) {
      filtered = filtered.filter(m =>
        !m.applicable_paths || m.applicable_paths.length === 0 || m.applicable_paths.includes(path)
      );
    }

    // Filter by strategy if specified
    if (strategy) {
      filtered = filtered.filter(m =>
        !m.applicable_strategies || m.applicable_strategies.length === 0 || m.applicable_strategies.includes(strategy)
      );
    }

    // Exclude already-applied models
    if (excludeIds.length > 0) {
      filtered = filtered.filter(m => !excludeIds.includes(m.id));
    }

    if (filtered.length === 0) {
      return [];
    }

    // Fetch effectiveness scores for ranking
    const modelIds = filtered.map(m => m.id);
    const { data: effectiveness, error: effectivenessError } = await supabase
      .from('mental_model_effectiveness')
      .select('model_id, composite_effectiveness_score')
      .in('model_id', modelIds)
      .eq('stage_number', stage);
    if (effectivenessError) {
      logger.warn(`   Mental models: Effectiveness query failed: ${effectivenessError.message}`);
    }

    // Build effectiveness lookup
    const effectivenessMap = {};
    if (effectiveness) {
      for (const e of effectiveness) {
        if (!effectivenessMap[e.model_id] || e.composite_effectiveness_score > effectivenessMap[e.model_id]) {
          effectivenessMap[e.model_id] = e.composite_effectiveness_score;
        }
      }
    }

    // Fetch archetype affinity if archetype specified
    let affinityMap = {};
    if (archetype) {
      const { data: affinities, error: affinityError } = await supabase
        .from('mental_model_archetype_affinity')
        .select('model_id, affinity_score')
        .in('model_id', modelIds)
        .eq('archetype', archetype);
      if (affinityError) {
        logger.warn(`   Mental models: Affinity query failed: ${affinityError.message}`);
      }

      if (affinities) {
        for (const a of affinities) {
          affinityMap[a.model_id] = a.affinity_score;
        }
      }
    }

    // Rank models by effectiveness * affinity
    const ranked = filtered.map(model => {
      const effectivenessScore = effectivenessMap[model.id] ?? 0.5;
      const affinityScore = affinityMap[model.id] ?? 0.5;
      const compositeScore = effectivenessScore * affinityScore;

      return { ...model, _effectiveness: effectivenessScore, _affinity: affinityScore, _score: compositeScore };
    });

    ranked.sort((a, b) => b._score - a._score);

    return ranked.slice(0, MAX_MODELS);
  } catch (err) {
    logger.warn(`   Mental models: Selection error: ${err.message}`);
    return [];
  }
}
