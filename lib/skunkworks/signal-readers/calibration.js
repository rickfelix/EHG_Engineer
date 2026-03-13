/**
 * Signal Reader: Calibration
 * Reads calibration reports to identify scoring dimensions with high variance
 * or low accuracy — these become R&D proposal candidates.
 *
 * SD: SD-AUTONOMOUS-SKUNKWORKS-RD-DEPARTMENT-ORCH-001-A (FR-002)
 */

/**
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<Array<{type: string, title: string, evidence: Object, priority: number}>>}
 */
export async function readCalibrationSignals(deps) {
  const { supabase, logger = console } = deps;
  const signals = [];

  try {
    // Query calibration dimension data — look for dimensions with poor accuracy
    const { data: dimensions, error } = await supabase
      .from('eva_score_dimensions')
      .select('id, name, weight, description, dimension_type, metadata')
      .eq('active', true);

    if (error) {
      logger.warn(`[calibration-reader] Failed to read dimensions: ${error.message}`);
      return signals;
    }

    if (!dimensions || dimensions.length === 0) {
      logger.log('[calibration-reader] No active dimensions found');
      return signals;
    }

    // Query recent experiment outcomes for accuracy analysis
    const { data: outcomes } = await supabase
      .from('experiment_outcomes')
      .select('experiment_id, variant_key, synthesis_score, gate_passed, dimension_scores, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!outcomes || outcomes.length === 0) {
      logger.log('[calibration-reader] No experiment outcomes to analyze');
      return signals;
    }

    // Analyze each dimension for variance and predictive accuracy
    for (const dim of dimensions) {
      const scores = outcomes
        .filter(o => o.dimension_scores && o.dimension_scores[dim.name] != null)
        .map(o => ({
          score: o.dimension_scores[dim.name],
          passed: o.gate_passed,
        }));

      if (scores.length < 10) continue;

      const mean = scores.reduce((s, v) => s + v.score, 0) / scores.length;
      const variance = scores.reduce((s, v) => s + Math.pow(v.score - mean, 2), 0) / scores.length;
      const stdDev = Math.sqrt(variance);

      // High variance dimensions need investigation
      if (stdDev > 25) {
        signals.push({
          type: 'calibration',
          title: `High variance in ${dim.name} scoring dimension`,
          evidence: {
            dimension: dim.name,
            sample_count: scores.length,
            mean: Math.round(mean * 100) / 100,
            std_dev: Math.round(stdDev * 100) / 100,
            dimension_type: dim.dimension_type,
          },
          priority: Math.min(90, 50 + stdDev),
        });
      }

      // Check predictive accuracy (correlation with gate outcomes)
      const passed = scores.filter(s => s.passed);
      const failed = scores.filter(s => !s.passed);
      if (passed.length > 5 && failed.length > 5) {
        const passMean = passed.reduce((s, v) => s + v.score, 0) / passed.length;
        const failMean = failed.reduce((s, v) => s + v.score, 0) / failed.length;
        const separation = passMean - failMean;

        // Poor separation means dimension isn't predictive
        if (Math.abs(separation) < 10) {
          signals.push({
            type: 'calibration',
            title: `Low predictive power in ${dim.name} dimension`,
            evidence: {
              dimension: dim.name,
              pass_mean: Math.round(passMean * 100) / 100,
              fail_mean: Math.round(failMean * 100) / 100,
              separation: Math.round(separation * 100) / 100,
            },
            priority: 70,
          });
        }
      }
    }

    logger.log(`[calibration-reader] Found ${signals.length} signals from ${dimensions.length} dimensions`);
  } catch (err) {
    logger.warn(`[calibration-reader] Error: ${err.message}`);
  }

  return signals;
}
