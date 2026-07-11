-- Migration: Narrow feedback telemetry aggregation to fleet_dormancy only
-- SD: SD-LEO-INFRA-TELEMETRY-AUDIENCE-ROUTING-001 (VALIDATION-caught lockstep drift)
-- Purpose: 20260711_feedback_telemetry_aggregation_rpc.sql's partial unique index and
--          record_telemetry_occurrence()'s guard clause were scoped to
--          ('fleet_dormancy','harness_backlog','process_enforcement'), mirroring the
--          docs-only denylist convention -- but the application-side SSOT
--          (lib/governance/feedback-audience.js MACHINE_TELEMETRY_CATEGORIES) was
--          deliberately narrowed to ['fleet_dormancy'] only during EXEC, after
--          discovering 'harness_backlog' is emitFeedback()'s own broad default
--          category used by dozens of callers for genuinely distinct content.
--          The migration was never updated to match, leaving a real (if
--          low-probability) defect: the broad unique index constrains
--          (category, metadata->>dedup_hash) for harness_backlog rows too, even
--          though the JS write path never routes harness_backlog through the RPC --
--          a normal emitFeedback() insert-path harness_backlog row with a colliding
--          dedup_hash could now throw a 23505 unique-violation that never existed
--          before this SD. VALIDATION sub-agent finding (PLAN_VERIFICATION phase).
--          This migration narrows both the index and the RPC guard to match the
--          JS SSOT exactly, and fixes the prior migration's now-inaccurate comment.
-- Date: 2026-07-11

BEGIN;

-- ============================================================
-- 1. Replace the partial unique index with a narrower one scoped to
--    fleet_dormancy only, matching lib/governance/feedback-audience.js's
--    MACHINE_TELEMETRY_CATEGORIES exactly.
-- ============================================================
DROP INDEX IF EXISTS public.idx_feedback_telemetry_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_telemetry_dedup
  ON public.feedback (category, (metadata->>'dedup_hash'))
  WHERE category = 'fleet_dormancy';

-- ============================================================
-- 2. Narrow record_telemetry_occurrence()'s guard clause and ON CONFLICT
--    arbiter to match. CREATE OR REPLACE preserves the function's identity
--    (same signature) so no caller-side change is needed.
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
  IF p_category <> 'fleet_dormancy' THEN
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
  ON CONFLICT (category, (metadata->>'dedup_hash')) WHERE category = 'fleet_dormancy'
  DO UPDATE SET occurrence_count = feedback.occurrence_count + 1, last_seen = now(), description = p_description, updated_at = now()
  RETURNING id INTO v_existing_row_id;

  RETURN jsonb_build_object('ok', true, 'action', 'created', 'id', v_existing_row_id);
END;
$$;

COMMENT ON FUNCTION public.record_telemetry_occurrence(text, text, text, text, text, text, text, text, jsonb)
  IS 'Server-only atomic UPSERT for machine-telemetry-category feedback rows: aggregates same-day repeat detections into ONE row with an incrementing occurrence_count instead of one row per detection. Scoped to fleet_dormancy only -- matches lib/governance/feedback-audience.js MACHINE_TELEMETRY_CATEGORIES exactly (SD-LEO-INFRA-TELEMETRY-AUDIENCE-ROUTING-001 FR-2, narrowed post-VALIDATION).';

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed): restores the original (broader, now-known-
-- incorrect) 3-category scope from 20260711_feedback_telemetry_aggregation_rpc.sql.
-- ============================================================
-- DROP INDEX IF EXISTS idx_feedback_telemetry_dedup;
-- CREATE UNIQUE INDEX idx_feedback_telemetry_dedup ON public.feedback (category, (metadata->>'dedup_hash'))
--   WHERE category IN ('fleet_dormancy', 'harness_backlog', 'process_enforcement');
-- (function body would need the original 3-category IF NOT IN check restored)
