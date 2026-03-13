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
    // Use experiment telemetry materialized view — has dimension_scores per venture
    const { data: telemetry, error } = await supabase
      .from('stage_zero_experiment_telemetry')
      .select('venture_id, synthesis_score, kill_gate_stage, gate_passed, gate_score, dimension_scores')
      .not('dimension_scores', 'is', null)
      .limit(500);

    if (error) {
      logger.warn(`[calibration-reader] Failed to read telemetry: ${error.message}`);
      return signals;
    }

    if (!telemetry || telemetry.length === 0) {
      logger.log('[calibration-reader] No telemetry data to analyze');
      return signals;
    }

    // Discover dimension names from the data
    const dimensionNames = new Set();
    for (const row of telemetry) {
      if (row.dimension_scores && typeof row.dimension_scores === 'object') {
        Object.keys(row.dimension_scores).forEach(k => dimensionNames.add(k));
      }
    }

    // Analyze each dimension for variance and predictive accuracy
    for (const dimName of dimensionNames) {
      const scores = telemetry
        .filter(o => o.dimension_scores && o.dimension_scores[dimName] != null)
        .map(o => ({
          score: Number(o.dimension_scores[dimName]),
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
          title: `High variance in ${dimName} scoring dimension`,
          evidence: {
            dimension: dimName,
            sample_count: scores.length,
            mean: Math.round(mean * 100) / 100,
            std_dev: Math.round(stdDev * 100) / 100,
          },
          priority: Math.min(90, 50 + stdDev),
        });
      }

      // Check predictive accuracy (correlation with gate outcomes)
      const passed = scores.filter(s => s.passed === true);
      const failed = scores.filter(s => s.passed === false);
      if (passed.length > 5 && failed.length > 5) {
        const passMean = passed.reduce((s, v) => s + v.score, 0) / passed.length;
        const failMean = failed.reduce((s, v) => s + v.score, 0) / failed.length;
        const separation = passMean - failMean;

        // Poor separation means dimension isn't predictive
        if (Math.abs(separation) < 10) {
          signals.push({
            type: 'calibration',
            title: `Low predictive power in ${dimName} dimension`,
            evidence: {
              dimension: dimName,
              pass_mean: Math.round(passMean * 100) / 100,
              fail_mean: Math.round(failMean * 100) / 100,
              separation: Math.round(separation * 100) / 100,
            },
            priority: 70,
          });
        }
      }
    }

    logger.log(`[calibration-reader] Found ${signals.length} signals from ${dimensionNames.size} dimensions`);
  } catch (err) {
    logger.warn(`[calibration-reader] Error: ${err.message}`);
  }

  return signals;
}
