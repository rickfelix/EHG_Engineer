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
-- NEW-1 (SECURITY sub-agent, EXEC re-review, evidence 378ea5c4-a693-456d-9c40-58b6b12a965f, non-
-- blocking scope-precision note): this SD's own name can be over-read as closing ALL anon venture-
-- spoofing. It does not. record_venture_error (a DIFFERENT anon-executable SECURITY DEFINER
-- function) hardcodes feedback_type='venture_error'/source_type='error_capture' as literals, so it
-- cannot be driven to emit a user_%-type row and this migration's own acceptance criterion is
-- unaffected — but it retains the SAME existence-only (not ownership) venture_id check for the
-- venture_error shape specifically, deliberately out of scope here and already named as deferred
-- work in Phase-1's own header (database/chairman-gated/20260812_venture_ingest_key_binding.sql).
-- User_%-shaped spoofing: closed by this file (plus its sibling, see below). Venture_error-shaped
-- spoofing: still open, owned by SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001, not this SD.
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
-- SEC-M3 (SECURITY sub-agent, EXEC review, documentation-only, evidence cefd6b89-cf93-4b34-8b4e-
-- e9b348795bd2): GLOBAL-CEILING SCALING TRIPWIRE. A single browser-exposed secret can drive one
-- venture to its own 50/hour per-venture threshold; the 500/hour global ceiling therefore starts
-- meaningfully constraining LEGITIMATE traffic once roughly 10 browser-exposed ventures are each
-- independently near their own per-venture cap in the same trailing hour -- at that point the global
-- ceiling degrades from "cross-venture DoS backstop" toward "shared budget venture operators compete
-- for." Not a blocker today (current traffic measured two orders of magnitude below this ceiling,
-- per the SECURITY sub-agent's own live measurement), but worth revisiting if browser-exposed adoption
-- grows materially past that scale.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SEQUENCING DEPENDENCY IS SECURITY-LOAD-BEARING, NOT MERE APPLY-ORDER HYGIENE (PRD FR-7 — CORRECTED
-- post-EXEC, SECURITY sub-agent HIGH-1 finding, evidence cefd6b89-cf93-4b34-8b4e-e9b348795bd2)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THIS MIGRATION ALONE DOES NOT FULLY CLOSE THE VENTURE-SPOOFING GAP. public.feedback's
-- telegram_bot_insert_feedback policy (PERMISSIVE, anon, INSERT, WITH CHECK (source_type =
-- 'telegram')) has NO venture_id or feedback_type constraint whatsoever. As long as it remains
-- live, an anon caller can attribute a user_bug-shaped row to ANY venture by simply setting
-- source_type='telegram' instead of calling fn_submit_venture_user_feedback — bypassing this
-- migration's entire ownership check via a policy this file does not touch. Dropping
-- venture_user_insert_feedback does not narrow that other policy; PostgreSQL PERMISSIVE policies OR
-- together, so removing one still-flawed permissive policy does nothing while a MORE permissive
-- sibling (zero venture constraint, strictly weaker than the existence check this file replaces)
-- remains reachable. Acceptance criterion "no anon caller can spoof venture_id for user_%-type
-- feedback" is therefore only TRUE once BOTH this file AND the sibling below have applied — not
-- after this file alone.
--
-- database/chairman-gated/20260813_revoke_telegram_bot_insert_feedback.sql (sibling, from the
-- completed SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001, also confirmed STAGED-NOT-APPLIED live 2026-08-15)
-- drops that exact policy, and has its OWN $verify$ block that asserts venture_user_insert_feedback
-- remains PRESENT with an UNCHANGED WITH CHECK clause, and that anon retains table-level INSERT —
-- both violated by THIS file's own DROP POLICY action below. THE ORDER IS THEREFORE STRICT, not a
-- convenience: the sibling MUST land first (or in the same ceremony immediately before this one).
-- BEFORE APPLYING THIS FILE: confirm via a live pg_policies read whether
-- 20260813_revoke_telegram_bot_insert_feedback.sql has already landed (telegram_bot_insert_feedback
-- absent = already applied, safe to proceed) or is still pending (telegram_bot_insert_feedback
-- present = apply that migration first). Applying THIS file first would ALSO cause that sibling
-- migration's own next apply attempt to hard-fail (its byte-exact WITH CHECK compare would find
-- venture_user_insert_feedback missing) — a real but secondary consequence; the primary one is the
-- unclosed spoofing path above, which persists for however long the wrong order stands.
-- tests/ddl/venture-user-feedback-ownership-rpc-ddl.db.test.js applies both migrations, in this
-- exact order, in its own beforeAll, and asserts the source_type='telegram' bypass is rejected only
-- once both have run — it does not claim closure from this file in isolation.
--
-- COORDINATOR ADVERSARIAL REVIEW FINDING (directive 679ac85f, 2026-08-15, CONDITIONAL_PASS — not a
-- code change in this PR, sequencing precondition only): ehg/src/integrations/feedback/
-- feedbackDataAccess.ts currently inserts feedback as anon THROUGH venture_user_insert_feedback,
-- the exact policy this file DROPs — it has NOT been switched to call fn_submit_venture_user_feedback
-- in this PR. Applying this migration BEFORE that app switch ships would break the EHG app's own
-- feedback submissions (RLS-rejected the moment the policy is gone). REQUIRED ORDER: (1) EHG app
-- switches its insert path to fn_submit_venture_user_feedback (with the venture ingest secret) and
-- ships; (2) THEN apply this migration (after Phase-1 + telegram-revoke, per the sequencing above).
-- Tracked as a hard precondition on strategic_directives_v2.metadata.apply_pending_ceremony and on
-- successor SD-LEO-INFRA-CHAIRMAN-APPLY-CEREMONY-001 (FR-6).
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
-- SEC-L2 (SECURITY sub-agent, EXEC review): wrapped in its own transaction, with a trailing PostgREST
-- reload -- matching this file's own apply block, so a rollback leaves the schema cache consistent
-- with pg_catalog immediately rather than until PostgREST's own next reload cycle.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.fn_submit_venture_user_feedback(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon, service_role;
-- DROP FUNCTION IF EXISTS public.fn_submit_venture_user_feedback(UUID, TEXT, TEXT, TEXT, TEXT);
-- GRANT EXECUTE ON FUNCTION public.venture_exists_and_active(uuid) TO anon;
-- GRANT EXECUTE ON FUNCTION public.check_feedback_rate_limit(uuid) TO anon, authenticated;
-- CREATE POLICY venture_user_insert_feedback ON public.feedback
--   FOR INSERT TO anon
--   WITH CHECK (
--     feedback_type LIKE 'user_%'
--     AND venture_id IS NOT NULL
--     AND venture_exists_and_active(venture_id)
--     AND (NOT check_feedback_rate_limit(venture_id))
--   );
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;

BEGIN;

-- SEC-L1 (SECURITY sub-agent, EXEC review, evidence cefd6b89-cf93-4b34-8b4e-e9b348795bd2): bounded
-- wait for the ACCESS EXCLUSIVE lock DROP POLICY needs on public.feedback -- same rationale and
-- precedent as the sibling telegram-revoke migration's identical guard (this table's own 2026-08-12
-- incident record is exactly an unbounded lock wait here turning into a live-writer-blocking queue).
-- 5s, not that sibling's 2s: this migration does strictly more work under the same lock (two extra
-- REVOKEs, a richer $verify$ block) so a slightly wider window avoids a spurious fail-fast on an
-- otherwise-healthy apply.
SET LOCAL lock_timeout = '5s';

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
  -- MEDIUM-2 (SECURITY sub-agent, EXEC review, evidence cefd6b89-cf93-4b34-8b4e-e9b348795bd2):
  -- source_type = 'user_feedback' scopes the count to rows THIS RPC created. Without it, any other
  -- writer of a user_%-type row (the pre-drop policy's own historical rows, a future service_role
  -- insert, etc.) silently counts against a ceiling meant to bound only this anon-reachable path,
  -- letting an unrelated writer exhaust the channel for every venture at once.
  SELECT count(*) INTO v_global_count
  FROM public.feedback
  WHERE feedback_type IN ('user_bug', 'user_feature_request', 'user_usability', 'user_other')
    AND source_type = 'user_feedback'
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
-- 2b. MEDIUM-1 (SECURITY sub-agent, EXEC review, evidence cefd6b89-cf93-4b34-8b4e-e9b348795bd2):
--     close the now-orphaned direct-EXECUTE oracle. venture_exists_and_active was granted TO anon
--     by database/migrations/20260704f_fix_venture_user_feedback_ventures_visibility.sql SPECIFICALLY
--     because venture_user_insert_feedback's WITH CHECK evaluates it under RLS -- RLS policy
--     expressions run as the querying role even for a SECURITY DEFINER function, so anon needed
--     direct EXECUTE to invoke it there (confirmed live: that migration's own header, "so anon-role
--     RLS policies (e.g. venture_user_insert_feedback) can gate on it"). check_feedback_rate_limit
--     was, for the identical reason, the sole entry (count "(1)") kept off database/migrations/
--     20260603_03_revoke_secdef_execute_from_anon_authenticated.sql's revoke sweep by its dynamic
--     policy-usage scan. Both grants are now orphaned by the DROP above -- confirmed no OTHER live
--     policy or direct .rpc() caller depends on either (anon_feedback_ingress_bounds only mentions
--     them in a contrasting comment; every remaining caller -- this file's own function, Phase-1's
--     fn_submit_venture_feedback/fn_submit_venture_error -- invokes them from INSIDE its own
--     SECURITY DEFINER body, which runs under the FUNCTION OWNER's privileges for nested calls, not
--     the caller's, so neither needs anon's direct grant). Leaving them live is an unauthenticated
--     existence/rate-limit oracle with no write attached -- narrow, but unnecessary once the one
--     policy that required it is gone.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.venture_exists_and_active(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_feedback_rate_limit(uuid) FROM PUBLIC, anon, authenticated;

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

  -- MEDIUM-1: the two REVOKEs above actually took effect -- neither helper remains a direct
  -- existence/rate-limit oracle for anon or authenticated. This function's own internal calls to
  -- both (inside this SECURITY DEFINER body) are unaffected by either revoke.
  IF has_function_privilege('anon', 'public.venture_exists_and_active(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.venture_exists_and_active(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_exists_and_active is still directly callable by anon or authenticated -- MEDIUM-1 revoke did not take effect';
  END IF;
  IF has_function_privilege('anon', 'public.check_feedback_rate_limit(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.check_feedback_rate_limit(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: check_feedback_rate_limit is still directly callable by anon or authenticated -- MEDIUM-1 revoke did not take effect';
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
