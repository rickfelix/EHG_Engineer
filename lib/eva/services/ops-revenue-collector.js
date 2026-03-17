/**
 * Operations Revenue Metrics Collector
 * SD: SD-LEO-INFRA-OPERATIONS-REVENUE-MONITORING-001
 *
 * Computes daily revenue snapshots for a venture:
 * MRR, churn rate, expansion/contraction, failed payments, LTV:CAC.
 * Stores results in ops_revenue_metrics table.
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

function getSupabase() {
  return createSupabaseServiceClient();
}

/**
 * Compute revenue metrics for a venture on a given date.
 *
 * @param {object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} [params.date] - ISO date string (defaults to today)
 * @param {object} [params.supabase] - Optional Supabase client
 * @returns {Promise<object>} Computed metrics
 */
export async function computeRevenueMetrics({ ventureId, date, supabase }) {
  if (!supabase) supabase = getSupabase();
  const metricDate = date || new Date().toISOString().split('T')[0];

  // Fetch venture financial targets (if available)
  const { data: venture } = await supabase
    .from('ventures')
    .select('metadata')
    .eq('id', ventureId)
    .single();

  const targets = venture?.metadata?.financial_targets || {};

  // Fetch capital transactions for revenue computation
  const { data: transactions } = await supabase
    .from('capital_transactions')
    .select('amount, transaction_type, status, created_at')
    .eq('venture_id', ventureId)
    .gte('created_at', metricDate + 'T00:00:00Z')
    .lte('created_at', metricDate + 'T23:59:59Z');

  const txns = transactions || [];

  // Compute metrics
  const revenue = txns
    .filter(t => t.status === 'completed' && t.transaction_type === 'revenue')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const expansion = txns
    .filter(t => t.status === 'completed' && t.transaction_type === 'expansion')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const contraction = txns
    .filter(t => t.status === 'completed' && t.transaction_type === 'contraction')
    .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

  const failedPayments = txns
    .filter(t => t.status === 'failed')
    .length;

  // MRR = recurring revenue (simplified: total revenue for the day)
  const mrr = revenue + expansion - contraction;

  // Churn rate: contraction / total (or 0 if no revenue)
  const totalBase = revenue + expansion;
  const churnRate = totalBase > 0 ? contraction / totalBase : 0;

  // LTV:CAC from targets (static until we have acquisition data)
  const ltvCac = targets.ltv_cac || null;

  return {
    venture_id: ventureId,
    metric_date: metricDate,
    mrr: Math.round(mrr * 100) / 100,
    churn_rate: Math.round(churnRate * 10000) / 10000,
    expansion_revenue: Math.round(expansion * 100) / 100,
    contraction_revenue: Math.round(contraction * 100) / 100,
    failed_payments: failedPayments,
    ltv_cac: ltvCac,
    target_mrr: targets.target_mrr || null,
    target_churn_rate: targets.target_churn_rate || null,
  };
}

/**
 * Store a daily revenue snapshot in ops_revenue_metrics.
 * Upserts on (venture_id, metric_date).
 *
 * @param {object} metrics - Output from computeRevenueMetrics
 * @param {object} [supabase] - Optional Supabase client
 * @returns {Promise<object|null>} Stored record or null on error
 */
export async function storeRevenueSnapshot(metrics, supabase) {
  if (!supabase) supabase = getSupabase();

  const { data, error } = await supabase
    .from('ops_revenue_metrics')
    .upsert(
      { ...metrics, computed_at: new Date().toISOString() },
      { onConflict: 'venture_id,metric_date' }
    )
    .select()
    .single();

  if (error) {
    console.error(`storeRevenueSnapshot failed: ${error.message}`);
    return null;
  }
  return data;
}

/**
 * Collect and store revenue metrics for a venture.
 * Convenience function combining compute + store.
 *
 * @param {object} params
 * @param {string} params.ventureId
 * @param {string} [params.date]
 * @param {object} [params.supabase]
 * @returns {Promise<object|null>}
 */
export async function collectRevenueMetrics({ ventureId, date, supabase }) {
  if (!supabase) supabase = getSupabase();
  const metrics = await computeRevenueMetrics({ ventureId, date, supabase });
  return storeRevenueSnapshot(metrics, supabase);
}

/**
 * Get the latest revenue snapshot for a venture.
 *
 * @param {string} ventureId
 * @param {object} [supabase]
 * @returns {Promise<object|null>}
 */
export async function getLatestRevenueMetrics(ventureId, supabase) {
  if (!supabase) supabase = getSupabase();
  const { data, error } = await supabase
    .from('ops_revenue_metrics')
    .select('*')
    .eq('venture_id', ventureId)
    .order('metric_date', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

/**
 * List revenue metrics for a venture over a date range.
 *
 * @param {string} ventureId
 * @param {object} [options]
 * @param {string} [options.startDate]
 * @param {string} [options.endDate]
 * @param {object} [options.supabase]
 * @returns {Promise<Array>}
 */
export async function listRevenueMetrics(ventureId, { startDate, endDate, supabase } = {}) {
  if (!supabase) supabase = getSupabase();
  let query = supabase
    .from('ops_revenue_metrics')
    .select('*')
    .eq('venture_id', ventureId)
    .order('metric_date', { ascending: false });

  if (startDate) query = query.gte('metric_date', startDate);
  if (endDate) query = query.lte('metric_date', endDate);

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}
