-- @approved-by:
-- SD-FDBK-FIX-EHG-ERRORCAPTUREPROVIDER-SENDS-001 — a purpose-built, anon+authenticated,
-- rate-limited RPC for browser error telemetry (React render errors + window
-- error/unhandledrejection events) in the ehg app.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AWAITING CHAIRMAN REVIEW — no @approved-by stamp exists for this file yet, deliberately, matching
-- the established convention on this database instance (see sibling files in this directory,
-- e.g. 20260817_fdbk_internal_feedback_rpc.sql).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE DEFECT THIS CLOSES (measured live, multiple independent passes, not inferred)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Browser-side error telemetry in ehg has NEVER worked. The component that appears to write these
-- rows, ehg/src/components/error-capture/ErrorCaptureProvider.tsx, is dead code (zero imports
-- repo-wide, never mounted) — a payload-only fix to it would be a no-op. Even setting that aside,
-- its insert payload has 4 independent defects: unknown columns created_by/source_url (PGRST204,
-- evaluated before Postgres is reached), an un-admitted source_type value ('browser_error', 23514),
-- and an un-admitted status value ('open', 23514 feedback_status_check). Deepest finding, confirmed
-- by a LIVE anon-role probe (not a pg_catalog reading, which independently produced a wrong answer
-- first): public.feedback has exactly ONE permissive INSERT policy, scoped to service_role only.
-- Neither anon nor authenticated can INSERT via RLS today, at any payload. A corrected direct-insert
-- path does not exist without a new permissive policy (itself a separate, larger, independently
-- chairman-gated decision this SD deliberately does not make — see 20260817_restore_feedback_
-- permissive_insert.sql, which is venture-scoped and unrelated).
--
-- Following the same fourth-mechanism precedent as the sibling fn_submit_internal_feedback (SD-FDBK-
-- FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001): a SECURITY DEFINER RPC bypasses table RLS entirely for its
-- own internal write, so no policy edit is needed or wanted for this SD's scope.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS DIFFERS FROM fn_submit_internal_feedback: ANON IS A VALID CALLER HERE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- fn_submit_internal_feedback deliberately does NOT clamp severity, because its caller identity is
-- real and non-forgeable (auth.uid() rejects NULL). This RPC's caller can be genuinely anonymous —
-- ErrorCaptureProvider/GlobalErrorBoundary run for every visitor, signed in or not. The anonymous
-- threat model therefore applies in full: severity is clamped server-side to {'low','medium'} only,
-- regardless of client input, because chairman_all_decision_signals' flag_review arm ingests any row
-- at severity high/critical using client-influenced content as the chairman-facing title — an anon
-- caller must never reach that path. p_metadata is accepted but only a fixed allow-list of keys is
-- persisted (message/stack_trace/page_url context only) — scripts/corrective-triage.mjs's
-- promoteFinding() reads metadata.promote_payload straight into SD creation, gated on
-- category='corrective_finding'; this function never accepts or sets category, and never persists an
-- arbitrary client-supplied metadata object verbatim.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- error_hash IS SERVER-COMPUTED, NOT A CLIENT PARAMETER — a deliberate divergence from
-- record_venture_error (the volume-control PATTERN this function models, not a function it calls)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- record_venture_error accepts p_error_hash from the client (validated to a fixed 64-hex-char
-- shape). This function instead computes error_hash itself, from message+stack_trace, via
-- pgcrypto's digest() — the dead ErrorCaptureProvider.tsx's own client-side hash was a 32-bit,
-- collision-forgeable, non-hex-clean value; trusting any client hash here would let a caller force
-- fingerprint collisions to either evade or manufacture the storm ceiling below.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- NEW PARTIAL UNIQUE INDEX REQUIRED — the existing idx_feedback_venture_error_hash EXCLUDES this
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- idx_feedback_venture_error_hash (record_venture_error's own ON CONFLICT arbiter) is scoped
-- WHERE feedback_type = 'venture_error' AND venture_id IS NOT NULL. Browser errors are non-venture-
-- scoped (venture_id IS NULL) by nature and use a different feedback_type/source_type — a copy-paste
-- of that arbiter would never match here. This file adds a SEPARATE partial unique index, scoped to
-- source_type = 'error_capture' AND venture_id IS NULL, as this function's own ON CONFLICT arbiter.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- feedback_type IS PART OF EVERY WHERE/ARBITER PREDICATE HERE — NOT JUST source_type/venture_id
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Live-verified via the dry-run script: record_venture_error (a sibling, unrelated RPC) ALSO
-- writes source_type='error_capture' rows, and its own arbiter (idx_feedback_venture_error_hash)
-- only covers venture_id IS NOT NULL — so venture_id IS NULL rows from that RPC (its own test
-- fixtures already have 16 such rows in this DB) are NOT protected by ITS index. Every predicate in
-- this file (the new index, check_error_capture_storm, the dedup UPDATE, the ON CONFLICT arbiter)
-- therefore also filters on feedback_type='sentry_error' (this function's own fixed value), so this
-- RPC's uniqueness/volume domain never overlaps record_venture_error's, regardless of venture_id
-- nullability. Omitting this would let a future record_venture_error venture_id-IS-NULL insert
-- spuriously violate this file's unique index, or pollute this RPC's storm count with unrelated
-- venture-error volume.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- TWO SECURITY SUB-AGENT FINDINGS, BOTH LIVE-VERIFIED AND FIXED PRE-APPLY (EXEC-TO-PLAN review)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- S1: the storm-ceiling watermark sentinel was 76 zero-chars against a varchar(64) column --
-- every real trip of the ceiling would 22001 (value too long), silently discarding the ONE
-- mechanism this file's own header promises ("never a silent unobservable drop"). Live-reproduced,
-- then corrected to exactly 64 chars.
-- S2: the fingerprint-dedup UPDATE carried a `created_at > now() - interval '1 hour'` window, but
-- the unique index it defers to has NO time predicate. Any fingerprint last seen >1h ago fell
-- through to the INSERT branch and permanently 23505'd against its own now-untimed index --
-- recurring errors (the ones worth capturing) became captureable exactly once, ever, then silently
-- dropped by the client's own failure-swallowing wrapper. Live-reproduced via a backdated
-- service_role-seeded row, then fixed by making the dedup UPDATE lifetime-scoped (no time window) --
-- first_seen stays the original occurrence time; occurrence_count/last_seen track recurrence.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SEQUENCING (TESTING sub-agent finding, prospective PLAN-TO-EXEC review, live-verified): this file
-- must actually be applied (chairman --issue-token / MIGRATION_APPLY_TOKEN flow, matching every
-- sibling file in this directory) before any live acceptance criterion in this SD's PRD can be
-- verified — confirmed by live-probing that the sibling fn_submit_internal_feedback IS live in
-- production, so this sequence is the established norm, not an exception. If apply is deferred,
-- record the corresponding acceptance criteria as UNVERIFIED explicitly, never inferred from this
-- staged file alone.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DISCLOSED, ACCEPTED RESIDUAL: this RPC is structurally invisible to scripts/anon-write-contract-
-- probe.mjs (the repo's standing anon-write monitor), which discovers targets via pg_policies only
-- — a SECURITY DEFINER function + GRANT EXECUTE TO anon has zero pg_policies rows. Logged as a
-- systemic harness gap (feedback row 4f2a74e1-a294-42a9-91c1-751bfb91c612) affecting any SECURITY
-- DEFINER anon-callable RPC on a monitored table, not unique to this file. Not blocking this SD —
-- this function's own test suite (SD PRD TS-1/TS-2/TS-6/TS-7) is this SD's audit, independent of
-- that monitor's current blind spot.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ============================================================
-- 1. New partial unique index — this function's own ON CONFLICT arbiter. Idempotent.
-- ============================================================
-- Scoped by feedback_type='sentry_error' (this function's own fixed value) IN ADDITION to
-- source_type/venture_id -- live-verified via dry-run that record_venture_error (a SIBLING,
-- unrelated RPC) ALSO writes source_type='error_capture' rows, some with venture_id IS NULL (its
-- own arbiter idx_feedback_venture_error_hash only covers venture_id IS NOT NULL). Without the
-- feedback_type filter, this index's uniqueness domain would silently overlap that RPC's
-- venture_id-IS-NULL rows, and a future collision there would spuriously break record_venture_error
-- inserts with an error this SD's own review would never see.
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_error_capture_hash
  ON public.feedback (error_hash)
  WHERE source_type = 'error_capture' AND feedback_type = 'sentry_error' AND venture_id IS NULL;

-- ── check_error_capture_storm (distinct-fingerprint hourly ceiling, matches record_venture_error's
--    watermark-row doctrine — fails closed-but-counted via a reserved sentinel hash, never a silent
--    unobservable drop) ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_error_capture_storm()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT count(DISTINCT error_hash) >= 50
  FROM public.feedback
  WHERE source_type = 'error_capture'
    AND feedback_type = 'sentry_error'
    AND venture_id IS NULL
    AND error_hash <> '0000000000000000000000000000000000000000000000000000000000000000'
    AND created_at > now() - interval '1 hour';
$function$;

REVOKE EXECUTE ON FUNCTION public.check_error_capture_storm() FROM PUBLIC, anon, authenticated;
-- No anon/authenticated/PUBLIC grant (SECURITY sub-agent live-verified via proacl): only
-- fn_submit_error_capture (below) calls this; a SECURITY DEFINER function's internal calls run as
-- the function OWNER, who always implicitly holds EXECUTE on its own objects regardless of this
-- REVOKE (matches fn_submit_internal_feedback's identical precedent). service_role and postgres
-- still hold EXECUTE via the default ACL, as on every function in this schema -- unremarkable and
-- not a gap; the REVOKE's purpose is closing anon/authenticated/PUBLIC only.

-- ── fn_submit_error_capture ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_submit_error_capture(
  p_message TEXT,
  p_stack_trace TEXT DEFAULT NULL,
  p_page_url TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'medium',
  p_metadata JSONB DEFAULT '{}'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_severity TEXT;
  v_error_hash TEXT;
  v_safe_metadata JSONB;
  v_existing_id UUID;
  v_new_id UUID;
  v_was_fresh_insert BOOLEAN;
  v_watermark_hash CONSTANT TEXT := '0000000000000000000000000000000000000000000000000000000000000000';
BEGIN
  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RAISE EXCEPTION 'fn_submit_error_capture: message is required' USING ERRCODE = '22004';
  END IF;

  -- Identity is optional here (unlike fn_submit_internal_feedback) — anon is a valid, expected
  -- caller. auth.uid() returns NULL for anon; that is not an error condition.
  v_user_id := auth.uid();

  -- Severity ALWAYS clamped, regardless of caller identity or client input — see header. Out-of-
  -- enum input is treated as an invalid request, not silently coerced, so a caller cannot probe the
  -- clamp by trial and error via a successful-but-different response.
  v_severity := lower(coalesce(p_severity, 'medium'));
  IF v_severity NOT IN ('critical', 'high', 'medium', 'low') THEN
    RAISE EXCEPTION 'fn_submit_error_capture: invalid severity' USING ERRCODE = '22004';
  END IF;
  IF v_severity IN ('critical', 'high') THEN
    v_severity := 'medium';
  END IF;

  -- error_hash is ALWAYS server-computed — never accept a client-supplied hash (see header).
  -- digest() is schema-qualified: Supabase installs pgcrypto into the `extensions` schema, not
  -- `public` (live-verified via pg_extension), and this function's search_path deliberately
  -- excludes `extensions` (SECURITY DEFINER search_path should stay as narrow as the function
  -- actually needs, not be widened just to resolve one call). encode() is NOT schema-qualified —
  -- it is a pg_catalog builtin (live-verified via pg_proc), always resolvable regardless of
  -- search_path; extensions.encode does not exist and would 42883. left/coalesce guards against a
  -- NULL stack_trace changing the hash input shape unpredictably.
  v_error_hash := encode(
    extensions.digest(left(p_message, 2000) || '|' || left(coalesce(p_stack_trace, ''), 4000), 'sha256'),
    'hex'
  );

  -- Fixed allow-list of metadata keys — never persist an arbitrary client-supplied object verbatim
  -- (see header; this is the promote_payload/category injection surface RISK sub-agent flagged).
  -- All three values length-capped (adversarial ship-review finding, PLAN-TO-LEAD): user_agent and
  -- browser were previously persisted unbounded, unlike component_stack -- an unauthenticated caller
  -- could otherwise write an arbitrarily large string into either field on every new-fingerprint row.
  v_safe_metadata := jsonb_build_object(
    'user_agent', left(coalesce(p_metadata->>'user_agent', ''), 500),
    'browser', left(coalesce(p_metadata->>'browser', ''), 200),
    'component_stack', left(coalesce(p_metadata->>'component_stack', ''), 2000)
  );

  -- Repeat of an already-seen fingerprint (lifetime dedup, not time-windowed -- SECURITY sub-agent
  -- finding S2, live-verified: the unique index below has no time predicate, so a time-windowed
  -- UPDATE here would fall through to the INSERT branch for any fingerprint last seen >1h ago,
  -- which then violates that untimed index -- 23505, permanently, on every future occurrence of
  -- that exact fingerprint. Recurring errors (the ones worth capturing) are exactly what that broke.
  -- first_seen is deliberately NOT touched -- it stays the original occurrence time.
  --
  -- DEDUP CHECKED BEFORE THE STORM CEILING (adversarial ship-review finding, PLAN-TO-LEAD; matches
  -- record_venture_error's own explicit ordering, lines 120-166 of that sibling file: "Repeat of an
  -- already-seen fingerprint: always aggregate, ceiling doesn't apply"). An earlier version of this
  -- function checked the storm ceiling FIRST, unconditionally -- once tripped (trivially, by an
  -- unauthenticated caller submitting 50 distinct fake messages in seconds, with no per-caller rate
  -- limit anywhere in this function), every subsequent call for an ALREADY-KNOWN fingerprint also hit
  -- the storm branch first and never reached this UPDATE, freezing occurrence_count/last_seen for
  -- every real, recurring error app-wide -- indefinitely sustainable by the same attacker submitting
  -- one fresh fingerprint roughly every ~72 seconds to keep the trailing-hour count above the
  -- ceiling. Checking dedup first means the ceiling can only ever suppress genuinely NEW
  -- fingerprints, never already-tracked ones -- closing that DoS class entirely, not just narrowing it.
  UPDATE public.feedback
  SET occurrence_count = occurrence_count + 1, last_seen = now(), updated_at = now()
  WHERE source_type = 'error_capture'
    AND feedback_type = 'sentry_error'
    AND venture_id IS NULL
    AND error_hash = v_error_hash
  RETURNING id INTO v_existing_id;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existing_id, 'deduped', true);
  END IF;

  -- New distinct fingerprint: only NOW does the storm ceiling apply (see reordering note above).
  -- RETURNs a non-erroring payload rather than RAISE EXCEPTION -- matching record_venture_error's
  -- OWN pattern (jsonb_build_object(...); RETURN, never RAISE, in its equivalent branch), and
  -- necessarily so: a single SQL statement is atomic, so RAISE EXCEPTION immediately after this
  -- INSERT would roll the INSERT back too (live-reproduced: watermark row count stayed 0 after a
  -- real trip, with the original RAISE EXCEPTION version). The whole point of this branch is that
  -- the watermark write must survive even though the caller's specific submission is rejected --
  -- which requires the overall statement to succeed. This diverges from fn_submit_internal_
  -- feedback's rate-limit convention (RAISE EXCEPTION is still correct THERE, because that
  -- function writes nothing on its rejected path) -- not from anything in this file's own
  -- SEQUENCING note above, which only concerns apply-before-verification ordering, not this
  -- design choice.
  IF public.check_error_capture_storm() THEN
    -- Upsert the watermark row itself so the ceiling's own activity is observable, never a silent
    -- drop (matches record_venture_error's doctrine).
    INSERT INTO public.feedback (
      type, feedback_type, source_type, source_application, title, description, severity, status,
      user_id, page_url, error_hash, error_message, occurrence_count, first_seen, last_seen,
      metadata
    ) VALUES (
      'issue', 'sentry_error', 'error_capture', 'EHG', 'Error capture storm ceiling reached',
      'Distinct error-fingerprint hourly ceiling reached; further distinct errors this hour are not individually recorded.',
      'low', 'new', NULL, NULL, v_watermark_hash, 'storm-ceiling-watermark', 1, now(), now(), '{}'
    )
    ON CONFLICT (error_hash) WHERE source_type = 'error_capture' AND feedback_type = 'sentry_error' AND venture_id IS NULL
    DO UPDATE SET occurrence_count = feedback.occurrence_count + 1, last_seen = now(), updated_at = now();

    RETURN jsonb_build_object('ok', false, 'rate_limited', true, 'code', '53400');
  END IF;

  -- New fingerprint, never seen before. venture_id is never set (non-venture-scoped by design). status,
  -- source_type, created_at, user_id are all server-computed, never client-suppliable. category is
  -- never set by this function at all (defends against the corrective_finding injection surface).
  --
  -- ON CONFLICT ... DO UPDATE (adversarial ship-review finding, PLAN-TO-LEAD): the dedup UPDATE
  -- above and this INSERT are two separate statements with no lock between them, so two concurrent
  -- calls with an identical fingerprint (realistic: multiple tabs/users hitting the same bug within
  -- milliseconds, or a render-error path and a window-error listener firing near-simultaneously for
  -- the same failure) could both miss the UPDATE (0 rows yet) and both reach this INSERT -- without
  -- this clause, the second would 23505 against idx_feedback_error_capture_hash instead of gracefully
  -- deduping, propagating as a hard, uncaught RPC error to the "losing" caller. The xmax=0 check
  -- distinguishes a genuine fresh insert from a conflict-recovered update for an accurate `deduped`
  -- response either way.
  INSERT INTO public.feedback (
    type, feedback_type, source_type, source_application, title, description, severity, status,
    user_id, page_url, error_hash, error_message, occurrence_count, first_seen, last_seen, metadata
  ) VALUES (
    'issue', 'sentry_error', 'error_capture', 'EHG', left(p_message, 255),
    left(coalesce(p_stack_trace, ''), 4000), v_severity, 'new', v_user_id, left(p_page_url, 500),
    v_error_hash, left(p_message, 2000), 1, now(), now(), v_safe_metadata
  )
  ON CONFLICT (error_hash) WHERE source_type = 'error_capture' AND feedback_type = 'sentry_error' AND venture_id IS NULL
  DO UPDATE SET occurrence_count = feedback.occurrence_count + 1, last_seen = now(), updated_at = now()
  RETURNING id, (xmax = 0) INTO v_new_id, v_was_fresh_insert;

  RETURN jsonb_build_object('ok', true, 'id', v_new_id, 'deduped', NOT v_was_fresh_insert);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_submit_error_capture(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_submit_error_capture(TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
-- Both anon and authenticated — this caller runs for every visitor, signed in or not (see header).

COMMENT ON FUNCTION public.fn_submit_error_capture(TEXT, TEXT, TEXT, TEXT, JSONB) IS
'SD-FDBK-FIX-EHG-ERRORCAPTUREPROVIDER-SENDS-001. Anon+authenticated-callable SECURITY DEFINER RPC
for browser error telemetry. Severity always clamped to low/medium (anonymous threat model).
error_hash always server-computed, never client-supplied. Fixed metadata key allow-list only --
never persists an arbitrary client object or sets category (defends the corrective_finding /
promote_payload injection surface). Distinct-fingerprint hourly storm ceiling with an observable
watermark row, mirroring record_venture_error''s doctrine.';

-- ============================================================
-- Self-verify: static catalog assertions (RETRO PITFALL from SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-
-- 001's own completion retro, repeated here per this directory's convention: a verify block that
-- only re-checks catalog SHAPE passes while every real call 42501s/PGRST202s is worse than no verify
-- at all -- this block asserts the GRANT, not just pg_proc existence).
-- ============================================================
DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.fn_submit_error_capture(text,text,text,text,jsonb)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_submit_error_capture is NOT anon-callable -- the fix would be unreachable for signed-out visitors';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_submit_error_capture(text,text,text,text,jsonb)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_submit_error_capture is NOT authenticated-callable -- the fix would be unreachable for signed-in visitors';
  END IF;
  IF has_function_privilege('anon', 'public.check_error_capture_storm()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.check_error_capture_storm()', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: check_error_capture_storm is directly callable by anon or authenticated -- should have no external grant';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_submit_error_capture(text,text,text,text,jsonb)'::regprocedure) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_submit_error_capture is not SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'feedback' AND indexname = 'idx_feedback_error_capture_hash'
  ) THEN
    RAISE EXCEPTION 'VERIFY FAILED: idx_feedback_error_capture_hash is missing -- ON CONFLICT in fn_submit_error_capture would fail';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed -- see the paired _DOWN.sql for the executable version):
-- ============================================================
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.fn_submit_error_capture(TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon, authenticated;
-- DROP FUNCTION IF EXISTS public.fn_submit_error_capture(TEXT, TEXT, TEXT, TEXT, JSONB);
-- DROP FUNCTION IF EXISTS public.check_error_capture_storm();
-- DROP INDEX IF EXISTS idx_feedback_error_capture_hash;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
