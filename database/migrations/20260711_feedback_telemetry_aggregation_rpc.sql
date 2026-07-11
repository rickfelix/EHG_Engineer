-- Migration: Feedback telemetry aggregation RPC (write-time audience routing)
-- SD: SD-LEO-INFRA-TELEMETRY-AUDIENCE-ROUTING-001 (FR-2)
-- Purpose: closure-map class C7 -- a single detector (lib/fleet/dormancy-watchdog.cjs,
--          category='fleet_dormancy') produced 66 of 75 rows in the chairman's pending
--          queue because emitFeedback()'s existing same-day dedup-by-hash is defeated
--          by the detector's per-call varying description text, and a dedup hit
--          silently no-ops instead of incrementing. This adds an atomic UPSERT RPC
--          for the machine-telemetry category class ONLY (lib/governance/feedback-audience.js's
--          MACHINE_TELEMETRY_CATEGORIES allowlist), mirroring the established
--          occurrence-count-increment pattern from
--          20260704d_venture_error_aggregation_rpc.sql, scoped via a partial unique
--          index so it can never match/increment a non-telemetry-category row.
--          Server-only (emitFeedback runs with a service-role client) -- no anon grant
--          needed, unlike the venture_error RPC's public-facing variant.
-- Date: 2026-07-11

BEGIN;

-- ============================================================
-- 1. Partial unique index -- the ON CONFLICT arbiter for the RPC's UPSERT.
--    Scoped to the machine-telemetry category allowlist only, so the RPC can
--    never match/increment a chairman-actionable or coordinator-operational row.
--    Category list mirrors lib/governance/feedback-audience.js's
--    MACHINE_TELEMETRY_CATEGORIES -- keep the two in lockstep if either changes.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_telemetry_dedup
  ON public.feedback (category, (metadata->>'dedup_hash'))
  WHERE category IN ('fleet_dormancy', 'harness_backlog', 'process_enforcement');

-- ============================================================
-- 2. record_telemetry_occurrence RPC.
--    Server-only (no anon grant): callers are trusted backend detectors/watchdogs
--    using a service-role Supabase client, matching emitFeedback()'s existing
--    trust boundary (it already has unrestricted feedback table access).
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_telemetry_occurrence(
  p_category text,
  p_dedup_hash text,
  p_title text,
  p_description text,
  p_severity text,
  p_source_application text,
  p_source_type text,
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing_row_id uuid;
BEGIN
  IF p_category NOT IN ('fleet_dormancy', 'harness_backlog', 'process_enforcement') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'category_not_telemetry');
  END IF;

  SELECT id INTO v_existing_row_id
  FROM public.feedback
  WHERE category = p_category
    AND metadata->>'dedup_hash' = p_dedup_hash
  LIMIT 1;

  IF v_existing_row_id IS NOT NULL THEN
    UPDATE public.feedback
    SET occurrence_count = COALESCE(occurrence_count, 1) + 1,
        last_seen = now(),
        description = p_description,
        updated_at = now()
    WHERE id = v_existing_row_id;

    RETURN jsonb_build_object('ok', true, 'action', 'aggregated', 'id', v_existing_row_id);
  END IF;

  INSERT INTO public.feedback (
    type, category, status, severity, source_application, source_type,
    title, description, occurrence_count, first_seen, last_seen, metadata
  ) VALUES (
    p_type, p_category, 'new', p_severity, p_source_application, p_source_type,
    left(p_title, 120), p_description, 1, now(), now(),
    p_metadata || jsonb_build_object('dedup_hash', p_dedup_hash, 'audience', 'machine-telemetry')
  )
  ON CONFLICT (category, (metadata->>'dedup_hash')) WHERE category IN ('fleet_dormancy', 'harness_backlog', 'process_enforcement')
  DO UPDATE SET occurrence_count = feedback.occurrence_count + 1, last_seen = now(), description = p_description, updated_at = now()
  RETURNING id INTO v_existing_row_id;

  RETURN jsonb_build_object('ok', true, 'action', 'created', 'id', v_existing_row_id);
END;
$$;

COMMENT ON FUNCTION public.record_telemetry_occurrence(text, text, text, text, text, text, text, text, jsonb)
  IS 'Server-only atomic UPSERT for machine-telemetry-category feedback rows: aggregates same-day repeat detections into ONE row with an incrementing occurrence_count instead of one row per detection. SD-LEO-INFRA-TELEMETRY-AUDIENCE-ROUTING-001 FR-2.';

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed):
-- ============================================================
-- DROP FUNCTION IF EXISTS public.record_telemetry_occurrence(text, text, text, text, text, text, text, text, jsonb);
-- DROP INDEX IF EXISTS idx_feedback_telemetry_dedup;
