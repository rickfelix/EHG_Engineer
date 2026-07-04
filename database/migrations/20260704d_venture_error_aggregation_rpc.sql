-- Migration: Venture Error Aggregation RPC (anon-safe, storm-resistant)
-- SD: SD-LEO-INFRA-UNIVERSAL-VENTURE-TELEMETRY-001 (FR-2)
-- Purpose: extend the feedback table's feedback_type CHECK to add 'venture_error',
--          and add a SECURITY DEFINER RPC (record_venture_error) the anon role can
--          EXECUTE to safely aggregate venture-forwarded application errors —
--          the client NEVER writes occurrence_count/first_seen/last_seen directly,
--          only this function's internal server-side logic does. Mirrors the
--          established SECURITY DEFINER pattern from
--          20260401_venture_user_feedback_channel.sql (check_feedback_rate_limit),
--          extended with a fixed search_path (SECURITY sub-agent condition C1) and
--          a per-venture distinct-fingerprint storm ceiling (C6) that the sibling
--          migration's plain-INSERT feedback path doesn't need.
-- Date: 2026-07-04

BEGIN;

-- ============================================================
-- 1. Extend feedback_type CHECK to add 'venture_error'
-- ============================================================
ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_feedback_type_check;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_feedback_type_check
  CHECK (feedback_type IN (
    'sentry_error',
    'user_bug',
    'user_feature_request',
    'user_usability',
    'user_other',
    'venture_error'
  ));

-- ============================================================
-- 2. Partial unique index — the ON CONFLICT arbiter for the RPC's UPSERT.
--    SECURITY condition C3: scoped to feedback_type='venture_error' only, so
--    the RPC can never match/increment a 'sentry_error' row (no cross-type
--    forge-increment via a shared (venture_id, error_hash) collision).
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_venture_error_hash
  ON public.feedback (venture_id, error_hash)
  WHERE feedback_type = 'venture_error' AND venture_id IS NOT NULL;

-- ============================================================
-- 3. Per-venture distinct-fingerprint storm ceiling (SECURITY condition C6).
--    A repeat of an ALREADY-SEEN error_hash for a venture always aggregates
--    normally (the whole point of dedup). A NEW distinct fingerprint past the
--    ceiling within the trailing window is NOT inserted as its own row —
--    instead a per-venture watermark row is bumped, so a storm of distinct
--    fingerprints is fail-closed-but-counted (observable), never silently
--    dropped and never floods the chairman's inbox with N distinct rows.
-- ============================================================
CREATE OR REPLACE FUNCTION public._venture_error_storm_watermark_hash()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- Fixed sentinel hash (64 hex chars, same charset as a real sha256 error_hash)
  -- reserved for the per-venture storm watermark row. Never a real error_hash.
  SELECT 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
$$;

-- ============================================================
-- 4. record_venture_error RPC.
--    SECURITY condition C1: search_path pinned so the function cannot be
--    tricked by a session-level search_path override into resolving an
--    attacker-controlled object.
--    SECURITY condition C2: SECURITY DEFINER + GRANT EXECUTE (not a table
--    grant) is the ONLY way the anon role can write these columns.
--    SECURITY condition C4: p_error_hash validated to a fixed hex charset
--    and length before use, preventing hash-collision gaming and unbounded
--    distinct-fingerprint cardinality abuse.
--    SECURITY condition C5: no dynamic SQL; p_message length-capped;
--    p_context size-bounded via jsonb (no unbounded text concatenation).
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_venture_error(
  p_venture_id uuid,
  p_error_hash text,
  p_message text,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ceiling constant integer := 20; -- distinct fingerprints per venture per hour
  v_window constant interval := interval '1 hour';
  v_distinct_count integer;
  v_watermark_hash text := public._venture_error_storm_watermark_hash();
  v_existing_row_id uuid;
  v_result jsonb;
BEGIN
  -- Validate error_hash: exactly 64 lowercase hex chars (sha256-shaped).
  IF p_error_hash IS NULL OR p_error_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_error_hash');
  END IF;

  -- Bound message/context size (defense-in-depth; app-side already caps these).
  IF p_message IS NOT NULL AND length(p_message) > 2000 THEN
    p_message := left(p_message, 2000);
  END IF;
  IF p_context IS NOT NULL AND octet_length(p_context::text) > 8000 THEN
    p_context := jsonb_build_object('truncated', true);
  END IF;

  -- Venture must exist, not be soft-deleted, and not have ingestion explicitly
  -- disabled (FR-4 revocation — metadata->>'telemetry_ingestion_enabled'='false').
  -- Absent/null means enabled (existing ventures are not silently disabled).
  IF NOT EXISTS (
    SELECT 1 FROM public.ventures v
    WHERE v.id = p_venture_id
      AND v.deleted_at IS NULL
      AND COALESCE(v.metadata->>'telemetry_ingestion_enabled', 'true') <> 'false'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'venture_not_eligible');
  END IF;

  -- Repeat of an already-seen fingerprint: always aggregate, ceiling doesn't apply.
  SELECT id INTO v_existing_row_id
  FROM public.feedback
  WHERE venture_id = p_venture_id
    AND feedback_type = 'venture_error'
    AND error_hash = p_error_hash
  LIMIT 1;

  IF v_existing_row_id IS NOT NULL THEN
    UPDATE public.feedback
    SET occurrence_count = occurrence_count + 1,
        last_seen = now(),
        updated_at = now()
    WHERE id = v_existing_row_id;

    RETURN jsonb_build_object('ok', true, 'action', 'aggregated', 'id', v_existing_row_id);
  END IF;

  -- New distinct fingerprint: check the per-venture storm ceiling.
  SELECT count(DISTINCT error_hash) INTO v_distinct_count
  FROM public.feedback
  WHERE venture_id = p_venture_id
    AND feedback_type = 'venture_error'
    AND error_hash <> v_watermark_hash
    AND created_at > now() - v_window;

  IF v_distinct_count >= v_ceiling THEN
    -- Fail closed-but-counted: bump the per-venture watermark, do not create
    -- a new per-fingerprint row. Observable — a watermark spike is an alertable
    -- "this venture is storming" signal, not a silent drop.
    INSERT INTO public.feedback (
      venture_id, feedback_type, source_type, source_application,
      error_hash, error_message, occurrence_count, first_seen, last_seen,
      title, description, type, status, severity
    ) VALUES (
      p_venture_id, 'venture_error', 'error_capture',
      (SELECT name FROM public.ventures WHERE id = p_venture_id),
      v_watermark_hash, '[STORM SUPPRESSED] distinct-fingerprint ceiling exceeded',
      1, now(), now(),
      'Venture error storm watermark', 'Distinct-fingerprint ceiling exceeded for this venture in the trailing window',
      'issue', 'new', 'high'
    )
    ON CONFLICT (venture_id, error_hash) WHERE feedback_type = 'venture_error' AND venture_id IS NOT NULL
    DO UPDATE SET occurrence_count = feedback.occurrence_count + 1, last_seen = now(), updated_at = now();

    RETURN jsonb_build_object('ok', true, 'action', 'storm_suppressed');
  END IF;

  -- New distinct fingerprint, under the ceiling: insert normally.
  INSERT INTO public.feedback (
    venture_id, feedback_type, source_type, source_application,
    error_hash, error_message, occurrence_count, first_seen, last_seen,
    title, description, type, status, severity, metadata
  ) VALUES (
    p_venture_id, 'venture_error', 'error_capture',
    (SELECT name FROM public.ventures WHERE id = p_venture_id),
    p_error_hash, p_message, 1, now(), now(),
    left(coalesce(p_message, 'Venture error'), 200), coalesce(p_message, ''),
    'issue', 'new', 'medium', p_context
  )
  RETURNING id INTO v_existing_row_id;

  RETURN jsonb_build_object('ok', true, 'action', 'created', 'id', v_existing_row_id);
END;
$$;

COMMENT ON FUNCTION public.record_venture_error(uuid, text, text, jsonb)
  IS 'Anon-callable SECURITY DEFINER RPC: aggregates venture-forwarded application errors into the feedback table. Client never writes occurrence_count/first_seen/last_seen directly. Per-venture distinct-fingerprint storm ceiling fails closed-but-counted via a watermark row. SD-LEO-INFRA-UNIVERSAL-VENTURE-TELEMETRY-001 FR-2.';

-- SECURITY condition C2: EXECUTE only, no table-level grant. anon already has
-- no direct INSERT/UPDATE path to venture_error rows (the existing
-- venture_user_insert_feedback RLS policy only matches feedback_type LIKE
-- 'user_%', which 'venture_error' does not) — this REVOKE is defense-in-depth
-- documentation, not a functional change.
REVOKE ALL ON FUNCTION public.record_venture_error(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_venture_error(uuid, text, text, jsonb) TO anon;

-- ============================================================
-- 5. Index to support the storm-ceiling window query.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_feedback_venture_error_created
  ON public.feedback (venture_id, created_at DESC)
  WHERE feedback_type = 'venture_error';

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed):
-- ============================================================
-- REVOKE EXECUTE ON FUNCTION public.record_venture_error(uuid, text, text, jsonb) FROM anon;
-- DROP FUNCTION IF EXISTS public.record_venture_error(uuid, text, text, jsonb);
-- DROP FUNCTION IF EXISTS public._venture_error_storm_watermark_hash();
-- DROP INDEX IF EXISTS idx_feedback_venture_error_created;
-- DROP INDEX IF EXISTS idx_feedback_venture_error_hash;
-- ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_feedback_type_check;
-- ALTER TABLE public.feedback ADD CONSTRAINT feedback_feedback_type_check
--   CHECK (feedback_type IN ('sentry_error','user_bug','user_feature_request','user_usability','user_other'));
