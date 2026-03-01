/**
 * Chairman Governance Panels — Dashboard Data Aggregation
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-03-A
 *
 * Aggregates portfolio risk, decision pipeline, and SD lifecycle
 * data into panel-ready structures for chairman dashboard consumption.
 * Pure data layer — no UI rendering, no side effects beyond reads.
 *
 * @module lib/eva/chairman-governance-panels
 */

const STALENESS_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ── Portfolio Risk Panel ─────────────────────────

/**
 * Aggregate portfolio risk data per venture.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ panel: Object, error?: string }>}
 */
export async function getPortfolioRiskPanel(supabase, options = {}) {
  const { logger = console } = options;

  if (!supabase) {
    return emptyPanel('portfolio_risk', 'No supabase client');
  }

  try {
    // Get all active SDs grouped by venture
    const { data: sds, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, sd_type, priority, venture_id, current_phase, progress')
      .in('status', ['draft', 'planning', 'in_progress', 'blocked']);

    if (sdError) {
      logger.warn(`[GovernancePanels] SD query failed: ${sdError.message}`);
      return emptyPanel('portfolio_risk', sdError.message);
    }

    // Get latest vision scores for risk assessment
    const { data: scores, error: scoreError } = await supabase
      .from('eva_vision_scores')
      .select('sd_id, total_score, threshold_action, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (scoreError) {
      logger.warn(`[GovernancePanels] Score query failed: ${scoreError.message}`);
    }

    const scoreMap = buildScoreMap(scores || []);
    const ventures = groupByVenture(sds || [], scoreMap);

    const atRiskCount = ventures.reduce(
      (sum, v) => sum + v.atRiskSDs,
      0,
    );

    const overallRisk = calculateOverallRisk(ventures);

    return {
      panel: {
        type: 'portfolio_risk',
        overallRiskScore: overallRisk,
        totalVentures: ventures.length,
        totalActiveSDs: (sds || []).length,
        atRiskSDCount: atRiskCount,
        ventures,
        generatedAt: new Date().toISOString(),
        stale: false,
      },
    };
  } catch (err) {
    logger.warn(`[GovernancePanels] Portfolio risk error: ${err.message}`);
    return emptyPanel('portfolio_risk', err.message);
  }
}

// ── Decision Pipeline Panel ──────────────────────

/**
 * Aggregate decision pipeline status from chairman_decisions.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ panel: Object, error?: string }>}
 */
export async function getDecisionPipelinePanel(supabase, options = {}) {
  const { logger = console } = options;

  if (!supabase) {
    return emptyPanel('decision_pipeline', 'No supabase client');
  }

  try {
    const { data: decisions, error: decError } = await supabase
      .from('chairman_decisions')
      .select('id, decision_type, status, created_at, resolved_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (decError) {
      logger.warn(`[GovernancePanels] Decision query failed: ${decError.message}`);
      return emptyPanel('decision_pipeline', decError.message);
    }

    const all = decisions || [];
    const statusCounts = countByField(all, 'status');
    const typeCounts = countByField(all, 'decision_type');

    // 7-day trend
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recent = all.filter((d) => d.created_at >= sevenDaysAgo);
    const recentStatusCounts = countByField(recent, 'status');

    // Average resolution time (for resolved decisions)
    const resolved = all.filter((d) => d.resolved_at);
    const avgResolutionMs = resolved.length > 0
      ? resolved.reduce((sum, d) => {
        return sum + (new Date(d.resolved_at) - new Date(d.created_at));
      }, 0) / resolved.length
      : 0;

    return {
      panel: {
        type: 'decision_pipeline',
        totalDecisions: all.length,
        statusCounts,
        typeCounts,
        trend7d: {
          total: recent.length,
          statusCounts: recentStatusCounts,
        },
        avgResolutionHours: Math.round(avgResolutionMs / (1000 * 60 * 60) * 10) / 10,
        generatedAt: new Date().toISOString(),
        stale: false,
      },
    };
  } catch (err) {
    logger.warn(`[GovernancePanels] Decision pipeline error: ${err.message}`);
    return emptyPanel('decision_pipeline', err.message);
  }
}

// ── SD Lifecycle Panel ───────────────────────────

/**
 * Aggregate SD lifecycle distribution and velocity.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ panel: Object, error?: string }>}
 */
export async function getSDLifecyclePanel(supabase, options = {}) {
  const { logger = console } = options;

  if (!supabase) {
    return emptyPanel('sd_lifecycle', 'No supabase client');
  }

  try {
    const { data: sds, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, current_phase, progress, created_at, completion_date')
      .order('created_at', { ascending: false })
      .limit(500);

    if (sdError) {
      logger.warn(`[GovernancePanels] SD lifecycle query failed: ${sdError.message}`);
      return emptyPanel('sd_lifecycle', sdError.message);
    }

    const all = sds || [];
    const statusDistribution = countByField(all, 'status');
    const phaseDistribution = countByField(all, 'current_phase');

    // Completion velocity (SDs completed in last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentlyCompleted = all.filter(
      (sd) => sd.status === 'completed' && sd.completion_date && sd.completion_date >= thirtyDaysAgo,
    );

    // Average progress for in-progress SDs
    const inProgress = all.filter((sd) => sd.status === 'in_progress');
    const avgProgress = inProgress.length > 0
      ? Math.round(inProgress.reduce((sum, sd) => sum + (sd.progress || 0), 0) / inProgress.length)
      : 0;

    return {
      panel: {
        type: 'sd_lifecycle',
        totalSDs: all.length,
        statusDistribution,
        phaseDistribution,
        completedLast30d: recentlyCompleted.length,
        inProgressCount: inProgress.length,
        avgInProgressPercent: avgProgress,
        generatedAt: new Date().toISOString(),
        stale: false,
      },
    };
  } catch (err) {
    logger.warn(`[GovernancePanels] SD lifecycle error: ${err.message}`);
    return emptyPanel('sd_lifecycle', err.message);
  }
}

/**
 * Check if panel data is stale based on generatedAt timestamp.
 *
 * @param {Object} panel - Panel data with generatedAt field
 * @param {number} [thresholdMs] - Staleness threshold in ms
 * @returns {boolean}
 */
export function isPanelStale(panel, thresholdMs = STALENESS_THRESHOLD_MS) {
  if (!panel || !panel.generatedAt) return true;
  return Date.now() - new Date(panel.generatedAt).getTime() > thresholdMs;
}

// ── Internal Helpers ─────────────────────────────

function emptyPanel(type, error) {
  return {
    panel: {
      type,
      generatedAt: new Date().toISOString(),
      stale: false,
      empty: true,
    },
    error,
  };
}

function buildScoreMap(scores) {
  const map = new Map();
  for (const s of scores) {
    if (!map.has(s.sd_id)) {
      map.set(s.sd_id, s);
    }
  }
  return map;
}

function groupByVenture(sds, scoreMap) {
  const ventureMap = new Map();

  for (const sd of sds) {
    const vid = sd.venture_id || 'unassigned';
    if (!ventureMap.has(vid)) {
      ventureMap.set(vid, { ventureId: vid, sds: [], atRiskSDs: 0, riskScore: 0 });
    }

    const venture = ventureMap.get(vid);
    const score = scoreMap.get(sd.id);
    const isAtRisk = sd.status === 'blocked'
      || sd.priority === 'critical'
      || (score && score.total_score < 70);

    if (isAtRisk) venture.atRiskSDs++;
    venture.sds.push({
      sdKey: sd.sd_key,
      status: sd.status,
      phase: sd.current_phase,
      progress: sd.progress,
      visionScore: score ? score.total_score : null,
    });
  }

  // Calculate per-venture risk
  for (const venture of ventureMap.values()) {
    venture.totalSDs = venture.sds.length;
    venture.riskScore = venture.totalSDs > 0
      ? Math.round((venture.atRiskSDs / venture.totalSDs) * 100)
      : 0;
  }

  return Array.from(ventureMap.values());
}

function calculateOverallRisk(ventures) {
  if (ventures.length === 0) return 0;
  const totalSDs = ventures.reduce((s, v) => s + v.totalSDs, 0);
  const totalAtRisk = ventures.reduce((s, v) => s + v.atRiskSDs, 0);
  return totalSDs > 0 ? Math.round((totalAtRisk / totalSDs) * 100) : 0;
}

function countByField(items, field) {
  const counts = {};
  for (const item of items) {
    const val = item[field] || 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}
