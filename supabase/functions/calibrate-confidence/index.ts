// Confidence Calibration Edge Function
// SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-H (FR-001)
// Queries service_telemetry for completed tasks, compares predicted confidence
// vs actual PR outcomes, computes calibration delta using EMA (alpha=0.1),
// updates per-service per-venture confidence thresholds.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { verifyJWT, getCorsHeaders, createAdminClient } from '../_shared/auth.ts';

const EMA_ALPHA = 0.1;
const DRIFT_THRESHOLD_PCT = 15;
const MIN_SAMPLES = 10;
const MAX_DELTA_PCT = 20;
const BATCH_SIZE = 100;

interface TelemetryRecord {
  id: string;
  venture_id: string;
  service_id: string;
  confidence_score: number;
  outcome: string; // 'merged' | 'rejected' | 'revised'
}

interface CalibrationResult {
  venture_id: string;
  service_id: string;
  threshold_before: number;
  threshold_after: number;
  calibration_delta: number;
  sample_size: number;
  event_emitted: boolean;
}

function computeOutcomeScore(outcome: string): number {
  switch (outcome) {
    case 'merged': return 1.0;
    case 'revised': return 0.5;
    case 'rejected': return 0.0;
    default: return 0.5;
  }
}

function computeEMA(records: TelemetryRecord[], alpha: number): { accuracyDelta: number; sampleSize: number } {
  if (records.length === 0) return { accuracyDelta: 0, sampleSize: 0 };

  let ema = 0;
  for (let i = 0; i < records.length; i++) {
    const actual = computeOutcomeScore(records[i].outcome);
    const predicted = records[i].confidence_score;
    const error = actual - predicted;
    if (i === 0) {
      ema = error;
    } else {
      ema = alpha * error + (1 - alpha) * ema;
    }
  }

  return { accuracyDelta: ema, sampleSize: records.length };
}

function clampDelta(delta: number, maxPct: number): number {
  const maxDelta = maxPct / 100;
  return Math.max(-maxDelta, Math.min(maxDelta, delta));
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
    const serviceKey = body.service_key;

    // Build telemetry query
    let query = supabase
      .from('service_telemetry')
      .select('id, venture_id, service_id, confidence_score, outcome')
      .not('outcome', 'is', null)
      .not('confidence_score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(BATCH_SIZE);

    if (ventureId) query = query.eq('venture_id', ventureId);
    if (serviceKey) {
      const { data: svc } = await supabase
        .from('ehg_services')
        .select('id')
        .eq('service_key', serviceKey)
        .single();
      if (svc) query = query.eq('service_id', svc.id);
    }

    const { data: telemetry, error: telErr } = await query;

    if (telErr) {
      return new Response(
        JSON.stringify({ error: telErr.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!telemetry || telemetry.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No telemetry data to calibrate', calibrations: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group by venture_id + service_id
    const groups: Record<string, TelemetryRecord[]> = {};
    for (const record of telemetry) {
      const key = `${record.venture_id}:${record.service_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(record);
    }

    const results: CalibrationResult[] = [];

    for (const [key, records] of Object.entries(groups)) {
      if (records.length < MIN_SAMPLES) continue;

      const [vid, sid] = key.split(':');
      const { accuracyDelta, sampleSize } = computeEMA(records, EMA_ALPHA);

      // Get current threshold (default 0.85)
      const { data: existing } = await supabase
        .from('confidence_calibration_log')
        .select('threshold_after')
        .eq('venture_id', vid)
        .eq('service_id', sid)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const currentThreshold = existing?.threshold_after ?? 0.85;
      const clampedDelta = clampDelta(accuracyDelta, MAX_DELTA_PCT);
      const newThreshold = Math.max(0.1, Math.min(0.99, currentThreshold + clampedDelta));

      const driftPct = Math.abs(clampedDelta / currentThreshold) * 100;
      let eventEmitted = false;

      // Emit drift alert if threshold exceeded
      if (driftPct > DRIFT_THRESHOLD_PCT) {
        const { error: eventErr } = await supabase
          .from('eva_event_bus')
          .insert({
            event_type: 'confidence_drift_alert',
            payload: {
              venture_id: vid,
              service_id: sid,
              drift_pct: Math.round(driftPct * 100) / 100,
              threshold_before: currentThreshold,
              threshold_after: newThreshold,
              calibration_delta: clampedDelta,
              sample_size: sampleSize,
            },
            source: 'calibrate-confidence',
            priority: 'high',
          });
        eventEmitted = !eventErr;
      }

      // Log calibration
      await supabase.from('confidence_calibration_log').insert({
        venture_id: vid,
        service_id: sid,
        threshold_before: currentThreshold,
        threshold_after: newThreshold,
        calibration_delta: clampedDelta,
        sample_size: sampleSize,
        ema_alpha: EMA_ALPHA,
        triggered_by: body.triggered_by ?? 'api',
        event_emitted: eventEmitted,
      });

      results.push({
        venture_id: vid,
        service_id: sid,
        threshold_before: currentThreshold,
        threshold_after: newThreshold,
        calibration_delta: clampedDelta,
        sample_size: sampleSize,
        event_emitted: eventEmitted,
      });
    }

    return new Response(
      JSON.stringify({
        message: `Calibrated ${results.length} service(s)`,
        calibrations: results,
        total_telemetry_processed: telemetry.length,
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
