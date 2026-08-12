-- SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 — per-venture secret-bound ingest RPCs
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AWAITING CHAIRMAN REVIEW — no @approved-by stamp exists for this file yet, deliberately. This
-- SD's own LEAD-phase finding (signal 89b287e5) caught a SIBLING chairman-gated file whose header
-- claimed "not applied" while pg_catalog showed it live — the fix for that class of drift is never
-- writing an approval stamp until an approval actually happened, not writing one and hoping to
-- correct it later. If this file is ever found APPLIED without an @approved-by line above this
-- paragraph, that is itself a policy violation worth signaling, independent of whether the DDL is
-- otherwise correct.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE DEFECT THIS CLOSES (verified live, all probes rolled back — see PLAN-phase evidence
-- dff83abd (LEAD VALIDATION) and 3db8cfa8 (PLAN TESTING) on this SD)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--   public.feedback policy telegram_bot_insert_feedback: WITH CHECK (source_type = 'telegram').
--   No venture predicate at all — any anon caller can INSERT a row with ANY venture_id by setting
--   source_type='telegram', including forged votes/status/created_at.
--
--   public.record_venture_error: SECURITY DEFINER, anon-EXECUTE, validates venture_id via
--   venture_exists_and_active() — EXISTENCE only, never OWNERSHIP. Any anon-key holder (the key
--   ships in every venture's public bundle, confirmed in apexniche-ai and marketlens) can attribute
--   an error to ANY venture_id, not just their own.
--
--   Neither surface can be fixed by tightening RLS alone: auth.uid() is NULL for anon, so a raw
--   table policy structurally cannot express "this caller owns this venture". Ownership requires a
--   caller-presented credential checked against a per-venture record — hence this migration.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS IS NOT AS SIMPLE AS "ADD A SECRET CHECK" — TWO CORRECTIONS FROM PLAN-PHASE TESTING
-- (evidence 3db8cfa8, both incorporated below; the PRD text these functions implement was revised
-- to match)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- (1) A SECURITY DEFINER function owned by a role with rolbypassrls=true, writing to a table with
--     relforcerowsecurity=false, NEVER evaluates that table's RLS policies — including the
--     RESTRICTIVE anon_feedback_ingress_bounds rate-limit/content-integrity policy already live on
--     public.feedback. This is the exact G1 mechanism already documented for record_venture_error.
--     Every protection that policy provides (per-source_type rate limit, severity/category
--     integrity) is therefore re-implemented EXPLICITLY inside fn_submit_venture_feedback's body
--     below, not inherited. Skipping this would make the "fix" silently weaker than the status quo
--     for every OTHER anon-writable path that still goes through RLS.
-- (2) Adding a required parameter to record_venture_error's EXISTING signature would create a
--     PostgREST same-name RPC overload (resolved by argument-name set), returning PGRST203
--     (ambiguous function) for apexniche-ai/src/lib/error-capture.ts and
--     marketlens/src/lib/errorCapture.js the instant this migration applies — before either repo's
--     calling code has changed. fn_submit_venture_error below is therefore a NEW, separately-named
--     function; record_venture_error's existing signature is left completely untouched and keeps
--     serving unmigrated callers. Its anon-EXECUTE grant is revoked only as an explicit, separate,
--     later follow-on once FR-5's caller migration is confirmed complete — not part of this file.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SCOPE OF THIS FILE (Phase 1 only, per the PRD's implementation_approach)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- This file ONLY adds new, additive objects (one table, five functions, two CHECK-constraint
-- widenings) and does NOT touch any existing anon grant, policy, or function signature. Nothing
-- existing stops working when this applies. Two follow-on steps are explicitly OUT of scope here
-- and require separate chairman-ratified migrations once callers have migrated:
--   (a) revoking anon-EXECUTE on record_venture_error's original signature
--   (b) tightening or removing telegram_bot_insert_feedback / venture_user_insert_feedback
-- Rollback: DROP the five functions and the venture_ingest_keys table (see foot of file); the
-- ALTER TABLE feedback_type CHECK widening is additive (new value only) and safe to leave in place
-- even on rollback — it does not change behavior for any existing feedback_type value.

BEGIN;

-- ============================================================
-- 1. venture_ingest_keys: one secret per venture. RLS-deny-all — no policy is defined for
--    any role, so only a SECURITY DEFINER function body or a service_role connection can read
--    a row. Mirrors sms_relay_secret's access shape (database/migrations/20260717_sms_relay_
--    staging.sql), keyed per-venture instead of a singleton.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.venture_ingest_keys (
  venture_id UUID PRIMARY KEY REFERENCES public.ventures(id),
  ingest_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ
);

COMMENT ON TABLE public.venture_ingest_keys IS
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001: one secret per venture, used by fn_submit_venture_feedback '
  'and fn_submit_venture_error to bind an anon-authenticated write to a SPECIFIC venture, closing the '
  'existence-only venture_id validation gap on public.feedback and record_venture_error. RLS-deny-all '
  '(no policy for anon/authenticated/service_role) PLUS an explicit table-level REVOKE below — this '
  'instance''s ALTER DEFAULT PRIVILEGES was measured live (migration dry-run, rolled back) to grant '
  'every new public-schema table full SELECT/INSERT/UPDATE/DELETE to anon and authenticated BY '
  'DEFAULT, independent of RLS. RLS alone would still functionally deny access, but the explicit '
  'REVOKE means this table''s safety does not depend solely on RLS remaining enabled — the same '
  'defense-in-depth posture database/migrations/20260803_drive_reports.sql already established for '
  'a comparably sensitive table on this instance.';

ALTER TABLE public.venture_ingest_keys ENABLE ROW LEVEL SECURITY;

-- Explicit, belt-and-suspenders REVOKE (see COMMENT above for why this is not redundant with RLS).
REVOKE ALL ON public.venture_ingest_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.venture_ingest_keys TO service_role;

-- ============================================================
-- 2. fn_venture_ingest_prior_hour_count: per-venture, per-source_type counting basis for the
--    rate limit the new RPC has to re-implement itself (see correction (1) above). Mirrors
--    fn_anon_ingress_prior_hour_count's shape (database/chairman-gated/20260804_ingress_bound_
--    definer_basis.sql) but keyed additionally by venture_id, closing the cross-venture DoS gap
--    FR-4 describes (one venture's flood no longer exhausts another's budget).
--    Deliberately NOT anon/authenticated-executable: it is only ever reached via a nested call
--    from inside another SECURITY DEFINER function, which executes as the function owner
--    regardless of grants — granting it directly to anon would additionally hand out a free
--    "how many events has venture X submitted this hour" oracle with no ownership check.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_venture_ingest_prior_hour_count(p_venture_id UUID, p_source_type TEXT)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT count(*)
  FROM public.feedback f
  WHERE f.venture_id = p_venture_id
    AND f.source_type IS NOT DISTINCT FROM p_source_type
    AND f.created_at > now() - interval '1 hour';
$function$;

COMMENT ON FUNCTION public.fn_venture_ingest_prior_hour_count(UUID, TEXT) IS
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001: per-venture-and-source_type prior-hour count, used '
  'internally by fn_submit_venture_feedback to close the cross-venture DoS gap left by the existing '
  'global-per-source_type anon_feedback_ingress_bounds policy (which additionally never evaluates '
  'for a SECURITY DEFINER caller in the first place).';

REVOKE ALL ON FUNCTION public.fn_venture_ingest_prior_hour_count(UUID, TEXT) FROM PUBLIC;

-- ============================================================
-- 3. _verify_venture_ingest_secret: shared secret-check helper. Returns FALSE uniformly whether
--    the venture has no provisioned key at all, or has one that does not match — the caller
--    cannot distinguish "venture unknown" from "venture known, wrong secret" from this alone
--    (TS-6). Not anon/authenticated-executable for the same nested-call reason as above; also
--    avoids handing out a standalone secret-guessing oracle independent of the RPCs' other
--    business-logic latency.
--    Known residual limitation (documented, not fixed here): the equality check below is a plain
--    IS NOT DISTINCT FROM, not constant-time — identical to the precedent this migration follows
--    (fn_relay_insert_sms_candidate's p_relay_secret check, database/migrations/20260717_sms_
--    relay_staging.sql:103), not a new gap introduced by this file.
-- ============================================================
CREATE OR REPLACE FUNCTION public._verify_venture_ingest_secret(p_venture_id UUID, p_ingest_secret TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.venture_ingest_keys k
    WHERE k.venture_id = p_venture_id
      AND p_ingest_secret IS NOT NULL
      AND k.ingest_secret = p_ingest_secret
  );
$function$;

COMMENT ON FUNCTION public._verify_venture_ingest_secret(UUID, TEXT) IS
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001: uniform venture-ownership check — FALSE for both a '
  'nonexistent venture_id and a real venture_id with the wrong secret, so response shape does not '
  'enumerate venture existence (TS-6).';

REVOKE ALL ON FUNCTION public._verify_venture_ingest_secret(UUID, TEXT) FROM PUBLIC;

-- ============================================================
-- 4. fn_provision_venture_ingest_key: mints (or rotates) a venture's secret. service_role only —
--    this is a chairman/operator/backend-only action per FR-5, never client-callable. Returns the
--    plaintext secret ONCE, at mint time; after this call the table is unreadable to anything but
--    a service_role connection or another SECURITY DEFINER function body.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_provision_venture_ingest_key(p_venture_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ventures WHERE id = p_venture_id) THEN
    RAISE EXCEPTION 'fn_provision_venture_ingest_key: venture % does not exist', p_venture_id
      USING ERRCODE = '22023';
  END IF;

  -- gen_random_bytes lives in the extensions schema (pgcrypto), not public — confirmed live via
  -- pg_extension.extnamespace, matching the pinned search_path convention already established in
  -- database/migrations/20260602_pin_search_path_invoker_functions.sql.
  v_secret := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.venture_ingest_keys (venture_id, ingest_secret, created_at, rotated_at)
  VALUES (p_venture_id, v_secret, now(), NULL)
  ON CONFLICT (venture_id) DO UPDATE
    SET ingest_secret = EXCLUDED.ingest_secret,
        rotated_at = now();

  RETURN v_secret;
END;
$$;

COMMENT ON FUNCTION public.fn_provision_venture_ingest_key(UUID) IS
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 FR-5: mints or rotates a venture''s ingest secret. '
  'service_role only. Returns the plaintext secret ONCE — store it in that venture''s deployment '
  'env immediately, it cannot be read back from venture_ingest_keys afterward.';

REVOKE ALL ON FUNCTION public.fn_provision_venture_ingest_key(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_provision_venture_ingest_key(UUID) TO service_role;

-- ============================================================
-- 5. Widen feedback_type CHECK to add 'venture_feedback' — the new type this migration's
--    feedback-path RPC writes, distinct from 'venture_error' (reserved for error-capture) and
--    from every 'user_%' type (reserved for the existing human-submitted venture_user_insert_
--    feedback path, which this migration does not touch). Additive only.
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
    'venture_error',
    'venture_feedback'
  ));

-- ============================================================
-- 5b. Widen feedback_source_type_check to add 'venture_worker' — fn_submit_venture_feedback's
--     source_type, distinct from every existing allowed value (manual_feedback, auto_capture,
--     uat_failure, error_capture, uncaught_exception, unhandled_rejection, manual_capture,
--     todoist_intake, youtube_intake, claude_code_intake, telegram, user_feedback), verified
--     live via pg_get_constraintdef before writing this ALTER — 'venture_worker' does not
--     collide with any of them. 'error_capture' (fn_submit_venture_error's source_type) is
--     already in the existing list, matching record_venture_error's own convention — no change
--     needed there. Additive only.
-- ============================================================
ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_source_type_check;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_source_type_check
  CHECK (source_type IN (
    'manual_feedback',
    'auto_capture',
    'uat_failure',
    'error_capture',
    'uncaught_exception',
    'unhandled_rejection',
    'manual_capture',
    'todoist_intake',
    'youtube_intake',
    'claude_code_intake',
    'telegram',
    'user_feedback',
    'venture_worker'
  ));

-- ============================================================
-- 6. fn_submit_venture_feedback: the new, ownership-bound replacement write path for anon
--    feedback submissions. Uniform ERRCODE=28000 for the ownership check (TS-1, TS-6); server-
--    derived created_at/status/votes/assigned_to/triaged_by/user_id — none of these are
--    parameters, so none can be client-forged (TS-2, FR-2 AC-2). Re-implements BOTH protections
--    the RESTRICTIVE anon_feedback_ingress_bounds policy provides but which never evaluate for a
--    SECURITY DEFINER caller: the per-source_type/per-venture rate limit (FR-4, TS-4), and the
--    severity/category content-integrity bound the original policy also carries (mirrored here
--    for parity — this is the same "RLS never evaluates" mechanism applied to a second existing
--    protection, not just the rate limit).
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_submit_venture_feedback(
  p_venture_id UUID,
  p_ingest_secret TEXT,
  p_source_type TEXT,
  p_severity TEXT,
  p_category TEXT,
  p_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_id UUID;
  v_venture_name TEXT;
BEGIN
  -- Ownership check FIRST, before any business-logic branch, so a nonexistent venture_id and a
  -- real venture_id with the wrong secret are indistinguishable (TS-6).
  IF NOT public._verify_venture_ingest_secret(p_venture_id, p_ingest_secret) THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: unauthorized' USING ERRCODE = '28000';
  END IF;

  IF NOT public.venture_exists_and_active(p_venture_id) THEN
    -- Defense-in-depth: a venture can be soft-deleted or have ingestion disabled after its key
    -- was provisioned. Same uniform code — do not distinguish "deactivated" from "unauthorized".
    RAISE EXCEPTION 'fn_submit_venture_feedback: unauthorized' USING ERRCODE = '28000';
  END IF;

  IF p_source_type IS DISTINCT FROM 'venture_worker' THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: invalid source_type' USING ERRCODE = '22004';
  END IF;

  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: message is required' USING ERRCODE = '22004';
  END IF;
  IF length(p_message) > 2000 THEN
    p_message := left(p_message, 2000);
  END IF;

  -- Content-integrity bound, mirrored from anon_feedback_ingress_bounds (which does not
  -- evaluate for this SECURITY DEFINER path — see file header correction (1)).
  IF p_severity IS NOT NULL AND p_severity IN ('critical', 'high') THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: severity not permitted on this path' USING ERRCODE = '22004';
  END IF;
  IF p_category IS NOT DISTINCT FROM 'chairman_decision_deferred' THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: category not permitted on this path' USING ERRCODE = '22004';
  END IF;

  -- Rate limit, mirrored from anon_feedback_ingress_bounds for the same reason, PLUS the new
  -- per-venture scope (FR-4, TS-4) that policy never had.
  IF public.fn_anon_ingress_prior_hour_count('venture_worker') >= 250 THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: rate limited' USING ERRCODE = '53400';
  END IF;
  IF public.fn_venture_ingest_prior_hour_count(p_venture_id, 'venture_worker') >= 50 THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: rate limited' USING ERRCODE = '53400';
  END IF;

  SELECT name INTO v_venture_name FROM public.ventures WHERE id = p_venture_id;

  INSERT INTO public.feedback (
    venture_id, feedback_type, source_type, source_application,
    severity, category, title, description, type, status
  ) VALUES (
    p_venture_id, 'venture_feedback', 'venture_worker', v_venture_name,
    p_severity, p_category, left(p_message, 200), p_message, 'issue', 'new'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'id', v_new_id);
END;
$$;

COMMENT ON FUNCTION public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 FR-2: ownership-bound replacement for anon feedback '
  'writes. Uniform ERRCODE=28000 for every ownership-check reject path (TS-1, TS-6). Re-implements '
  'the rate-limit and content-integrity checks that anon_feedback_ingress_bounds cannot provide for '
  'a SECURITY DEFINER caller (TS-4). created_at/status/votes/assigned_to/triaged_by/user_id are '
  'never parameters (TS-2).';

REVOKE ALL ON FUNCTION public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================
-- 7. fn_submit_venture_error: NEW, separately-named error-capture RPC (correction (2) above —
--    NOT an overload of record_venture_error). Same dedup / per-venture distinct-fingerprint
--    storm-ceiling logic as record_venture_error (database/migrations/20260704d_venture_error_
--    aggregation_rpc.sql), reusing the SAME idx_feedback_venture_error_hash unique index and
--    _venture_error_storm_watermark_hash() helper — both already exist and are untouched by this
--    file — so rows from either the old or the new function dedup/aggregate together correctly.
--    Only the caller-authentication differs: this path requires the per-venture secret first.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_submit_venture_error(
  p_venture_id UUID,
  p_ingest_secret TEXT,
  p_error_hash TEXT,
  p_message TEXT,
  p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ceiling CONSTANT INTEGER := 20;
  v_window CONSTANT INTERVAL := interval '1 hour';
  v_distinct_count INTEGER;
  v_watermark_hash TEXT := public._venture_error_storm_watermark_hash();
  v_existing_row_id UUID;
BEGIN
  -- Ownership check FIRST — same uniform code, same reasoning as fn_submit_venture_feedback (TS-6).
  IF NOT public._verify_venture_ingest_secret(p_venture_id, p_ingest_secret) THEN
    RAISE EXCEPTION 'fn_submit_venture_error: unauthorized' USING ERRCODE = '28000';
  END IF;

  IF p_error_hash IS NULL OR p_error_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_error_hash');
  END IF;

  IF p_message IS NOT NULL AND length(p_message) > 2000 THEN
    p_message := left(p_message, 2000);
  END IF;
  IF p_context IS NOT NULL AND octet_length(p_context::text) > 8000 THEN
    p_context := jsonb_build_object('truncated', true);
  END IF;

  IF NOT public.venture_exists_and_active(p_venture_id) THEN
    RAISE EXCEPTION 'fn_submit_venture_error: unauthorized' USING ERRCODE = '28000';
  END IF;

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

  SELECT count(DISTINCT error_hash) INTO v_distinct_count
  FROM public.feedback
  WHERE venture_id = p_venture_id
    AND feedback_type = 'venture_error'
    AND error_hash <> v_watermark_hash
    AND created_at > now() - v_window;

  IF v_distinct_count >= v_ceiling THEN
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

COMMENT ON FUNCTION public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB) IS
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 FR-3: ownership-bound sibling of record_venture_error. '
  'A NEW, separately-named function (not an added parameter on the existing signature) to avoid a '
  'PostgREST same-name RPC overload (PGRST203) that would otherwise break every unmigrated caller '
  'the instant this migration applies (TS-5). record_venture_error itself is untouched by this file.';

REVOKE ALL ON FUNCTION public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed — additive-only migration, safe to reverse in one pass):
-- ============================================================
-- REVOKE EXECUTE ON FUNCTION public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB) FROM anon, service_role;
-- DROP FUNCTION IF EXISTS public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB);
-- REVOKE EXECUTE ON FUNCTION public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, service_role;
-- DROP FUNCTION IF EXISTS public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
-- REVOKE EXECUTE ON FUNCTION public.fn_provision_venture_ingest_key(UUID) FROM service_role;
-- DROP FUNCTION IF EXISTS public.fn_provision_venture_ingest_key(UUID);
-- DROP FUNCTION IF EXISTS public._verify_venture_ingest_secret(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.fn_venture_ingest_prior_hour_count(UUID, TEXT);
-- REVOKE ALL ON public.venture_ingest_keys FROM service_role;
-- DROP TABLE IF EXISTS public.venture_ingest_keys;
-- (feedback_type and source_type CHECK widenings are left in place — additive, no behavior
--  change for any existing value)
