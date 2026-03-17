// Venture Health Score Computation Edge Function
// SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-H (FR-003)
// Aggregates 4 dimensions into composite health score:
//   1. task_completion_rate (from service_tasks)
//   2. avg_confidence_accuracy (from confidence_calibration_log)
//   3. telemetry_freshness (hours since last service_telemetry)
//   4. exit_readiness_pct (from venture_separability_scores)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { verifyJWT, getCorsHeaders, createAdminClient } from '../_shared/auth.ts';

const DEFAULT_WEIGHTS = {
  task_completion: 0.30,
  confidence_accuracy: 0.25,
  telemetry_freshness: 0.20,
  exit_readiness: 0.25,
};

const DEFAULT_SCORE = 0.5;

function classifyHealthStatus(score: number): string {
  if (score >= 0.7) return 'healthy';
  if (score >= 0.4) return 'warning';
  return 'critical';
}

function freshnessToScore(hoursSinceReport: number): number {
  // <1h = 1.0, 1-6h = 0.8, 6-24h = 0.5, 24-72h = 0.3, >72h = 0.1
  if (hoursSinceReport < 1) return 1.0;
  if (hoursSinceReport < 6) return 0.8;
  if (hoursSinceReport < 24) return 0.5;
  if (hoursSinceReport < 72) return 0.3;
  return 0.1;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Verify JWT before any database operations
    const { user, error: authError, status: authStatus } = await verifyJWT(req);
    if (authError) {
      return new Response(
        JSON.stringify({ error: authError }),
        { status: authStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service_role client for DB operations (after JWT verification)
    const supabase = createAdminClient();

    const body = await req.json().catch(() => ({}));
    const ventureId = body.venture_id;
    const weights = { ...DEFAULT_WEIGHTS, ...body.weights };

    if (!ventureId) {
      return new Response(
        JSON.stringify({ error: 'venture_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Dimension 1: Task Completion Rate
    const { data: tasks } = await supabase
      .from('service_tasks')
      .select('status')
      .eq('venture_id', ventureId);

    let taskCompletionRate = DEFAULT_SCORE;
    if (tasks && tasks.length > 0) {
      const completed = tasks.filter((t: { status: string }) => t.status === 'completed').length;
      taskCompletionRate = completed / tasks.length;
    }

    // Dimension 2: Confidence Accuracy (avg calibration delta magnitude)
    const { data: calibrations } = await supabase
      .from('confidence_calibration_log')
      .select('calibration_delta')
      .eq('venture_id', ventureId)
      .order('created_at', { ascending: false })
      .limit(20);

    let confidenceAccuracy = DEFAULT_SCORE;
    if (calibrations && calibrations.length > 0) {
      const avgDelta = calibrations.reduce(
        (sum: number, c: { calibration_delta: number }) => sum + Math.abs(c.calibration_delta), 0
      ) / calibrations.length;
      // Lower delta = higher accuracy. Map: 0 delta = 1.0, 0.2 delta = 0.0
      confidenceAccuracy = Math.max(0, 1 - avgDelta * 5);
    }

    // Dimension 3: Telemetry Freshness
    const { data: latestTelemetry } = await supabase
      .from('service_telemetry')
      .select('created_at')
      .eq('venture_id', ventureId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let telemetryFreshness = DEFAULT_SCORE;
    if (latestTelemetry) {
      const hoursSince = (Date.now() - new Date(latestTelemetry.created_at).getTime()) / (1000 * 60 * 60);
      telemetryFreshness = freshnessToScore(hoursSince);
    }

    // Dimension 4: Exit Readiness
    const { data: separability } = await supabase
      .from('venture_separability_scores')
      .select('overall_score')
      .eq('venture_id', ventureId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let exitReadiness = DEFAULT_SCORE;
    if (separability) {
      exitReadiness = (separability.overall_score ?? 50) / 100;
    }

    // Compute composite score
    const compositeScore = Math.round((
      taskCompletionRate * weights.task_completion +
      confidenceAccuracy * weights.confidence_accuracy +
      telemetryFreshness * weights.telemetry_freshness +
      exitReadiness * weights.exit_readiness
    ) * 100) / 100;

    const healthStatus = classifyHealthStatus(compositeScore);

    // Get previous score for delta
    const { data: venture } = await supabase
      .from('ventures')
      .select('health_score')
      .eq('id', ventureId)
      .single();

    const previousScore = venture?.health_score ?? null;

    // Update venture health
    await supabase
      .from('ventures')
      .update({ health_score: compositeScore, health_status: healthStatus })
      .eq('id', ventureId);

    // Emit event on status change
    if (previousScore !== null && classifyHealthStatus(previousScore) !== healthStatus) {
      await supabase.from('eva_event_bus').insert({
        event_type: 'venture_health_change',
        payload: {
          venture_id: ventureId,
          previous_score: previousScore,
          new_score: compositeScore,
          previous_status: classifyHealthStatus(previousScore),
          new_status: healthStatus,
        },
        source: 'compute-health-score',
        priority: healthStatus === 'critical' ? 'high' : 'normal',
      });
    }

    return new Response(
      JSON.stringify({
        venture_id: ventureId,
        composite_score: compositeScore,
        health_status: healthStatus,
        previous_score: previousScore,
        dimensions: {
          task_completion_rate: Math.round(taskCompletionRate * 100) / 100,
          confidence_accuracy: Math.round(confidenceAccuracy * 100) / 100,
          telemetry_freshness: Math.round(telemetryFreshness * 100) / 100,
          exit_readiness: Math.round(exitReadiness * 100) / 100,
        },
        weights,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
