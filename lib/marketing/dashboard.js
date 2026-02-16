/**
 * Marketing Dashboard
 *
 * Aggregates marketing metrics for venture dashboards.
 * Combines content pipeline stats, channel performance, and feedback loop results.
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-L
 *
 * @module lib/marketing/dashboard
 */

// ── Dashboard Metric Types ──────────────────────────────

export const METRIC_TYPE = Object.freeze({
  CONTENT_GENERATED: 'content_generated',
  CONTENT_PUBLISHED: 'content_published',
  IMPRESSIONS: 'impressions',
  CLICKS: 'clicks',
  CONVERSIONS: 'conversions',
  SPEND: 'spend',
  REVENUE: 'revenue',
  ROI: 'roi',
  ENGAGEMENT_RATE: 'engagement_rate',
});

// ── Dashboard Builder ───────────────────────────────────

/**
 * Build a marketing dashboard summary for a venture.
 *
 * @param {object} params
 * @param {object} params.supabase - Supabase client
 * @param {string} params.ventureId - Venture UUID
 * @param {string} [params.period='7d'] - Time period ('24h', '7d', '30d', '90d')
 * @returns {Promise<DashboardData>}
 */
export async function buildDashboard({ supabase, ventureId, period = '7d' }) {
  const since = getPeriodStart(period);

  const [pipelineStats, channelMetrics, feedbackCycles, campaignSummary] = await Promise.all([
    getPipelineStats(supabase, ventureId, since),
    getChannelMetrics(supabase, ventureId, since),
    getFeedbackCycles(supabase, ventureId, since),
    getCampaignSummary(supabase, ventureId, since),
  ]);

  const totals = computeTotals(channelMetrics);

  return {
    ventureId,
    period,
    generatedAt: new Date().toISOString(),
    pipeline: pipelineStats,
    channels: channelMetrics,
    feedbackCycles,
    campaigns: campaignSummary,
    totals,
    healthScore: computeHealthScore(totals, pipelineStats),
  };
}

/**
 * Get campaign metrics for display.
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<Array>}
 */
export async function getCampaigns(supabase, ventureId) {
  const { data } = await supabase
    .from('marketing_campaigns')
    .select('id, name, status, channel, budget, spend, impressions, clicks, conversions, created_at')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(20);

  return (data || []).map(c => ({
    ...c,
    roi: c.spend > 0 ? ((c.conversions * 50) - c.spend) / c.spend : 0,
    ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
    conversionRate: c.clicks > 0 ? c.conversions / c.clicks : 0,
  }));
}

// ── Private Helpers ─────────────────────────────────────

function getPeriodStart(period) {
  const now = new Date();
  const ms = {
    '24h': 86_400_000,
    '7d': 604_800_000,
    '30d': 2_592_000_000,
    '90d': 7_776_000_000,
  };
  return new Date(now.getTime() - (ms[period] || ms['7d'])).toISOString();
}

async function getPipelineStats(supabase, ventureId, since) {
  const { data } = await supabase
    .from('marketing_pipeline_runs')
    .select('*')
    .eq('venture_id', ventureId)
    .gte('started_at', since)
    .order('started_at', { ascending: false });

  const runs = data || [];
  return {
    totalRuns: runs.length,
    totalGenerated: runs.reduce((s, r) => s + (r.total_generated || 0), 0),
    totalPublished: runs.reduce((s, r) => s + (r.total_published || 0), 0),
    totalFailed: runs.reduce((s, r) => s + (r.total_failed || 0), 0),
    lastRun: runs[0]?.started_at || null,
  };
}

async function getChannelMetrics(supabase, ventureId, since) {
  const { data } = await supabase
    .from('marketing_channel_metrics')
    .select('*')
    .eq('venture_id', ventureId)
    .gte('measured_at', since)
    .order('measured_at', { ascending: false });

  return data || [];
}

async function getFeedbackCycles(supabase, ventureId, since) {
  const { data } = await supabase
    .from('marketing_feedback_cycles')
    .select('analyzed_at, channel_count, adjustment_count, summary')
    .eq('venture_id', ventureId)
    .gte('analyzed_at', since)
    .order('analyzed_at', { ascending: false })
    .limit(10);

  return data || [];
}

async function getCampaignSummary(supabase, ventureId, since) {
  const { data } = await supabase
    .from('marketing_campaigns')
    .select('id, name, status, channel, budget, spend, impressions, clicks, conversions')
    .eq('venture_id', ventureId)
    .gte('created_at', since);

  const campaigns = data || [];
  return {
    totalCampaigns: campaigns.length,
    activeCampaigns: campaigns.filter(c => c.status === 'active').length,
    totalSpend: campaigns.reduce((s, c) => s + (c.spend || 0), 0),
    totalImpressions: campaigns.reduce((s, c) => s + (c.impressions || 0), 0),
    totalClicks: campaigns.reduce((s, c) => s + (c.clicks || 0), 0),
    totalConversions: campaigns.reduce((s, c) => s + (c.conversions || 0), 0),
  };
}

function computeTotals(channelMetrics) {
  if (channelMetrics.length === 0) {
    return { impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0, roi: 0, avgEngagement: 0 };
  }

  const impressions = channelMetrics.reduce((s, m) => s + (m.impressions || 0), 0);
  const clicks = channelMetrics.reduce((s, m) => s + (m.clicks || 0), 0);
  const conversions = channelMetrics.reduce((s, m) => s + (m.conversions || 0), 0);
  const spend = channelMetrics.reduce((s, m) => s + (m.spend || 0), 0);
  const revenue = channelMetrics.reduce((s, m) => s + (m.revenue || 0), 0);
  const totalEngagement = channelMetrics.reduce((s, m) => s + (m.engagement_rate || 0), 0);

  return {
    impressions,
    clicks,
    conversions,
    spend,
    revenue,
    roi: spend > 0 ? (revenue - spend) / spend : 0,
    avgEngagement: channelMetrics.length > 0 ? totalEngagement / channelMetrics.length : 0,
  };
}

function computeHealthScore(totals, pipeline) {
  let score = 50; // Base score

  // Pipeline activity bonus
  if (pipeline.totalRuns > 0) score += 10;
  if (pipeline.totalPublished > 0) score += 10;

  // Positive ROI bonus
  if (totals.roi > 0) score += 15;
  if (totals.roi > 0.5) score += 5;

  // Engagement bonus
  if (totals.avgEngagement > 0.03) score += 10;

  // Failure penalty
  if (pipeline.totalFailed > pipeline.totalPublished) score -= 15;

  return Math.max(0, Math.min(100, score));
}
