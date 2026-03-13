/**
 * Codebase Health Signal Reader
 *
 * Reads codebase health scores to identify modules with degrading quality —
 * proposes investigation experiments.
 *
 * @module lib/skunkworks/signals/codebase-health-reader
 */

/**
 * Read codebase health snapshots and produce experiment proposal signals.
 *
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<import('./calibration-reader.js').Signal[]>}
 */
export async function readCodebaseHealthSignals(deps) {
  const { supabase, logger } = deps;
  const signals = [];

  try {
    // Get latest snapshot per dimension
    const { data: snapshots, error: snapErr } = await supabase
      .from('codebase_health_snapshots')
      .select('dimension, score, trend_direction, findings, finding_count, metadata, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(50);

    if (snapErr) {
      logger.warn('Health reader: snapshot query failed:', snapErr.message);
      return signals;
    }

    if (!snapshots || snapshots.length === 0) {
      logger.info('Health reader: no health snapshots found');
      return signals;
    }

    // Deduplicate to latest per dimension
    const latestByDimension = new Map();
    for (const snap of snapshots) {
      if (!latestByDimension.has(snap.dimension)) {
        latestByDimension.set(snap.dimension, snap);
      }
    }

    // Load config thresholds
    const { data: configs } = await supabase
      .from('codebase_health_config')
      .select('dimension, threshold_warning, threshold_critical');

    const configMap = new Map();
    if (configs) {
      for (const c of configs) configMap.set(c.dimension, c);
    }

    for (const [dimension, snap] of latestByDimension) {
      const config = configMap.get(dimension);

      // Signal: score below critical threshold
      if (config && snap.score <= config.threshold_critical) {
        signals.push({
          source: 'codebase_health',
          type: 'critical_degradation',
          title: `${dimension} health critical: ${snap.score}/100`,
          description: `Codebase health dimension "${dimension}" scored ${snap.score}/100, ` +
            `below critical threshold of ${config.threshold_critical}. ` +
            `${snap.finding_count} findings detected. Trend: ${snap.trend_direction}.`,
          strength: Math.round(Math.max(0, 100 - snap.score)),
          metadata: { dimension, score: snap.score, trend: snap.trend_direction, findings: snap.finding_count },
        });
      }
      // Signal: declining trend
      else if (snap.trend_direction === 'declining') {
        signals.push({
          source: 'codebase_health',
          type: 'declining_trend',
          title: `${dimension} health declining: ${snap.score}/100`,
          description: `Codebase health dimension "${dimension}" is on a declining trend ` +
            `(current: ${snap.score}/100). Experiment: root-cause the degradation before it hits critical.`,
          strength: Math.round(Math.max(0, 80 - snap.score)),
          metadata: { dimension, score: snap.score, trend: snap.trend_direction, findings: snap.finding_count },
        });
      }
    }

    logger.info(`Health reader: produced ${signals.length} signals from ${latestByDimension.size} dimensions`);
  } catch (err) {
    logger.error('Health reader failed:', err.message);
  }

  return signals;
}
