/**
 * Friday Operations Scorecard Service
 * SD: SD-LEO-INFRA-OPERATIONS-FRIDAY-SCORECARD-001
 *
 * Aggregates all ops domain signals into a unified per-venture scorecard
 * for the weekly Friday meeting with Eva.
 *
 * Exports:
 *   generateScorecard()    — compute + store weekly scorecard
 *   scheduleAssessments()  — create quarterly deep assessment records
 *   getAgendaItems()       — prioritized Friday meeting agenda
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

function getSupabase() {
  return createSupabaseServiceClient();
}

const ASSESSMENT_TYPES = [
  'risk_recalibration',
  'exit_readiness',
  'competitive_landscape',
  'financial_health',
];

const STATUS_PRIORITY = { emergency: 0, critical: 1, red: 2, yellow: 3, warning: 4, green: 5, grey: 6 };

/**
 * Compute the worst status from a list of statuses.
 */
function worstStatus(statuses) {
  if (!statuses || statuses.length === 0) return 'grey';
  return statuses.reduce((worst, s) => {
    const wp = STATUS_PRIORITY[worst] ?? 6;
    const sp = STATUS_PRIORITY[s] ?? 6;
    return sp < wp ? s : worst;
  }, 'grey');
}

/**
 * Map alert severities to scorecard status colors.
 */
function alertsToStatus(alerts) {
  if (!alerts || alerts.length === 0) return 'green';
  const severities = alerts.map(a => a.severity);
  if (severities.includes('emergency') || severities.includes('critical')) return 'red';
  if (severities.includes('warning')) return 'yellow';
  return 'green';
}

/**
 * Generate a unified Friday scorecard for a venture.
 */
export async function generateScorecard({ ventureId, weekDate, supabase }) {
  if (!supabase) supabase = getSupabase();
  const week = weekDate || getWeekDate();

  // Fetch open alerts from all health domains
  const { data: healthAlerts } = await supabase
    .from('ops_health_alerts')
    .select('layer, severity')
    .eq('venture_id', ventureId)
    .in('status', ['open', 'acknowledged']);

  const { data: revenueAlerts } = await supabase
    .from('ops_revenue_alerts')
    .select('severity')
    .eq('venture_id', ventureId)
    .in('status', ['open', 'acknowledged']);

  const productAlerts = (healthAlerts || []).filter(a => a.layer === 'product');
  const agentAlerts = (healthAlerts || []).filter(a => a.layer === 'agent');

  // Compute per-domain status
  const revenueStatus = alertsToStatus(revenueAlerts);
  const productStatus = alertsToStatus(productAlerts);
  const agentStatus = alertsToStatus(agentAlerts);

  // Customer and cost status: check if tables have data, otherwise grey
  const customerStatus = await getCustomerStatus(ventureId, supabase);
  const costStatus = 'grey'; // Cost governance SD not yet implemented

  const allStatuses = [revenueStatus, customerStatus, productStatus, agentStatus, costStatus];
  const overallStatus = worstStatus(allStatuses);
  const alertCount = (healthAlerts || []).length + (revenueAlerts || []).length;

  const scorecard = {
    venture_id: ventureId,
    week_date: week,
    revenue_status: revenueStatus,
    customer_status: customerStatus,
    product_status: productStatus,
    agent_status: agentStatus,
    cost_status: costStatus,
    overall_status: overallStatus,
    alert_count: alertCount,
    decision_items: [],
  };

  // Store scorecard
  const { data, error } = await supabase
    .from('ops_friday_scorecards')
    .upsert(
      { ...scorecard, computed_at: new Date().toISOString() },
      { onConflict: 'venture_id,week_date' }
    )
    .select()
    .single();

  if (error) {
    console.error(`generateScorecard failed: ${error.message}`);
    return scorecard;
  }
  return data || scorecard;
}

/**
 * Check customer health status from ops_customer_health_scores.
 */
async function getCustomerStatus(ventureId, supabase) {
  const { data, error } = await supabase
    .from('ops_customer_health_scores')
    .select('health_score')
    .eq('venture_id', ventureId)
    .order('scored_at', { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) return 'grey';

  const avgScore = data.reduce((sum, d) => sum + (d.health_score || 0), 0) / data.length;
  if (avgScore < 40) return 'red';
  if (avgScore < 70) return 'yellow';
  return 'green';
}

/**
 * Schedule quarterly deep assessments for a venture.
 */
export async function scheduleAssessments({ ventureId, quarter, supabase }) {
  if (!supabase) supabase = getSupabase();

  const assessments = ASSESSMENT_TYPES.map(type => ({
    venture_id: ventureId,
    assessment_type: type,
    quarter,
    status: 'scheduled',
    scheduled_date: getQuarterEndDate(quarter),
  }));

  const { data, error } = await supabase
    .from('ops_quarterly_assessments')
    .upsert(assessments, { onConflict: 'venture_id,assessment_type,quarter' })
    .select();

  if (error) {
    console.error(`scheduleAssessments failed: ${error.message}`);
    return [];
  }
  return data || [];
}

/**
 * Get prioritized agenda items for Friday meeting.
 */
export async function getAgendaItems({ ventureId, supabase } = {}) {
  if (!supabase) supabase = getSupabase();
  const items = [];

  // 1. Emergency and critical alerts
  let alertQuery = supabase
    .from('ops_health_alerts')
    .select('id, venture_id, layer, metric_type, severity, actual_value, threshold_value, created_at')
    .in('status', ['open', 'acknowledged'])
    .in('severity', ['emergency', 'critical'])
    .order('created_at', { ascending: false });

  if (ventureId) alertQuery = alertQuery.eq('venture_id', ventureId);

  const { data: alerts } = await alertQuery;
  for (const alert of (alerts || [])) {
    items.push({
      type: 'alert',
      priority: alert.severity === 'emergency' ? 0 : 1,
      venture_id: alert.venture_id,
      title: `${alert.severity.toUpperCase()}: ${alert.layer} ${alert.metric_type}`,
      detail: `Actual: ${alert.actual_value}, Threshold: ${alert.threshold_value}`,
      created_at: alert.created_at,
    });
  }

  // 2. Overdue assessments
  const today = new Date().toISOString().split('T')[0];
  let assessQuery = supabase
    .from('ops_quarterly_assessments')
    .select('id, venture_id, assessment_type, quarter, scheduled_date')
    .eq('status', 'scheduled')
    .lte('scheduled_date', today);

  if (ventureId) assessQuery = assessQuery.eq('venture_id', ventureId);

  const { data: overdue } = await assessQuery;
  for (const assessment of (overdue || [])) {
    items.push({
      type: 'overdue_assessment',
      priority: 2,
      venture_id: assessment.venture_id,
      title: `OVERDUE: ${assessment.assessment_type.replace(/_/g, ' ')} (${assessment.quarter})`,
      detail: `Scheduled: ${assessment.scheduled_date}`,
      created_at: assessment.scheduled_date,
    });
  }

  // Sort by priority (lower = more urgent)
  items.sort((a, b) => a.priority - b.priority);
  return items;
}

/**
 * Get the ISO week date (Monday of current week).
 */
function getWeekDate(date) {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

/**
 * Get the end date of a quarter string (e.g., "2026-Q2" → "2026-06-30").
 */
function getQuarterEndDate(quarter) {
  const [year, q] = quarter.split('-Q');
  const quarterEnds = { '1': '03-31', '2': '06-30', '3': '09-30', '4': '12-31' };
  return `${year}-${quarterEnds[q] || '12-31'}`;
}
