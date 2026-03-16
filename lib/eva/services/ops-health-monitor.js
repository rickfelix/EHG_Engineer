/**
 * Operations Health Monitor
 * SD: SD-LEO-INFRA-OPERATIONS-PRODUCT-AGENT-001
 *
 * Dual-layer monitoring for AI-operated SaaS ventures:
 *   Product health: uptime, P95 latency, error rate, infra cost
 *   Agent health: response quality, decision accuracy, cost/action, quota usage
 *
 * Exports:
 *   collectProductHealth() — compute + store product health snapshot
 *   collectAgentHealth()   — compute + store agent health snapshots
 *   evaluateAlerts()       — check metrics against thresholds, create alerts
 *   getHealthSummary()     — green/yellow/red status for Friday scorecard
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Default thresholds for product health
const PRODUCT_THRESHOLDS = {
  uptime: { warning: 99.5, critical: 99.0 },         // below = alert
  p95_latency: { warning: 500, critical: 1000 },      // above = alert
  error_rate: { warning: 0.01, critical: 0.05 },       // above = alert
};

// Default thresholds for agent health
const AGENT_THRESHOLDS = {
  quota_utilization: { warning: 80, critical: 95 },    // above = alert
  budget_remaining: { warning: 20, critical: 5 },      // below = alert
};

/**
 * Compute product health metrics from service_telemetry for a venture on a given date.
 */
export async function computeProductHealth({ ventureId, date, supabase }) {
  if (!supabase) supabase = getSupabase();
  const metricDate = date || new Date().toISOString().split('T')[0];

  const { data: telemetry } = await supabase
    .from('service_telemetry')
    .select('outcome, processing_time_ms')
    .eq('venture_id', ventureId)
    .gte('reported_at', metricDate + 'T00:00:00Z')
    .lte('reported_at', metricDate + 'T23:59:59Z');

  const rows = telemetry || [];

  // Empty data — return null snapshot
  if (rows.length === 0) {
    return {
      venture_id: ventureId,
      metric_date: metricDate,
      uptime_pct: null,
      p95_latency_ms: null,
      error_rate: null,
      infra_cost_usd: null,
      total_requests: 0,
      successful_requests: 0,
      error_requests: 0,
    };
  }

  const total = rows.length;
  const successful = rows.filter(r => r.outcome === 'success').length;
  const errors = rows.filter(r => r.outcome === 'error' || r.outcome === 'failure').length;

  // P95 latency
  const latencies = rows
    .map(r => r.processing_time_ms)
    .filter(l => l != null)
    .sort((a, b) => a - b);

  const p95Index = Math.ceil(latencies.length * 0.95) - 1;
  const p95 = latencies.length > 0 ? latencies[Math.max(0, p95Index)] : null;

  return {
    venture_id: ventureId,
    metric_date: metricDate,
    uptime_pct: Math.round((successful / total) * 10000) / 100,
    p95_latency_ms: p95 != null ? Math.round(p95 * 100) / 100 : null,
    error_rate: Math.round((errors / total) * 10000) / 10000,
    infra_cost_usd: null, // Infrastructure cost TBD — no data source yet
    total_requests: total,
    successful_requests: successful,
    error_requests: errors,
  };
}

/**
 * Store a product health snapshot. Upserts on (venture_id, metric_date).
 */
export async function storeProductHealth(metrics, supabase) {
  if (!supabase) supabase = getSupabase();

  const { data, error } = await supabase
    .from('ops_product_health')
    .upsert(
      { ...metrics, computed_at: new Date().toISOString() },
      { onConflict: 'venture_id,metric_date' }
    )
    .select()
    .single();

  if (error) {
    console.error(`storeProductHealth failed: ${error.message}`);
    return null;
  }
  return data;
}

/**
 * Collect and store product health for a venture. Convenience wrapper.
 */
export async function collectProductHealth({ ventureId, date, supabase }) {
  if (!supabase) supabase = getSupabase();
  const metrics = await computeProductHealth({ ventureId, date, supabase });
  return storeProductHealth(metrics, supabase);
}

/**
 * Compute agent health metrics from venture_tool_quotas and venture_token_budgets.
 * Returns an array of per-agent snapshots.
 */
export async function computeAgentHealth({ ventureId, date, supabase }) {
  if (!supabase) supabase = getSupabase();
  const metricDate = date || new Date().toISOString().split('T')[0];

  // Fetch tool quotas for this venture
  const { data: quotas } = await supabase
    .from('venture_tool_quotas')
    .select('tool_id, daily_limit, monthly_limit, cost_limit_usd, usage_today, usage_this_month, cost_this_month_usd')
    .eq('venture_id', ventureId);

  // Fetch token budgets
  const { data: budgets } = await supabase
    .from('venture_token_budgets')
    .select('budget_allocated, budget_remaining')
    .eq('venture_id', ventureId);

  const toolQuotas = quotas || [];
  const tokenBudgets = budgets || [];

  // If no data, return empty array
  if (toolQuotas.length === 0) return [];

  // Compute budget remaining percentage (aggregate across all budgets)
  const totalAllocated = tokenBudgets.reduce((s, b) => s + (b.budget_allocated || 0), 0);
  const totalRemaining = tokenBudgets.reduce((s, b) => s + (b.budget_remaining || 0), 0);
  const budgetRemainingPct = totalAllocated > 0
    ? Math.round((totalRemaining / totalAllocated) * 10000) / 100
    : null;

  return toolQuotas.map(q => {
    const usage = q.usage_this_month || 0;
    const limit = q.monthly_limit || 0;
    const cost = q.cost_this_month_usd || 0;

    return {
      venture_id: ventureId,
      agent_id: q.tool_id,
      metric_date: metricDate,
      response_quality_score: null, // Derived from service_telemetry in future iteration
      decision_accuracy_pct: null,  // Derived from service_telemetry in future iteration
      cost_per_action_usd: usage > 0 ? Math.round((cost / usage) * 10000) / 10000 : 0,
      quota_utilization_pct: limit > 0 ? Math.round((usage / limit) * 10000) / 100 : 0,
      total_actions: usage,
      successful_actions: usage, // Assume all successful for now
      budget_remaining_pct: budgetRemainingPct,
    };
  });
}

/**
 * Store agent health snapshots. Upserts on (venture_id, agent_id, metric_date).
 */
export async function storeAgentHealth(snapshots, supabase) {
  if (!supabase) supabase = getSupabase();
  if (!snapshots || snapshots.length === 0) return [];

  const withTimestamp = snapshots.map(s => ({
    ...s,
    computed_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('ops_agent_health')
    .upsert(withTimestamp, { onConflict: 'venture_id,agent_id,metric_date' })
    .select();

  if (error) {
    console.error(`storeAgentHealth failed: ${error.message}`);
    return [];
  }
  return data || [];
}

/**
 * Collect and store agent health for a venture. Convenience wrapper.
 */
export async function collectAgentHealth({ ventureId, date, supabase }) {
  if (!supabase) supabase = getSupabase();
  const snapshots = await computeAgentHealth({ ventureId, date, supabase });
  return storeAgentHealth(snapshots, supabase);
}

/**
 * Evaluate health metrics and create alerts for threshold breaches.
 */
export async function evaluateAlerts({ ventureId, date, supabase }) {
  if (!supabase) supabase = getSupabase();
  const metricDate = date || new Date().toISOString().split('T')[0];
  const alerts = [];

  // Get latest product health
  const { data: productHealth } = await supabase
    .from('ops_product_health')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('metric_date', metricDate)
    .single();

  // Check product thresholds (skip null metrics)
  if (productHealth && productHealth.uptime_pct != null) {
    if (productHealth.uptime_pct < PRODUCT_THRESHOLDS.uptime.critical) {
      alerts.push(await createAlert({ ventureId, layer: 'product', metricType: 'uptime', actual: productHealth.uptime_pct, threshold: PRODUCT_THRESHOLDS.uptime.critical, severity: 'critical', date: metricDate, supabase }));
    } else if (productHealth.uptime_pct < PRODUCT_THRESHOLDS.uptime.warning) {
      alerts.push(await createAlert({ ventureId, layer: 'product', metricType: 'uptime', actual: productHealth.uptime_pct, threshold: PRODUCT_THRESHOLDS.uptime.warning, severity: 'warning', date: metricDate, supabase }));
    }

    if (productHealth.p95_latency_ms != null) {
      if (productHealth.p95_latency_ms > PRODUCT_THRESHOLDS.p95_latency.critical) {
        alerts.push(await createAlert({ ventureId, layer: 'product', metricType: 'p95_latency', actual: productHealth.p95_latency_ms, threshold: PRODUCT_THRESHOLDS.p95_latency.critical, severity: 'critical', date: metricDate, supabase }));
      } else if (productHealth.p95_latency_ms > PRODUCT_THRESHOLDS.p95_latency.warning) {
        alerts.push(await createAlert({ ventureId, layer: 'product', metricType: 'p95_latency', actual: productHealth.p95_latency_ms, threshold: PRODUCT_THRESHOLDS.p95_latency.warning, severity: 'warning', date: metricDate, supabase }));
      }
    }

    if (productHealth.error_rate != null) {
      if (productHealth.error_rate > PRODUCT_THRESHOLDS.error_rate.critical) {
        alerts.push(await createAlert({ ventureId, layer: 'product', metricType: 'error_rate', actual: productHealth.error_rate, threshold: PRODUCT_THRESHOLDS.error_rate.critical, severity: 'critical', date: metricDate, supabase }));
      } else if (productHealth.error_rate > PRODUCT_THRESHOLDS.error_rate.warning) {
        alerts.push(await createAlert({ ventureId, layer: 'product', metricType: 'error_rate', actual: productHealth.error_rate, threshold: PRODUCT_THRESHOLDS.error_rate.warning, severity: 'warning', date: metricDate, supabase }));
      }
    }
  }

  // Get latest agent health
  const { data: agentHealth } = await supabase
    .from('ops_agent_health')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('metric_date', metricDate);

  for (const agent of (agentHealth || [])) {
    if (agent.quota_utilization_pct != null) {
      if (agent.quota_utilization_pct > AGENT_THRESHOLDS.quota_utilization.critical) {
        alerts.push(await createAlert({ ventureId, layer: 'agent', metricType: 'quota_utilization', actual: agent.quota_utilization_pct, threshold: AGENT_THRESHOLDS.quota_utilization.critical, severity: 'critical', agentId: agent.agent_id, date: metricDate, supabase }));
      } else if (agent.quota_utilization_pct > AGENT_THRESHOLDS.quota_utilization.warning) {
        alerts.push(await createAlert({ ventureId, layer: 'agent', metricType: 'quota_utilization', actual: agent.quota_utilization_pct, threshold: AGENT_THRESHOLDS.quota_utilization.warning, severity: 'warning', agentId: agent.agent_id, date: metricDate, supabase }));
      }
    }
  }

  // Emergency escalation: if >= 2 critical alerts for same venture, create emergency
  const criticalAlerts = alerts.filter(a => a && a.severity === 'critical');
  if (criticalAlerts.length >= 2) {
    alerts.push(await createAlert({
      ventureId,
      layer: 'product',
      metricType: 'uptime', // Use first critical's metric type
      actual: 0,
      threshold: 0,
      severity: 'emergency',
      date: metricDate,
      supabase,
    }));
  }

  return alerts.filter(Boolean);
}

/**
 * Create a single alert if no duplicate exists today.
 */
async function createAlert({ ventureId, layer, metricType, actual, threshold, severity, agentId, date, supabase }) {
  // Check for existing open alert today (cooldown: 1 per metric/layer/day)
  const { data: existing } = await supabase
    .from('ops_health_alerts')
    .select('id')
    .eq('venture_id', ventureId)
    .eq('layer', layer)
    .eq('metric_type', metricType)
    .eq('alert_date', date)
    .in('status', ['open', 'acknowledged'])
    .limit(1);

  if (existing && existing.length > 0) return null;

  const { data, error } = await supabase
    .from('ops_health_alerts')
    .insert({
      venture_id: ventureId,
      layer,
      metric_type: metricType,
      actual_value: actual,
      threshold_value: threshold,
      severity,
      status: 'open',
      agent_id: agentId || null,
      alert_date: date,
    })
    .select()
    .single();

  if (error) {
    console.error(`createAlert failed: ${error.message}`);
    return null;
  }
  return data;
}

/**
 * Get per-venture health summary for Friday scorecard.
 * Returns green/yellow/red status based on open alerts.
 */
export async function getHealthSummary({ ventureId, supabase } = {}) {
  if (!supabase) supabase = getSupabase();

  let query = supabase
    .from('ops_health_alerts')
    .select('venture_id, layer, severity')
    .in('status', ['open', 'acknowledged']);

  if (ventureId) query = query.eq('venture_id', ventureId);

  const { data: alerts, error } = await query;
  if (error) return [];

  // Group alerts by venture
  const byVenture = {};
  for (const alert of (alerts || [])) {
    if (!byVenture[alert.venture_id]) {
      byVenture[alert.venture_id] = { product: [], agent: [] };
    }
    byVenture[alert.venture_id][alert.layer].push(alert.severity);
  }

  // Build summaries
  const summaries = [];
  const ventureIds = ventureId ? [ventureId] : Object.keys(byVenture);

  for (const vid of ventureIds) {
    const data = byVenture[vid] || { product: [], agent: [] };
    summaries.push({
      venture_id: vid,
      product_status: computeStatus(data.product),
      agent_status: computeStatus(data.agent),
      alert_count: data.product.length + data.agent.length,
    });
  }

  return ventureId ? summaries[0] || { venture_id: ventureId, product_status: 'green', agent_status: 'green', alert_count: 0 } : summaries;
}

/**
 * Determine status color from severity list.
 */
function computeStatus(severities) {
  if (severities.includes('emergency') || severities.includes('critical')) return 'red';
  if (severities.includes('warning')) return 'yellow';
  return 'green';
}
