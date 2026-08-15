-- SD-LEO-FIX-CLOSE-ANON-VENTURE-001 — ownership-bound RPC replacing venture_user_insert_feedback
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AWAITING CHAIRMAN REVIEW — no @approved-by stamp exists for this file yet, deliberately (per the
-- established convention on this exact database instance: never write an approval stamp until an
-- approval actually happened — see database/chairman-gated/20260812_venture_ingest_key_binding.sql's
-- own header for the incident this convention prevents).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE DEFECT THIS CLOSES (measured live 2026-08-15, not inferred — see PRD PRD-SD-LEO-FIX-CLOSE-
-- ANON-VENTURE-001, FR-1)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- public.feedback's venture_user_insert_feedback policy (PERMISSIVE, anon, INSERT, applies to
-- feedback_type LIKE 'user_%') requires venture_id IS NOT NULL and venture_exists_and_active(venture_id)
-- — an EXISTENCE-only check (venture row exists, not soft-deleted, telemetry enabled) with NO
-- correlation to caller identity. An anon caller can therefore attribute a user_bug/user_feature_
-- request/user_usability/user_other row to ANY real active venture_id, not only one it has a
-- legitimate relationship to. auth.uid() is NULL for anon, so no RLS predicate can express "this
-- caller owns this venture" — ownership requires a caller-presented credential checked against a
-- per-venture record, hence this migration.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- RELATIONSHIP TO SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 PHASE-1 (completed 2026-08-13)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- database/chairman-gated/20260812_venture_ingest_key_binding.sql ("Phase-1", still STAGED, NOT
-- APPLIED as of 2026-08-15 — confirmed live: venture_ingest_keys and its four functions absent from
-- pg_proc/pg_class) already built a per-venture-secret ownership mechanism, but for a DIFFERENT
-- caller shape: fn_submit_venture_feedback targets source_type='venture_worker' (backend/service
-- callers), not this policy's user_%-prefixed anon-browser traffic. Phase-1's own header explicitly
-- names "tightening or removing ... venture_user_insert_feedback" as an out-of-scope, undesigned
-- "Phase 3". THIS FILE IS THAT PHASE-3 WORK — it REUSES Phase-1's venture_ingest_keys table and
-- _verify_venture_ingest_secret function exactly as-is (no fork, no reimplementation), adding only a
-- new, separately-named RPC for this traffic shape.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE CALLER-TOPOLOGY RESIDUAL (documented, not silently accepted — PRD FR-4)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- For a SERVER-SIDE secret holder (a backend service holding p_ingest_secret in process.env — e.g.
-- marketlens/src/services/feedback.js), this closes ownership cleanly. For a BROWSER-EXPOSED caller
-- (a secret shipped in a public client bundle — e.g. apexniche-ai/src/ui/api/feedbackClient.ts,
-- ehg/src/integrations/feedback/feedbackDataAccess.ts), no credential delivered to an anonymous
-- browser can remain secret from whoever loads that page — this is the SAME residual Phase-1's own
-- header names (HIGH-2) for its RPC. This migration converts GLOBAL cross-venture forgery into
-- PER-VENTURE forgery for such callers, a real reduction, but NOT full ownership proof against
-- someone targeting that one specific venture. Do not represent this migration as closing that case
-- fully — it narrows, it does not eliminate, for a browser-exposed secret.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SEQUENCING DEPENDENCY (PRD FR-7 — operational, not a DDL-enforceable check within this file)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- database/chairman-gated/20260813_revoke_telegram_bot_insert_feedback.sql (sibling, from the
-- completed SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001, also confirmed STAGED-NOT-APPLIED live 2026-08-15)
-- has its OWN $verify$ block that asserts venture_user_insert_feedback remains PRESENT with an
-- UNCHANGED WITH CHECK clause, and that anon retains table-level INSERT — all violated by THIS
-- file's own DROP POLICY action below. BEFORE APPLYING THIS FILE: confirm via a live pg_policies
-- read whether 20260813_revoke_telegram_bot_insert_feedback.sql has already landed (telegram_bot_
-- insert_feedback absent = already applied, no action needed) or is still pending (telegram_bot_
-- insert_feedback present = apply that migration first, or in the same ceremony immediately before
-- this one). Applying THIS file first would cause that sibling migration's own next apply attempt
-- to hard-fail on a confusing, seemingly-unrelated error.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CORRECTIONS FROM PROSPECTIVE PLAN-PHASE TESTING REVIEW (evidence ffe58c4e-7c8d-4d53-8dbf-
-- 8634b5f0ec62), applied before this file was first written, not discovered after
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- (1) The Phase-1 dependency check below is a PRE-FLIGHT guard (first statements after BEGIN),
--     never a trailing $verify$ block: a LANGUAGE sql function body referencing a missing
--     dependency would fail at CREATE FUNCTION parse time (check_function_bodies), before any
--     trailing block would ever run. This function uses LANGUAGE plpgsql specifically so a missing-
--     dependency failure, if the pre-flight guard were ever bypassed, would surface at CALL time
--     rather than at CREATE time with a confusing raw 42883 — but the pre-flight guard is the
--     primary, always-reached defense, tested per-branch (not OR-combined) so a typo in either
--     branch cannot be masked by the other.
-- (2) check_feedback_rate_limit returns TRUE when the caller IS rate-limited (confirmed live at
--     database/migrations/20260401_venture_user_feedback_channel.sql:117, "AND NOT check_feedback_
--     rate_limit(...)" in the existing policy) — the OPPOSITE polarity from _verify_venture_ingest_
--     secret (TRUE=authorized). The function body below uses a direct truthy check for the rate
--     limit and 'IS NOT TRUE' only for the ownership check — copying one idiom to both would invert
--     one of them.
-- (3) DROP POLICY only, NEVER a table-level REVOKE: the anon INSERT grant on public.feedback is
--     SHARED with anon_feedback_ingress_bounds (RESTRICTIVE, still governs every anon insert) and
--     possibly telegram_bot_insert_feedback (if the sibling revoke migration above hasn't landed
--     yet) — a table-level REVOKE would collaterally break those sibling policies, exactly the class
--     of defect tests/ddl/telegram-bot-insert-feedback-drop-ddl.db.test.js's own TR-1 assertion
--     exists to catch for the analogous sibling removal.
-- (4) This SECURITY DEFINER function never evaluates anon_feedback_ingress_bounds (rolbypassrls) —
--     a global cross-venture ceiling (500/hour, 10x the per-venture 50/hour threshold, matching
--     Phase-1's own documented reasoning for its equivalent backstop) is added below so this path
--     does not silently lose the cross-venture DoS protection that RESTRICTIVE policy provided for
--     the raw-INSERT path being replaced.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual, if needed — additive except for the one DROP POLICY, safe to reverse in one pass)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- REVOKE EXECUTE ON FUNCTION public.fn_submit_venture_user_feedback(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon, service_role;
-- DROP FUNCTION IF EXISTS public.fn_submit_venture_user_feedback(UUID, TEXT, TEXT, TEXT, TEXT);
-- CREATE POLICY venture_user_insert_feedback ON public.feedback
--   FOR INSERT TO anon
--   WITH CHECK (
--     feedback_type LIKE 'user_%'
--     AND venture_id IS NOT NULL
--     AND venture_exists_and_active(venture_id)
--     AND (NOT check_feedback_rate_limit(venture_id))
--   );

BEGIN;

-- ============================================================
-- 0. PRE-FLIGHT GUARD (FR-5/TR-5): Phase-1 prerequisites must exist before any CREATE FUNCTION
--    below. Two SEPARATE checks, not OR-combined, so a typo in one branch cannot be masked by
--    the other passing.
-- ============================================================
DO $preflight$
BEGIN
  IF to_regclass('public.venture_ingest_keys') IS NULL THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED: public.venture_ingest_keys does not exist -- apply database/chairman-gated/20260812_venture_ingest_key_binding.sql (SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 Phase-1) before this migration';
  END IF;
END
$preflight$;

DO $preflight2$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = '_verify_venture_ingest_secret' AND pronamespace = 'public'::regnamespace) = 0 THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED: public._verify_venture_ingest_secret does not exist -- apply database/chairman-gated/20260812_venture_ingest_key_binding.sql (SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 Phase-1) before this migration';
  END IF;
END
$preflight2$;

-- ============================================================
-- 1. fn_submit_venture_user_feedback (FR-1): the new ownership-bound RPC, the sole anon-callable
--    write path for feedback_type LIKE 'user_%' rows once the policy below is dropped. Reuses
--    Phase-1's venture_ingest_keys / _verify_venture_ingest_secret unmodified, and the pre-existing
--    check_feedback_rate_limit unmodified (FR-2 — no duplicate threshold invented).
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_submit_venture_user_feedback(
  p_venture_id UUID,
  p_ingest_secret TEXT,
  p_feedback_type TEXT,
  p_title TEXT,
  p_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_id UUID;
  v_venture_name TEXT;
  v_type TEXT;
  v_global_count BIGINT;
BEGIN
  -- Ownership check FIRST (uniform ERRCODE=28000, matching fn_submit_venture_feedback's convention
  -- so a wrong secret and a nonexistent venture_id are indistinguishable to the caller, TS-2/TS-3).
  -- _verify_venture_ingest_secret returns TRUE=authorized -- IS NOT TRUE is the correct fail-closed
  -- form HERE (contrast the rate-limit check below, which has the OPPOSITE polarity).
  IF public._verify_venture_ingest_secret(p_venture_id, p_ingest_secret) IS NOT TRUE THEN
    RAISE EXCEPTION 'fn_submit_venture_user_feedback: unauthorized' USING ERRCODE = '28000';
  END IF;

  -- Defense-in-depth: a venture can be soft-deleted or have telemetry ingestion disabled after its
  -- key was provisioned. Same uniform code -- do not distinguish "deactivated" from "unauthorized"
  -- (TS-7).
  IF public.venture_exists_and_active(p_venture_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'fn_submit_venture_user_feedback: unauthorized' USING ERRCODE = '28000';
  END IF;

  IF p_feedback_type NOT IN ('user_bug', 'user_feature_request', 'user_usability', 'user_other') THEN
    RAISE EXCEPTION 'fn_submit_venture_user_feedback: invalid feedback_type' USING ERRCODE = '22004';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'fn_submit_venture_user_feedback: title is required' USING ERRCODE = '22004';
  END IF;

  -- FR-2/TR-6: check_feedback_rate_limit returns TRUE when the caller IS rate-limited (confirmed
  -- live, database/migrations/20260401_venture_user_feedback_channel.sql:117) -- DIRECT TRUTHY
  -- CHECK, never 'IS NOT TRUE' (that idiom belongs to the OPPOSITE-polarity ownership check above;
  -- applying it here would invert this check).
  IF public.check_feedback_rate_limit(p_venture_id) THEN
    RAISE EXCEPTION 'fn_submit_venture_user_feedback: rate limited' USING ERRCODE = '53400';
  END IF;

  -- FR-2: global cross-venture ceiling, 10x the per-venture threshold (500/hour), matching Phase-1's
  -- own documented derivation for its equivalent backstop (fn_anon_ingress_prior_hour_count usage in
  -- database/chairman-gated/20260812_venture_ingest_key_binding.sql). This SECURITY DEFINER function
  -- never evaluates the RESTRICTIVE anon_feedback_ingress_bounds policy (rolbypassrls), so without
  -- this the cross-venture DoS protection that policy provided for the raw-INSERT path is silently
  -- lost, not merely narrowed.
  SELECT count(*) INTO v_global_count
  FROM public.feedback
  WHERE feedback_type IN ('user_bug', 'user_feature_request', 'user_usability', 'user_other')
    AND created_at > now() - interval '1 hour';
  IF v_global_count >= 500 THEN
    RAISE EXCEPTION 'fn_submit_venture_user_feedback: rate limited' USING ERRCODE = '53400';
  END IF;

  -- type is a coarser issue/enhancement classifier distinct from feedback_type (confirmed live via
  -- feedback_type_check vs feedback_feedback_type_check -- two separate CHECK constraints on two
  -- separate columns). Both are NOT NULL with no default on type, so both must be supplied.
  v_type := CASE WHEN p_feedback_type = 'user_feature_request' THEN 'enhancement' ELSE 'issue' END;

  -- source_application is NOT NULL with no default (confirmed live via information_schema.columns)
  -- -- mirrors fn_submit_venture_feedback's own convention of using the venture's name rather than a
  -- generic literal, so this stays informative if multiple ventures use this same RPC.
  SELECT coalesce(name, 'unknown-venture') INTO v_venture_name FROM public.ventures WHERE id = p_venture_id;

  -- created_at/status/votes/assigned_to/triaged_by/user_id are never parameters -- none can be
  -- client-forged (matches fn_submit_venture_feedback's established contract).
  INSERT INTO public.feedback (
    venture_id, feedback_type, type, source_type, source_application, title, description, status
  ) VALUES (
    p_venture_id, p_feedback_type, v_type, 'user_feedback', v_venture_name,
    left(p_title, 255), left(p_description, 2000), 'new'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'id', v_new_id);
END;
$$;

COMMENT ON FUNCTION public.fn_submit_venture_user_feedback(UUID, TEXT, TEXT, TEXT, TEXT) IS
  'SD-LEO-FIX-CLOSE-ANON-VENTURE-001 FR-1: ownership-bound replacement for the anon INSERT path on '
  'venture_user_insert_feedback. Uniform ERRCODE=28000 for every ownership-check reject path '
  '(TS-2/TS-3). created_at/status/votes/assigned_to/triaged_by/user_id are never parameters. For a '
  'browser-exposed secret (see this file''s header), this narrows cross-venture forgery but does not '
  'eliminate targeted forgery -- documented, not silently accepted.';

-- TR-2: explicit REVOKE FROM PUBLIC, authenticated BEFORE GRANT TO anon, service_role -- this
-- instance's ALTER DEFAULT PRIVILEGES grants EXECUTE directly to anon AND authenticated on every
-- freshly created function (confirmed live, same mechanism documented in Phase-1's own header), so
-- REVOKE FROM PUBLIC alone would not remove the direct authenticated grant.
REVOKE ALL ON FUNCTION public.fn_submit_venture_user_feedback(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_venture_user_feedback(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, service_role;

-- ============================================================
-- 2. DROP the vulnerable policy (FR-3). DROP POLICY only, NEVER a table-level REVOKE -- see header
--    correction (3). The table-level anon INSERT grant remains untouched and is asserted unchanged
--    by the $verify$ block below.
-- ============================================================
DROP POLICY IF EXISTS venture_user_insert_feedback ON public.feedback;

-- ============================================================
-- 3. Self-verify (TR-3): static catalog assertions only -- the dynamic "a raw anon INSERT is now
--    rejected" behavioral proof (TS-5) lives in this file's DDL test (rolled-back transactions with
--    SET LOCAL ROLE anon), matching this SD family's established split between static $verify$
--    checks here and dynamic behavioral tests in tests/ddl/.
-- ============================================================
DO $verify$
BEGIN
  -- FR-3: the vulnerable policy is gone.
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feedback' AND policyname = 'venture_user_insert_feedback') <> 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_user_insert_feedback still present in pg_policies';
  END IF;

  -- FR-3(d): the table-level anon INSERT grant was NOT collaterally revoked -- it is shared with
  -- anon_feedback_ingress_bounds and possibly telegram_bot_insert_feedback.
  IF has_table_privilege('anon', 'public.feedback', 'INSERT') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: anon lost table-level INSERT privilege on public.feedback -- other anon-reachable policies on this table would become unreachable';
  END IF;

  -- Sibling policy integrity: anon_feedback_ingress_bounds must remain present, INSERT-scoped,
  -- RESTRICTIVE, and still apply to the public role -- mutation-resistant per this SD family's
  -- established discipline (mirrors telegram-revoke migration's own M1b/M1c assertions).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'feedback' AND policyname = 'anon_feedback_ingress_bounds'
      AND cmd = 'INSERT' AND permissive = 'RESTRICTIVE' AND 'public' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'VERIFY FAILED: anon_feedback_ingress_bounds is missing, no longer applies to INSERT, is no longer RESTRICTIVE, or no longer applies to the public role';
  END IF;

  -- public.feedback still has RLS enabled.
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.feedback'::regclass) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: public.feedback does not have RLS enabled';
  END IF;

  -- TR-2/TR-3: full grant posture on the new function -- anon and service_role CAN execute it,
  -- PUBLIC and authenticated CANNOT.
  IF has_function_privilege('anon', 'public.fn_submit_venture_user_feedback(uuid,text,text,text,text)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_submit_venture_user_feedback is NOT anon-callable -- the fix would be unreachable';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_submit_venture_user_feedback(uuid,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_submit_venture_user_feedback is callable by authenticated -- should be anon/service_role only';
  END IF;

  -- TR-3: defense-in-depth re-check that Phase-1's own lockdown of the objects this function reuses
  -- still holds (in case a manual grant mistake weakened it between Phase-1's apply and this one).
  IF has_function_privilege('anon', 'public._verify_venture_ingest_secret(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._verify_venture_ingest_secret(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: _verify_venture_ingest_secret is callable by anon or authenticated -- Phase-1 lockdown appears weakened';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'venture_ingest_keys'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  ) THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_ingest_keys is reachable by anon/authenticated/PUBLIC -- Phase-1 lockdown appears weakened';
  END IF;
END
$verify$;

-- PostgREST caches the schema; without this, fn_submit_venture_user_feedback returns 404/PGRST202
-- to real anon clients until PostgREST's own reload cycle catches up (established convention, e.g.
-- database/chairman-gated/20260812_venture_ingest_key_binding.sql).
NOTIFY pgrst, 'reload schema';

COMMIT;
