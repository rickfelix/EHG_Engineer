/**
 * Venture Portfolio Signal Reader
 *
 * Scans venture stages and metadata to identify ventures stuck in early stages
 * or with stale evaluations — proposes re-evaluation experiments.
 *
 * @module lib/skunkworks/signals/venture-portfolio-reader
 */

const STALE_DAYS = 30;

/**
 * Read venture portfolio data and produce experiment proposal signals.
 *
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<import('./calibration-reader.js').Signal[]>}
 */
export async function readVenturePortfolioSignals(deps) {
  const { supabase, logger } = deps;
  const signals = [];

  try {
    // Get ventures with their current stage and last evaluation date
    const { data: ventures, error: ventErr } = await supabase
      .from('ventures')
      .select('id, name, current_stage, status, updated_at, created_at')
      .in('status', ['active', 'evaluating'])
      .order('updated_at', { ascending: true })
      .limit(100);

    if (ventErr) {
      logger.warn('Venture reader: query failed:', ventErr.message);
      return signals;
    }

    if (!ventures || ventures.length === 0) {
      logger.info('Venture reader: no active ventures found');
      return signals;
    }

    const now = Date.now();

    // Identify stale ventures (not updated in STALE_DAYS)
    const staleVentures = ventures.filter(v => {
      const daysSinceUpdate = (now - new Date(v.updated_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate > STALE_DAYS;
    });

    if (staleVentures.length > 0) {
      signals.push({
        source: 'venture_portfolio',
        type: 'stale_ventures',
        title: `${staleVentures.length} ventures stale (>${STALE_DAYS} days without update)`,
        description: `${staleVentures.length} active ventures have not been updated in over ` +
          `${STALE_DAYS} days. Experiment: batch re-evaluation to surface any that should advance ` +
          `or be killed. Ventures: ${staleVentures.slice(0, 5).map(v => v.name).join(', ')}` +
          (staleVentures.length > 5 ? ` and ${staleVentures.length - 5} more` : ''),
        strength: Math.min(90, 40 + staleVentures.length * 5),
        metadata: {
          count: staleVentures.length,
          ventureIds: staleVentures.map(v => v.id),
          ventureNames: staleVentures.map(v => v.name),
        },
      });
    }

    // Identify ventures stuck in early stages (stage <= 3 for > 14 days)
    const earlyStageVentures = ventures.filter(v => {
      const stage = typeof v.current_stage === 'number' ? v.current_stage : 0;
      const daysSinceCreation = (now - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return stage <= 3 && daysSinceCreation > 14;
    });

    if (earlyStageVentures.length > 0) {
      signals.push({
        source: 'venture_portfolio',
        type: 'stuck_early_stage',
        title: `${earlyStageVentures.length} ventures stuck in early stages`,
        description: `${earlyStageVentures.length} ventures are still in stage ≤3 after 14+ days. ` +
          'Experiment: analyze common blockers in early-stage progression and propose pipeline optimizations.',
        strength: Math.min(85, 35 + earlyStageVentures.length * 4),
        metadata: {
          count: earlyStageVentures.length,
          ventureNames: earlyStageVentures.map(v => v.name),
          stages: earlyStageVentures.map(v => ({ name: v.name, stage: v.current_stage })),
        },
      });
    }

    // Portfolio concentration analysis
    const stageCounts = {};
    for (const v of ventures) {
      const stage = v.current_stage ?? 'unknown';
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    }

    const totalVentures = ventures.length;
    for (const [stage, count] of Object.entries(stageCounts)) {
      const concentration = count / totalVentures;
      if (concentration > 0.5 && totalVentures >= 5) {
        signals.push({
          source: 'venture_portfolio',
          type: 'stage_concentration',
          title: `${Math.round(concentration * 100)}% of ventures concentrated at stage ${stage}`,
          description: `${count}/${totalVentures} active ventures are at stage ${stage}. ` +
            'This concentration may indicate a pipeline bottleneck worth investigating.',
          strength: Math.round(concentration * 70),
          metadata: { stage, count, totalVentures, concentration, allStageCounts: stageCounts },
        });
      }
    }

    logger.info(`Venture reader: produced ${signals.length} signals from ${ventures.length} ventures`);
  } catch (err) {
    logger.error('Venture reader failed:', err.message);
  }

  return signals;
}
