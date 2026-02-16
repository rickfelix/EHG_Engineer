/**
 * Marketing Feedback Loop
 *
 * Closes the analytics-to-strategy loop: reads PostHog/metrics data,
 * evaluates channel performance, and adjusts marketing strategy.
 *
 * Feedback cycle:
 *   Metrics → Analysis → Strategy Adjustment → Content Re-generation
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-L
 *
 * @module lib/marketing/feedback-loop
 */

// ── Thresholds ──────────────────────────────────────────

const PERFORMANCE_THRESHOLDS = {
  engagement_rate: { low: 0.01, medium: 0.03, high: 0.05 },
  conversion_rate: { low: 0.005, medium: 0.02, high: 0.05 },
  click_through_rate: { low: 0.01, medium: 0.025, high: 0.05 },
  cost_per_acquisition: { low: 100, medium: 50, high: 20 }, // Lower is better
};

// ── Feedback Actions ────────────────────────────────────

export const FEEDBACK_ACTION = Object.freeze({
  INCREASE_BUDGET: 'increase_budget',
  DECREASE_BUDGET: 'decrease_budget',
  PAUSE_CHANNEL: 'pause_channel',
  ROTATE_CONTENT: 'rotate_content',
  EXPAND_AUDIENCE: 'expand_audience',
  NARROW_AUDIENCE: 'narrow_audience',
  NO_CHANGE: 'no_change',
});

// ── Feedback Loop ───────────────────────────────────────

/**
 * Analyze channel performance and generate strategy adjustments.
 *
 * @param {object} params
 * @param {object} params.supabase - Supabase client
 * @param {string} params.ventureId - Venture UUID
 * @param {object} [params.logger] - Logger
 * @returns {Promise<FeedbackResult>}
 */
export async function analyzeAndAdjust({ supabase, ventureId, logger = console }) {
  logger.log(`[FeedbackLoop] Analyzing performance for venture ${ventureId}`);

  // Step 1: Gather metrics per channel
  const channelMetrics = await gatherChannelMetrics(supabase, ventureId);

  if (channelMetrics.length === 0) {
    return {
      ventureId,
      analyzedAt: new Date().toISOString(),
      channelCount: 0,
      adjustments: [],
      summary: 'No metrics data available yet',
    };
  }

  // Step 2: Evaluate each channel
  const adjustments = [];

  for (const channel of channelMetrics) {
    const evaluation = evaluateChannel(channel);
    if (evaluation.action !== FEEDBACK_ACTION.NO_CHANGE) {
      adjustments.push({
        channelId: channel.channelId,
        channelName: channel.channelName,
        ...evaluation,
      });
    }
  }

  // Step 3: Apply adjustments
  for (const adj of adjustments) {
    await applyAdjustment(supabase, ventureId, adj, logger);
  }

  // Step 4: Record feedback cycle
  const result = {
    ventureId,
    analyzedAt: new Date().toISOString(),
    channelCount: channelMetrics.length,
    adjustments,
    summary: adjustments.length > 0
      ? `${adjustments.length} channel(s) adjusted`
      : 'All channels performing within thresholds',
  };

  await recordFeedbackCycle(supabase, ventureId, result);

  logger.log(`[FeedbackLoop] Complete: ${result.summary}`);
  return result;
}

/**
 * Get feedback loop history for a venture.
 * @param {object} supabase
 * @param {string} ventureId
 * @param {number} [limit=10]
 * @returns {Promise<Array>}
 */
export async function getFeedbackHistory(supabase, ventureId, limit = 10) {
  const { data } = await supabase
    .from('marketing_feedback_cycles')
    .select('*')
    .eq('venture_id', ventureId)
    .order('analyzed_at', { ascending: false })
    .limit(limit);

  return data || [];
}

// ── Channel Evaluation Logic ────────────────────────────

/**
 * Evaluate a single channel's performance.
 * @param {object} channel - Channel metrics
 * @returns {{action: string, reason: string, confidence: number}}
 */
export function evaluateChannel(channel) {
  const { engagementRate, conversionRate, clickThroughRate, costPerAcquisition, impressions } = channel;

  // Not enough data to evaluate
  if ((impressions || 0) < 100) {
    return { action: FEEDBACK_ACTION.NO_CHANGE, reason: 'Insufficient data', confidence: 0.1 };
  }

  // High CPA — decrease budget or pause
  if (costPerAcquisition && costPerAcquisition > PERFORMANCE_THRESHOLDS.cost_per_acquisition.low) {
    if (costPerAcquisition > PERFORMANCE_THRESHOLDS.cost_per_acquisition.low * 2) {
      return { action: FEEDBACK_ACTION.PAUSE_CHANNEL, reason: 'CPA critically high', confidence: 0.85 };
    }
    return { action: FEEDBACK_ACTION.DECREASE_BUDGET, reason: 'CPA above threshold', confidence: 0.7 };
  }

  // Low engagement — rotate content
  if (engagementRate && engagementRate < PERFORMANCE_THRESHOLDS.engagement_rate.low) {
    return { action: FEEDBACK_ACTION.ROTATE_CONTENT, reason: 'Low engagement rate', confidence: 0.65 };
  }

  // High conversion — increase budget
  if (conversionRate && conversionRate > PERFORMANCE_THRESHOLDS.conversion_rate.high) {
    return { action: FEEDBACK_ACTION.INCREASE_BUDGET, reason: 'High conversion rate', confidence: 0.8 };
  }

  // High CTR but low conversion — narrow audience
  if (clickThroughRate && clickThroughRate > PERFORMANCE_THRESHOLDS.click_through_rate.high
      && conversionRate && conversionRate < PERFORMANCE_THRESHOLDS.conversion_rate.low) {
    return { action: FEEDBACK_ACTION.NARROW_AUDIENCE, reason: 'High CTR but low conversion', confidence: 0.6 };
  }

  // Low CTR — expand audience or rotate content
  if (clickThroughRate && clickThroughRate < PERFORMANCE_THRESHOLDS.click_through_rate.low) {
    return { action: FEEDBACK_ACTION.EXPAND_AUDIENCE, reason: 'Low click-through rate', confidence: 0.55 };
  }

  return { action: FEEDBACK_ACTION.NO_CHANGE, reason: 'Performance within acceptable range', confidence: 0.5 };
}

// ── Private Helpers ─────────────────────────────────────

async function gatherChannelMetrics(supabase, ventureId) {
  const { data } = await supabase
    .from('marketing_channel_metrics')
    .select('*')
    .eq('venture_id', ventureId)
    .order('measured_at', { ascending: false });

  if (!data || data.length === 0) return [];

  // Deduplicate by channel (take most recent per channel)
  const byChannel = new Map();
  for (const row of data) {
    if (!byChannel.has(row.channel_id)) {
      byChannel.set(row.channel_id, {
        channelId: row.channel_id,
        channelName: row.channel_name || row.channel_id,
        impressions: row.impressions || 0,
        clicks: row.clicks || 0,
        conversions: row.conversions || 0,
        spend: row.spend || 0,
        revenue: row.revenue || 0,
        engagementRate: row.engagement_rate || 0,
        conversionRate: row.conversion_rate || 0,
        clickThroughRate: row.click_through_rate || 0,
        costPerAcquisition: row.cost_per_acquisition || 0,
        measuredAt: row.measured_at,
      });
    }
  }

  return Array.from(byChannel.values());
}

async function applyAdjustment(supabase, ventureId, adjustment, logger) {
  logger.log(`[FeedbackLoop] Applying ${adjustment.action} to ${adjustment.channelName}: ${adjustment.reason}`);

  await supabase.from('marketing_strategy_adjustments').insert({
    venture_id: ventureId,
    channel_id: adjustment.channelId,
    action: adjustment.action,
    reason: adjustment.reason,
    confidence: adjustment.confidence,
    applied_at: new Date().toISOString(),
  });
}

async function recordFeedbackCycle(supabase, ventureId, result) {
  await supabase.from('marketing_feedback_cycles').insert({
    venture_id: ventureId,
    analyzed_at: result.analyzedAt,
    channel_count: result.channelCount,
    adjustment_count: result.adjustments.length,
    summary: result.summary,
    adjustments: result.adjustments,
  });
}
