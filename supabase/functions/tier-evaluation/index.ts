// Tier Evaluation Edge Function
// SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-G
// Reads service_telemetry aggregates per venture, compares against
// promotion criteria thresholds, and writes new venture_tiers evaluation record.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { verifyJWT, getCorsHeaders, createAdminClient } from '../_shared/auth.ts';

// Default promotion criteria thresholds per tier
const DEFAULT_CRITERIA: Record<string, {
  min_completed_tasks: number;
  min_avg_confidence: number;
  min_services_bound: number;
  min_telemetry_reports: number;
}> = {
  seed: {
    min_completed_tasks: 0,
    min_avg_confidence: 0,
    min_services_bound: 0,
    min_telemetry_reports: 0,
  },
  growth: {
    min_completed_tasks: 5,
    min_avg_confidence: 0.6,
    min_services_bound: 2,
    min_telemetry_reports: 3,
  },
  scale: {
    min_completed_tasks: 20,
    min_avg_confidence: 0.75,
    min_services_bound: 4,
    min_telemetry_reports: 10,
  },
  exit: {
    min_completed_tasks: 50,
    min_avg_confidence: 0.85,
    min_services_bound: 5,
    min_telemetry_reports: 25,
  },
};

const TIER_ORDER = ['seed', 'growth', 'scale', 'exit'];

interface TelemetrySnapshot {
  completed_tasks: number;
  avg_confidence: number;
  services_bound: number;
  telemetry_reports: number;
  evaluated_at: string;
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

    const body = await req.json();
    const { venture_id, custom_criteria } = body;

    if (!venture_id) {
      return new Response(
        JSON.stringify({ error: 'venture_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service_role client for DB operations (after JWT verification)
    const supabase = createAdminClient();

    // Verify venture exists
    const { data: venture, error: ventureError } = await supabase
      .from('ventures')
      .select('id, name')
      .eq('id', venture_id)
      .single();

    if (ventureError || !venture) {
      return new Response(
        JSON.stringify({ error: 'Venture not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Aggregate telemetry data
    // 1. Count completed tasks
    const { count: completedTasks } = await supabase
      .from('service_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('venture_id', venture_id)
      .eq('status', 'completed');

    // 2. Average confidence score from completed tasks
    const { data: confidenceData } = await supabase
      .from('service_tasks')
      .select('confidence_score')
      .eq('venture_id', venture_id)
      .eq('status', 'completed')
      .not('confidence_score', 'is', null);

    const avgConfidence = confidenceData && confidenceData.length > 0
      ? confidenceData.reduce((sum, t) => sum + (t.confidence_score ?? 0), 0) / confidenceData.length
      : 0;

    // 3. Count bound services
    const { count: servicesBound } = await supabase
      .from('venture_service_bindings')
      .select('*', { count: 'exact', head: true })
      .eq('venture_id', venture_id)
      .eq('status', 'active');

    // 4. Count telemetry reports
    const { count: telemetryReports } = await supabase
      .from('service_telemetry')
      .select('*', { count: 'exact', head: true })
      .eq('venture_id', venture_id);

    const snapshot: TelemetrySnapshot = {
      completed_tasks: completedTasks ?? 0,
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      services_bound: servicesBound ?? 0,
      telemetry_reports: telemetryReports ?? 0,
      evaluated_at: new Date().toISOString(),
    };

    // Get current tier
    const { data: currentTierData } = await supabase
      .from('venture_tiers')
      .select('tier_level')
      .eq('venture_id', venture_id)
      .eq('is_current', true)
      .limit(1)
      .single();

    const currentTier = currentTierData?.tier_level ?? 'seed';
    const currentTierIndex = TIER_ORDER.indexOf(currentTier);

    // Evaluate next tier
    const criteria = custom_criteria ?? DEFAULT_CRITERIA;
    let recommendedTier = currentTier;
    let promotionReason = 'No tier change — current metrics do not meet next tier thresholds';

    // Check if venture qualifies for a higher tier
    for (let i = currentTierIndex + 1; i < TIER_ORDER.length; i++) {
      const nextTier = TIER_ORDER[i];
      const thresholds = criteria[nextTier];
      if (!thresholds) continue;

      const meetsAll =
        snapshot.completed_tasks >= thresholds.min_completed_tasks &&
        snapshot.avg_confidence >= thresholds.min_avg_confidence &&
        snapshot.services_bound >= thresholds.min_services_bound &&
        snapshot.telemetry_reports >= thresholds.min_telemetry_reports;

      if (meetsAll) {
        recommendedTier = nextTier;
        promotionReason = `Meets all ${nextTier} tier thresholds: tasks=${snapshot.completed_tasks}>=${thresholds.min_completed_tasks}, confidence=${snapshot.avg_confidence}>=${thresholds.min_avg_confidence}, services=${snapshot.services_bound}>=${thresholds.min_services_bound}, reports=${snapshot.telemetry_reports}>=${thresholds.min_telemetry_reports}`;
      } else {
        break; // Can't skip tiers
      }
    }

    const tierChanged = recommendedTier !== currentTier;

    // Write evaluation record (always, even if no change)
    const { data: tierRecord, error: insertError } = await supabase
      .from('venture_tiers')
      .insert({
        venture_id,
        tier_level: recommendedTier,
        promotion_criteria: criteria[recommendedTier] ?? {},
        telemetry_snapshot: snapshot,
        is_current: true,
        promoted_from: tierChanged ? currentTier : null,
        promotion_reason: promotionReason,
        evaluated_by: 'tier-evaluation-edge-function',
      })
      .select('id, tier_level, is_current, promoted_from, promotion_reason')
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: 'Failed to write tier evaluation', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        evaluation: {
          venture_id,
          venture_name: venture.name,
          previous_tier: currentTier,
          recommended_tier: recommendedTier,
          tier_changed: tierChanged,
          promotion_reason: promotionReason,
          telemetry_snapshot: snapshot,
          tier_record: tierRecord,
        },
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
