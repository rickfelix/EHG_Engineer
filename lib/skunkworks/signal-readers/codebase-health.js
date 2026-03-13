/**
 * Signal Reader: Codebase Health
 * Reads codebase health scores to identify modules with degrading quality.
 *
 * SD: SD-AUTONOMOUS-SKUNKWORKS-RD-DEPARTMENT-ORCH-001-A (FR-003)
 */

/**
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<Array<{type: string, title: string, evidence: Object, priority: number}>>}
 */
export async function readCodebaseHealthSignals(deps) {
  const { supabase, logger = console } = deps;
  const signals = [];

  try {
    // Get recent health snapshots grouped by dimension
    const { data: snapshots, error } = await supabase
      .from('codebase_health_snapshots')
      .select('dimension, score, trend_direction, findings, finding_count, metadata, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.warn(`[health-reader] Failed to read snapshots: ${error.message}`);
      return signals;
    }

    if (!snapshots || snapshots.length === 0) {
      logger.log('[health-reader] No health snapshots found');
      return signals;
    }

    // Group by dimension — analyze trends
    const byDimension = {};
    for (const snap of snapshots) {
      if (!byDimension[snap.dimension]) byDimension[snap.dimension] = [];
      byDimension[snap.dimension].push(snap);
    }

    // Load config for thresholds
    const { data: configs } = await supabase
      .from('codebase_health_config')
      .select('dimension, threshold_warning, threshold_critical, enabled')
      .eq('enabled', true);

    const configMap = {};
    if (configs) {
      for (const c of configs) configMap[c.dimension] = c;
    }

    for (const [dimension, snaps] of Object.entries(byDimension)) {
      if (snaps.length < 2) continue;

      const latest = snaps[0];
      const config = configMap[dimension] || { threshold_warning: 70, threshold_critical: 50 };

      // Declining trend signal
      if (latest.trend_direction === 'declining') {
        const previous = snaps[1];
        const delta = latest.score - previous.score;

        signals.push({
          type: 'codebase_health',
          title: `Declining ${dimension} score (${latest.score}→${Math.round(latest.score + delta)})`,
          evidence: {
            dimension,
            current_score: latest.score,
            previous_score: previous.score,
            delta: Math.round(delta * 100) / 100,
            trend: 'declining',
            finding_count: latest.finding_count,
          },
          priority: latest.score <= config.threshold_critical ? 90
            : latest.score <= config.threshold_warning ? 70 : 50,
        });
      }

      // Critical threshold breach
      if (latest.score <= config.threshold_critical) {
        signals.push({
          type: 'codebase_health',
          title: `Critical ${dimension} score: ${latest.score}/100`,
          evidence: {
            dimension,
            score: latest.score,
            threshold: config.threshold_critical,
            findings_sample: (latest.findings || []).slice(0, 3),
          },
          priority: 85,
        });
      }
    }

    logger.log(`[health-reader] Found ${signals.length} signals from ${Object.keys(byDimension).length} dimensions`);
  } catch (err) {
    logger.warn(`[health-reader] Error: ${err.message}`);
  }

  return signals;
}
