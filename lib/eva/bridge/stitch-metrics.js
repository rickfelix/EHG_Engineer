/**
 * Stitch Generation Metrics - Query Helpers & Degradation Detection
 * SD: SD-STITCH-GENERATION-OBSERVABILITY-AND-ORCH-001-C
 *
 * Provides aggregated views of stitch_generation_metrics data for:
 * - Per-venture health summaries
 * - Degradation detection (7d vs 30d baseline)
 * - Fleet-wide Stitch health overview
 * - Auto-SD suggestion for persistent degradation
 *
 * @module eva/bridge/stitch-metrics
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';

const DEGRADATION_THRESHOLD = parseFloat(process.env.STITCH_DEGRADATION_THRESHOLD || '0.80');
const MIN_SAMPLE_SIZE = parseInt(process.env.STITCH_MIN_SAMPLE_SIZE || '10', 10);

/**
 * Get aggregated Stitch metrics for a single venture.
 * @param {string} ventureId - UUID of the venture
 * @param {number} [days=30] - Time window in days
 * @returns {Promise<object|null>}
 */
export async function getVentureMetrics(ventureId, days = 30) {
  const supabase = createSupabaseServiceClient();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data, error } = await supabase
    .from('stitch_generation_metrics')
    .select('status, attempt_count, duration_ms, error_category')
    .eq('venture_id', ventureId)
    .gte('created_at', since);

  if (error || !data || data.length === 0) return null;

  const total = data.length;
  const successes = data.filter(r => r.status === 'success' || r.status === 'fired').length;
  const errors = data.filter(r => r.status === 'error').length;
  const retries = data.filter(r => r.attempt_count > 1).length;
  const durations = data.filter(r => r.duration_ms > 0).map(r => r.duration_ms);

  const errorBreakdown = {};
  data.filter(r => r.error_category).forEach(r => {
    errorBreakdown[r.error_category] = (errorBreakdown[r.error_category] || 0) + 1;
  });

  return {
    venture_id: ventureId,
    total_screens: total,
    success_rate: total > 0 ? Math.round((successes / total) * 100) : 0,
    retry_rate: total > 0 ? Math.round((retries / total) * 100) : 0,
    error_count: errors,
    avg_duration_ms: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    error_breakdown: errorBreakdown,
    period_days: days
  };
}

/**
 * Detect degradation by comparing recent (7d) vs baseline (30d) success rates.
 * @returns {Promise<Array<{venture_id, venture_name, recent_rate, baseline_rate, degraded}>>}
 */
export async function detectDegradation() {
  const supabase = createSupabaseServiceClient();
  const now = Date.now();
  const since7d = new Date(now - 7 * 86400000).toISOString();
  const since30d = new Date(now - 30 * 86400000).toISOString();

  // Get all ventures with metrics in the last 30 days
  const { data: metrics, error } = await supabase
    .from('stitch_generation_metrics')
    .select('venture_id, status, created_at')
    .gte('created_at', since30d);

  if (error || !metrics || metrics.length === 0) return [];

  // Group by venture
  const byVenture = {};
  for (const row of metrics) {
    if (!row.venture_id) continue;
    if (!byVenture[row.venture_id]) byVenture[row.venture_id] = [];
    byVenture[row.venture_id].push(row);
  }

  const results = [];
  for (const [ventureId, rows] of Object.entries(byVenture)) {
    if (rows.length < MIN_SAMPLE_SIZE) continue;

    const recent = rows.filter(r => r.created_at >= since7d);
    const isSuccess = r => r.status === 'success' || r.status === 'fired';

    const baselineRate = rows.length > 0 ? rows.filter(isSuccess).length / rows.length : 1;
    const recentRate = recent.length > 0 ? recent.filter(isSuccess).length / recent.length : baselineRate;

    const degraded = recentRate < DEGRADATION_THRESHOLD && recentRate < baselineRate * 0.9;

    if (degraded) {
      results.push({
        venture_id: ventureId,
        recent_rate: Math.round(recentRate * 100),
        baseline_rate: Math.round(baselineRate * 100),
        recent_count: recent.length,
        baseline_count: rows.length,
        degraded: true
      });
    }
  }

  return results;
}

/**
 * Get fleet-wide Stitch health summary.
 * @param {number} [days=7] - Time window
 * @returns {Promise<object>}
 */
export async function getFleetHealth(days = 7) {
  const supabase = createSupabaseServiceClient();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data, error } = await supabase
    .from('stitch_generation_metrics')
    .select('venture_id, status, duration_ms')
    .gte('created_at', since);

  if (error || !data || data.length === 0) {
    return { total_screens: 0, success_rate: 0, ventures_active: 0, period_days: days };
  }

  const total = data.length;
  const successes = data.filter(r => r.status === 'success' || r.status === 'fired').length;
  const ventures = new Set(data.filter(r => r.venture_id).map(r => r.venture_id));
  const durations = data.filter(r => r.duration_ms > 0).map(r => r.duration_ms);

  return {
    total_screens: total,
    success_rate: total > 0 ? Math.round((successes / total) * 100) : 0,
    ventures_active: ventures.size,
    avg_duration_ms: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    period_days: days
  };
}

/**
 * Generate auto-SD suggestion for degraded ventures.
 * @param {Array} degradedVentures - Output from detectDegradation()
 * @returns {Array<{title: string, scope: string}>}
 */
export function suggestSDs(degradedVentures) {
  if (!degradedVentures || degradedVentures.length === 0) return [];

  return degradedVentures.map(v => ({
    title: `Fix Stitch Generation Degradation for Venture ${v.venture_id.slice(0, 8)}`,
    scope: `Investigate and fix Stitch screen generation success rate drop from ${v.baseline_rate}% to ${v.recent_rate}% (${v.recent_count} screens in last 7d). Check prompt lengths, retry patterns, and API errors.`,
    venture_id: v.venture_id,
    severity: v.recent_rate < 50 ? 'critical' : 'high'
  }));
}

/**
 * Build the stitch_health section for the Friday meeting agenda.
 * @returns {Promise<object>}
 */
export async function gatherStitchHealth() {
  const [fleet, degraded] = await Promise.all([
    getFleetHealth(7),
    detectDegradation()
  ]);

  const suggestions = suggestSDs(degraded);

  return {
    fleet,
    degraded_ventures: degraded,
    sd_suggestions: suggestions,
    has_issues: degraded.length > 0
  };
}

/**
 * Render the stitch_health section for Friday meeting display.
 * @param {object} data - Output from gatherStitchHealth()
 * @returns {string}
 */
export function renderStitchHealth(data) {
  const lines = [];
  lines.push('');
  lines.push('  SECTION 5c: STITCH GENERATION HEALTH');
  lines.push('  ' + '─'.repeat(45));

  if (data.fleet.total_screens === 0) {
    lines.push('  No Stitch generation data in the last 7 days.');
    return lines.join('\n');
  }

  lines.push(`  Fleet: ${data.fleet.success_rate}% success rate | ${data.fleet.total_screens} screens | ${data.fleet.ventures_active} ventures | avg ${data.fleet.avg_duration_ms}ms`);

  if (data.degraded_ventures.length > 0) {
    lines.push('');
    lines.push('  ⚠️  DEGRADATION DETECTED:');
    for (const v of data.degraded_ventures) {
      lines.push(`    • Venture ${v.venture_id.slice(0, 8)}: ${v.recent_rate}% (was ${v.baseline_rate}%) — ${v.recent_count} screens in 7d`);
    }
  }

  if (data.sd_suggestions.length > 0) {
    lines.push('');
    lines.push('  💡 SUGGESTED SDs:');
    for (const s of data.sd_suggestions) {
      lines.push(`    • [${s.severity.toUpperCase()}] ${s.title}`);
    }
  }

  return lines.join('\n');
}
