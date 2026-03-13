/**
 * Calibration Signal Reader
 *
 * Reads calibration reports from EVA experiments to identify scoring dimensions
 * with high variance or low accuracy — these are proposal candidates.
 *
 * @module lib/skunkworks/signals/calibration-reader
 */

/**
 * @typedef {Object} Signal
 * @property {string} source - Signal reader name
 * @property {string} type - Signal classification
 * @property {string} title - Human-readable title
 * @property {string} description - Detailed description
 * @property {number} strength - Signal strength 0-100
 * @property {Object} metadata - Raw data backing the signal
 */

/**
 * Read calibration data and produce experiment proposal signals.
 *
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<Signal[]>}
 */
export async function readCalibrationSignals(deps) {
  const { supabase, logger } = deps;
  const signals = [];

  try {
    // Query recent experiment telemetry for gate survival patterns
    const { data: telemetry, error: telErr } = await supabase
      .from('stage_zero_experiment_telemetry')
      .select('venture_id, synthesis_score, kill_gate_stage, gate_passed, dimension_scores')
      .order('created_at', { ascending: false })
      .limit(200);

    if (telErr) {
      logger.warn('Calibration reader: telemetry query failed:', telErr.message);
      return signals;
    }

    if (!telemetry || telemetry.length === 0) {
      logger.info('Calibration reader: no telemetry data found');
      return signals;
    }

    // Analyze gate survival rates by stage
    const stageStats = {};
    for (const row of telemetry) {
      const stage = row.kill_gate_stage || 'unknown';
      if (!stageStats[stage]) stageStats[stage] = { total: 0, passed: 0, failed: 0 };
      stageStats[stage].total++;
      if (row.gate_passed) stageStats[stage].passed++;
      else stageStats[stage].failed++;
    }

    // Signal: stages with very high or very low survival rates
    for (const [stage, stats] of Object.entries(stageStats)) {
      if (stats.total < 5) continue; // Not enough data
      const survivalRate = stats.passed / stats.total;

      if (survivalRate < 0.3) {
        signals.push({
          source: 'calibration',
          type: 'high_kill_rate',
          title: `Stage ${stage} has ${Math.round(survivalRate * 100)}% survival rate`,
          description: `Gate at stage ${stage} is killing ${stats.failed}/${stats.total} ventures. ` +
            'This may indicate overly strict thresholds or a systematic scoring issue worth investigating.',
          strength: Math.round((1 - survivalRate) * 80),
          metadata: { stage, ...stats, survivalRate },
        });
      } else if (survivalRate > 0.95) {
        signals.push({
          source: 'calibration',
          type: 'rubber_stamp_gate',
          title: `Stage ${stage} gate is rubber-stamping (${Math.round(survivalRate * 100)}% pass)`,
          description: `Gate at stage ${stage} passes almost everything (${stats.passed}/${stats.total}). ` +
            'Experiment: tighten thresholds or add new scoring dimensions to improve signal.',
          strength: Math.round(survivalRate * 60),
          metadata: { stage, ...stats, survivalRate },
        });
      }
    }

    // Analyze dimension score variance
    const dimensionValues = {};
    for (const row of telemetry) {
      if (!row.dimension_scores || typeof row.dimension_scores !== 'object') continue;
      for (const [dim, score] of Object.entries(row.dimension_scores)) {
        if (typeof score !== 'number') continue;
        if (!dimensionValues[dim]) dimensionValues[dim] = [];
        dimensionValues[dim].push(score);
      }
    }

    for (const [dim, values] of Object.entries(dimensionValues)) {
      if (values.length < 10) continue;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      const stddev = Math.sqrt(variance);
      const cv = mean > 0 ? stddev / mean : 0;

      // High coefficient of variation = dimension is noisy
      if (cv > 0.5) {
        signals.push({
          source: 'calibration',
          type: 'high_variance_dimension',
          title: `Dimension "${dim}" has high variance (CV=${cv.toFixed(2)})`,
          description: `Scoring dimension "${dim}" has coefficient of variation ${cv.toFixed(2)} ` +
            `across ${values.length} samples. Experiment: investigate if this dimension ` +
            'is measuring signal or noise.',
          strength: Math.min(90, Math.round(cv * 60)),
          metadata: { dimension: dim, mean, stddev, cv, sampleSize: values.length },
        });
      }
    }

    logger.info(`Calibration reader: produced ${signals.length} signals from ${telemetry.length} telemetry rows`);
  } catch (err) {
    logger.error('Calibration reader failed:', err.message);
  }

  return signals;
}
