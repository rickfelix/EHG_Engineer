/**
 * Operations Revenue Alert Engine
 * SD: SD-LEO-INFRA-OPERATIONS-REVENUE-MONITORING-001
 *
 * Checks revenue metrics against targets and creates alerts
 * when deviation exceeds configurable thresholds.
 *
 * Severity levels:
 *   warning:   15-30% deviation
 *   critical:  30-50% deviation
 *   emergency: >50% deviation
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

const DEFAULT_THRESHOLD = 0.15; // 15%

/**
 * Compute deviation severity from percentage.
 * @param {number} deviationPct - Absolute deviation percentage (0-100 scale)
 * @returns {string|null} Severity or null if within threshold
 */
export function computeSeverity(deviationPct) {
  const abs = Math.abs(deviationPct);
  if (abs > 50) return 'emergency';
  if (abs > 30) return 'critical';
  if (abs > 15) return 'warning';
  return null;
}

/**
 * Check a single metric against its target and create alert if needed.
 *
 * @param {object} params
 * @param {string} params.ventureId
 * @param {string} params.metricType - One of: mrr, churn_rate, expansion, contraction, failed_payments, ltv_cac
 * @param {number} params.actual
 * @param {number} params.target
 * @param {number} [params.threshold] - Deviation threshold (default 0.15)
 * @param {object} [params.supabase]
 * @returns {Promise<object|null>} Alert record or null if within threshold
 */
export async function checkMetricDeviation({
  ventureId,
  metricType,
  actual,
  target,
  threshold = DEFAULT_THRESHOLD,
  supabase,
}) {
  if (!supabase) supabase = getSupabase();

  // Skip if no target set
  if (target === null || target === undefined || target === 0) return null;

  const deviationPct = Math.round(((actual - target) / Math.abs(target)) * 100 * 100) / 100;
  const absDeviation = Math.abs(deviationPct);

  // Within threshold — no alert
  if (absDeviation <= threshold * 100) return null;

  const severity = computeSeverity(absDeviation);
  if (!severity) return null;

  // Check for existing open alert today (cooldown: 1 per metric/day)
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('ops_revenue_alerts')
    .select('id')
    .eq('venture_id', ventureId)
    .eq('metric_type', metricType)
    .eq('alert_date', today)
    .in('status', ['open', 'acknowledged'])
    .limit(1);

  if (existing && existing.length > 0) return null; // Cooldown active

  // Create alert
  const { data, error } = await supabase
    .from('ops_revenue_alerts')
    .insert({
      venture_id: ventureId,
      metric_type: metricType,
      actual_value: actual,
      target_value: target,
      deviation_pct: deviationPct,
      severity,
      status: 'open',
      alert_date: today,
    })
    .select()
    .single();

  if (error) {
    console.error(`checkMetricDeviation failed: ${error.message}`);
    return null;
  }
  return data;
}

/**
 * Run deviation checks on a full metrics snapshot.
 *
 * @param {object} metrics - From computeRevenueMetrics
 * @param {object} [options]
 * @param {number} [options.threshold]
 * @param {object} [options.supabase]
 * @returns {Promise<Array>} Array of created alerts
 */
export async function checkAllDeviations(metrics, { threshold, supabase } = {}) {
  if (!supabase) supabase = getSupabase();
  const alerts = [];

  const checks = [
    { metricType: 'mrr', actual: metrics.mrr, target: metrics.target_mrr },
    { metricType: 'churn_rate', actual: metrics.churn_rate * 100, target: metrics.target_churn_rate ? metrics.target_churn_rate * 100 : null },
  ];

  for (const check of checks) {
    if (check.target === null || check.target === undefined) continue;
    const alert = await checkMetricDeviation({
      ventureId: metrics.venture_id,
      metricType: check.metricType,
      actual: check.actual,
      target: check.target,
      threshold,
      supabase,
    });
    if (alert) alerts.push(alert);
  }

  return alerts;
}

/**
 * List open alerts for a venture.
 *
 * @param {string} ventureId
 * @param {object} [options]
 * @param {string} [options.status] - Filter by status
 * @param {object} [options.supabase]
 * @returns {Promise<Array>}
 */
export async function listRevenueAlerts(ventureId, { status, supabase } = {}) {
  if (!supabase) supabase = getSupabase();
  let query = supabase
    .from('ops_revenue_alerts')
    .select('*')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

/**
 * Acknowledge or resolve an alert.
 *
 * @param {string} alertId
 * @param {string} newStatus - 'acknowledged', 'resolved', or 'dismissed'
 * @param {object} [supabase]
 * @returns {Promise<object|null>}
 */
export async function updateAlertStatus(alertId, newStatus, supabase) {
  if (!supabase) supabase = getSupabase();
  const updates = { status: newStatus, updated_at: new Date().toISOString() };
  if (newStatus === 'resolved') updates.resolved_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('ops_revenue_alerts')
    .update(updates)
    .eq('id', alertId)
    .select()
    .single();

  if (error) return null;
  return data;
}
