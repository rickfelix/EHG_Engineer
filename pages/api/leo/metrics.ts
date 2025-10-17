/**
 * GET /api/leo/metrics
 *
 * Dashboard metrics for LEO Protocol monitoring
 * Provides aggregated statistics for portfolio-level view
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface DashboardMetrics {
  overview: {
    total_prds: number;
    active_prds: number;
    gates_passed: number;
    gates_failed: number;
    overall_pass_rate: number;
  };
  gates: {
    gate: string;
    pass_rate: number;
    avg_score: number;
    total_reviews: number;
  }[];
  subagents: {
    agent: string;
    total_executions: number;
    success_rate: number;
    avg_execution_time_ms: number;
    current_load: number;
  }[];
  trends: {
    date: string;
    pass_rate: number;
    avg_score: number;
    completions: number;
  }[];
  alerts: {
    unresolved_count: number;
    critical_count: number;
    recent_drifts: number;
  };
  performance: {
    avg_time_to_gate_completion_hours: number;
    p95_gate_score: number;
    bottleneck_gate: string;
    bottleneck_agent: string;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      allowed: ['GET']
    });
  }

  try {
    const metrics: DashboardMetrics = {
      overview: await getOverviewMetrics(),
      gates: await getGateMetrics(),
      subagents: await getSubAgentMetrics(),
      trends: await getTrendMetrics(),
      alerts: await getAlertMetrics(),
      performance: await getPerformanceMetrics()
    };

    // Success
    return res.status(200).json(metrics);

  } catch (error) {
    console.error('Metrics error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get overview metrics
 */
async function getOverviewMetrics() {
  // Total PRDs
  const { count: totalPrds } = await supabase
    .from('product_requirements_v2')
    .select('*', { count: 'exact', head: true });

  // Active PRDs (with recent gate reviews)
  const { count: activePrds } = await supabase
    .from('leo_gate_reviews')
    .select('prd_id', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // Gates passed vs failed
  const { data: gateResults } = await supabase
    .from('leo_gate_reviews')
    .select('score');

  const gatesPassed = gateResults?.filter(r => Number(r.score) >= 85).length || 0;
  const gatesFailed = gateResults?.filter(r => Number(r.score) < 85).length || 0;
  const total = gatesPassed + gatesFailed;
  const overallPassRate = total > 0 ? Math.round((gatesPassed / total) * 100) : 0;

  return {
    total_prds: totalPrds || 0,
    active_prds: activePrds || 0,
    gates_passed: gatesPassed,
    gates_failed: gatesFailed,
    overall_pass_rate: overallPassRate
  };
}

/**
 * Get per-gate metrics
 */
async function getGateMetrics() {
  const gates = ['2A', '2B', '2C', '2D', '3'];
  const metrics = [];

  for (const gate of gates) {
    const { data: reviews } = await supabase
      .from('leo_gate_reviews')
      .select('score')
      .eq('gate', gate);

    if (!reviews || reviews.length === 0) {
      metrics.push({
        gate,
        pass_rate: 0,
        avg_score: 0,
        total_reviews: 0
      });
      continue;
    }

    const scores = reviews.map(r => Number(r.score));
    const passed = scores.filter(s => s >= 85).length;
    const passRate = Math.round((passed / scores.length) * 100);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    metrics.push({
      gate,
      pass_rate: passRate,
      avg_score: avgScore,
      total_reviews: reviews.length
    });
  }

  return metrics;
}

/**
 * Get sub-agent metrics
 */
async function getSubAgentMetrics() {
  const { data: agents } = await supabase
    .from('leo_sub_agents')
    .select('id, code, name');

  const metrics = [];

  for (const agent of agents || []) {
    const { data: executions } = await supabase
      .from('sub_agent_executions')
      .select('status, execution_time_ms')
      .eq('sub_agent_id', agent.id);

    if (!executions || executions.length === 0) {
      metrics.push({
        agent: agent.code,
        total_executions: 0,
        success_rate: 0,
        avg_execution_time_ms: 0,
        current_load: 0
      });
      continue;
    }

    const successful = executions.filter(e => e.status === 'pass').length;
    const successRate = Math.round((successful / executions.length) * 100);

    const times = executions
      .filter(e => e.execution_time_ms)
      .map(e => e.execution_time_ms);

    const avgTime = times.length > 0
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : 0;

    // Current load (executions in last hour)
    const { count: currentLoad } = await supabase
      .from('sub_agent_executions')
      .select('*', { count: 'exact', head: true })
      .eq('sub_agent_id', agent.id)
      .eq('status', 'running');

    metrics.push({
      agent: agent.code,
      total_executions: executions.length,
      success_rate: successRate,
      avg_execution_time_ms: avgTime,
      current_load: currentLoad || 0
    });
  }

  return metrics;
}

/**
 * Get trend metrics (last 7 days)
 */
async function getTrendMetrics() {
  const trends = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const { data: dayReviews } = await supabase
      .from('leo_gate_reviews')
      .select('score')
      .gte('created_at', date.toISOString())
      .lt('created_at', nextDate.toISOString());

    if (!dayReviews || dayReviews.length === 0) {
      trends.push({
        date: date.toISOString().split('T')[0],
        pass_rate: 0,
        avg_score: 0,
        completions: 0
      });
      continue;
    }

    const scores = dayReviews.map(r => Number(r.score));
    const passed = scores.filter(s => s >= 85).length;
    const passRate = Math.round((passed / scores.length) * 100);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    trends.push({
      date: date.toISOString().split('T')[0],
      pass_rate: passRate,
      avg_score: avgScore,
      completions: dayReviews.length
    });
  }

  return trends;
}

/**
 * Get alert metrics
 */
async function getAlertMetrics() {
  const { count: unresolvedCount } = await supabase
    .from('compliance_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('resolved', false);

  const { count: criticalCount } = await supabase
    .from('compliance_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('severity', 'critical')
    .eq('resolved', false);

  const { count: recentDrifts } = await supabase
    .from('compliance_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('alert_type', 'filesystem_drift')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  return {
    unresolved_count: unresolvedCount || 0,
    critical_count: criticalCount || 0,
    recent_drifts: recentDrifts || 0
  };
}

/**
 * Get performance metrics
 */
async function getPerformanceMetrics() {
  // Average time to gate completion
  const { data: completionTimes } = await supabase
    .from('leo_gate_reviews')
    .select('prd_id, gate, created_at')
    .order('created_at', { ascending: true });

  let totalTime = 0;
  let completionCount = 0;

  if (completionTimes && completionTimes.length > 0) {
    // Group by PRD and calculate time from first to last gate
    const prdGroups: Record<string, any[]> = {};

    for (const review of completionTimes) {
      if (!prdGroups[review.prd_id]) {
        prdGroups[review.prd_id] = [];
      }
      prdGroups[review.prd_id].push(review);
    }

    for (const prd of Object.values(prdGroups)) {
      if (prd.length >= 5) { // All gates completed
        const first = new Date(prd[0].created_at).getTime();
        const last = new Date(prd[prd.length - 1].created_at).getTime();
        totalTime += (last - first) / (1000 * 60 * 60); // Convert to hours
        completionCount++;
      }
    }
  }

  const avgTimeToCompletion = completionCount > 0
    ? Math.round(totalTime / completionCount)
    : 0;

  // P95 gate score
  const { data: allScores } = await supabase
    .from('leo_gate_reviews')
    .select('score')
    .order('score', { ascending: true });

  let p95Score = 0;
  if (allScores && allScores.length > 0) {
    const p95Index = Math.floor(allScores.length * 0.95);
    p95Score = Number(allScores[p95Index].score);
  }

  // Bottleneck identification
  const gateMetrics = await getGateMetrics();
  const bottleneckGate = gateMetrics.reduce((min, gate) =>
    gate.pass_rate < min.pass_rate ? gate : min
  );

  const agentMetrics = await getSubAgentMetrics();
  const bottleneckAgent = agentMetrics.reduce((min, agent) =>
    agent.success_rate < min.success_rate ? agent : min
  );

  return {
    avg_time_to_gate_completion_hours: avgTimeToCompletion,
    p95_gate_score: p95Score,
    bottleneck_gate: bottleneckGate?.gate || 'none',
    bottleneck_agent: bottleneckAgent?.agent || 'none'
  };
}