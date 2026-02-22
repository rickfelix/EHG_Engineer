/**
 * EVA Success Metrics Collector
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-011 / FR-002
 *
 * Queries the database for 6 quantifiable success metrics with
 * baselines, targets, and trend directions.
 *
 * Usage:
 *   node scripts/eva/success-metrics-collector.mjs
 *
 * Output: JSON to stdout with metrics array and overall health
 * Exit: 0 on success, 1 on error
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log(JSON.stringify({ error: true, message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment', exit_code: 1 }, null, 2));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Get the date 30 days ago in ISO format
 */
function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

/**
 * Determine trend direction from two values
 */
function trend(current, previous) {
  if (previous === null || previous === undefined) return 'neutral';
  if (current > previous) return 'improving';
  if (current < previous) return 'declining';
  return 'stable';
}

/**
 * Metric 1: SD completion rate (completed/total) for last 30 days
 */
async function sdCompletionRate() {
  const since = thirtyDaysAgo();

  const { count: total } = await supabase
    .from('strategic_directives_v2')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', since);

  const { count: completed } = await supabase
    .from('strategic_directives_v2')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', since)
    .eq('status', 'completed');

  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    name: 'sd_completion_rate',
    value: rate,
    unit: 'percent',
    target: 80,
    baseline: 0,
    trend: 'neutral',
    measured_at: new Date().toISOString(),
    detail: { total: total || 0, completed: completed || 0 }
  };
}

/**
 * Metric 2: Average vision score across last 5 scoring runs
 */
async function avgVisionScore() {
  const { data, error } = await supabase
    .from('eva_vision_scores')
    .select('total_score, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    return {
      name: 'avg_vision_score',
      value: null,
      unit: 'score',
      target: 93,
      baseline: 50,
      trend: 'neutral',
      measured_at: new Date().toISOString(),
      detail: { scores_found: 0 }
    };
  }

  const last5 = data.slice(0, 5);
  const prev5 = data.slice(5, 10);

  const avgLast = Math.round(last5.reduce((s, d) => s + (d.total_score || 0), 0) / last5.length);
  const avgPrev = prev5.length > 0
    ? Math.round(prev5.reduce((s, d) => s + (d.total_score || 0), 0) / prev5.length)
    : null;

  return {
    name: 'avg_vision_score',
    value: avgLast,
    unit: 'score',
    target: 93,
    baseline: 50,
    trend: trend(avgLast, avgPrev),
    measured_at: new Date().toISOString(),
    detail: { last5_avg: avgLast, prev5_avg: avgPrev, scores_found: data.length }
  };
}

/**
 * Metric 3: Gate pass rate across last 20 handoffs
 */
async function gatePassRate() {
  const { data, error } = await supabase
    .from('leo_handoff_executions')
    .select('result, validation_score')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    return {
      name: 'gate_pass_rate',
      value: null,
      unit: 'percent',
      target: 85,
      baseline: 0,
      trend: 'neutral',
      measured_at: new Date().toISOString(),
      detail: { handoffs_found: 0 }
    };
  }

  const passed = data.filter(d => d.result === 'accepted' || d.result === 'success').length;
  const rate = Math.round((passed / data.length) * 100);

  // Compare first half vs second half for trend
  const half = Math.floor(data.length / 2);
  const recentPassed = data.slice(0, half).filter(d => d.result === 'accepted' || d.result === 'success').length;
  const olderPassed = data.slice(half).filter(d => d.result === 'accepted' || d.result === 'success').length;
  const recentRate = half > 0 ? (recentPassed / half) * 100 : 0;
  const olderRate = (data.length - half) > 0 ? (olderPassed / (data.length - half)) * 100 : 0;

  return {
    name: 'gate_pass_rate',
    value: rate,
    unit: 'percent',
    target: 85,
    baseline: 0,
    trend: trend(recentRate, olderRate),
    measured_at: new Date().toISOString(),
    detail: { total: data.length, passed, recent_rate: Math.round(recentRate), older_rate: Math.round(olderRate) }
  };
}

/**
 * Metric 4: Mean time to SD completion (minutes)
 */
async function meanTimeToCompletion() {
  const since = thirtyDaysAgo();

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('created_at, completion_date')
    .eq('status', 'completed')
    .gte('completion_date', since)
    .not('completion_date', 'is', null);

  if (error || !data || data.length === 0) {
    return {
      name: 'mean_time_to_completion',
      value: null,
      unit: 'minutes',
      target: 120,
      baseline: null,
      trend: 'neutral',
      measured_at: new Date().toISOString(),
      detail: { sds_measured: 0 }
    };
  }

  const durations = data.map(d => {
    const start = new Date(d.created_at);
    const end = new Date(d.completion_date);
    return (end - start) / (1000 * 60); // minutes
  }).filter(d => d > 0 && d < 60 * 24 * 30); // exclude outliers > 30 days

  const mean = durations.length > 0
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
    : null;

  return {
    name: 'mean_time_to_completion',
    value: mean,
    unit: 'minutes',
    target: 120,
    baseline: null,
    trend: 'neutral',
    measured_at: new Date().toISOString(),
    detail: { sds_measured: durations.length, min: Math.min(...durations), max: Math.max(...durations) }
  };
}

/**
 * Metric 5: Corrective SD resolution rate
 */
async function correctiveResolutionRate() {
  const { count: total } = await supabase
    .from('strategic_directives_v2')
    .select('*', { count: 'exact', head: true })
    .ilike('sd_key', '%CORRECTIVE%');

  const { count: completed } = await supabase
    .from('strategic_directives_v2')
    .select('*', { count: 'exact', head: true })
    .ilike('sd_key', '%CORRECTIVE%')
    .eq('status', 'completed');

  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    name: 'corrective_sd_resolution_rate',
    value: rate,
    unit: 'percent',
    target: 90,
    baseline: 0,
    trend: 'neutral',
    measured_at: new Date().toISOString(),
    detail: { total: total || 0, completed: completed || 0 }
  };
}

/**
 * Metric 6: Dimension improvement delta (latest vs first vision score)
 */
async function dimensionImprovementDelta() {
  const { data: latest } = await supabase
    .from('eva_vision_scores')
    .select('total_score, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const { data: first } = await supabase
    .from('eva_vision_scores')
    .select('total_score, created_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!latest || !first) {
    return {
      name: 'dimension_improvement_delta',
      value: 0,
      unit: 'points',
      target: 15,
      baseline: 0,
      trend: 'neutral',
      measured_at: new Date().toISOString(),
      detail: { latest_score: null, first_score: null }
    };
  }

  const delta = (latest.total_score || 0) - (first.total_score || 0);

  return {
    name: 'dimension_improvement_delta',
    value: delta,
    unit: 'points',
    target: 15,
    baseline: 0,
    trend: delta > 0 ? 'improving' : delta < 0 ? 'declining' : 'stable',
    measured_at: new Date().toISOString(),
    detail: { latest_score: latest.total_score, first_score: first.total_score }
  };
}

async function main() {
  try {
    const metrics = await Promise.all([
      sdCompletionRate(),
      avgVisionScore(),
      gatePassRate(),
      meanTimeToCompletion(),
      correctiveResolutionRate(),
      dimensionImprovementDelta()
    ]);

    // Compute overall health as average of metrics that met their targets
    const scorable = metrics.filter(m => m.value !== null && m.target !== null);
    const metTarget = scorable.filter(m => {
      if (m.unit === 'minutes') return m.value <= m.target;
      return m.value >= m.target;
    });
    const overallHealth = scorable.length > 0
      ? Math.round((metTarget.length / scorable.length) * 100)
      : 0;

    console.log(JSON.stringify({
      metrics,
      overall_health: overallHealth,
      collected_at: new Date().toISOString()
    }, null, 2));

    process.exit(0);
  } catch (err) {
    console.log(JSON.stringify({ error: true, message: err.message, exit_code: 1 }, null, 2));
    process.exit(1);
  }
}

main();
