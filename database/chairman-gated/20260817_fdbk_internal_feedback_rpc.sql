-- @approved-by:
-- SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001 — FR-4 fourth mechanism: a purpose-built,
-- authenticated, identity-bound RPC for ehg/src/components/quality/FeedbackWidget.tsx.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AWAITING CHAIRMAN REVIEW — no @approved-by stamp exists for this file yet, deliberately, matching
-- the established convention on this database instance (see sibling files in this directory).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE DEFECT THIS CLOSES (measured live 2026-08-17, not inferred)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- public.feedback has exactly ONE permissive INSERT policy, scoped to role=service_role only
-- (confirmed via a direct pg_policy query). Neither anon nor authenticated can INSERT via RLS
-- today, at any severity. FeedbackWidget.tsx's current direct `.insert()` call is therefore
-- unconditionally rejected for every signed-in user, at every severity — including the widget's own
-- "Critical" / "High" options ("System down or data loss" / "Major feature broken"), masking
-- exactly the most urgent feedback. This is the "SUPERSEDED, 2026-08-17" finding referenced in this
-- SD's own description (worker-signal 6795d774): the original theory (a severity-specific RLS
-- exclusion) understated the defect — the RESTRICTIVE anon_feedback_ingress_bounds policy is moot
-- with no permissive grant left for it to narrow.
--
-- SCOPE PRECISION (TESTING sub-agent finding, prospective PLAN-TO-EXEC review, evidence 25be9f6e):
-- the missing permissive INSERT policy is not the FIRST error the old payload would actually hit.
-- The old FeedbackWidget.tsx insert also sent `source_url` and `created_by`, NEITHER a real column
-- on public.feedback (PostgREST 42703, evaluated before RLS), and `status: "open"`, which violates
-- feedback_status_check (allowed: new/triaged/in_progress/resolved/wont_fix/duplicate/invalid/
-- backlog/shipped, 23514). All three are independent defects PostgREST/Postgres would raise before
-- the policy gap is ever reached. This migration + the paired frontend change close all three (the
-- RPC sets user_id/status server-side and never references source_url) — restoring a permissive
-- INSERT policy ALONE, without also fixing the payload, would NOT have fixed the widget.
--
-- Rather than editing anon_feedback_ingress_bounds or restoring an anon/authenticated-scoped
-- permissive INSERT policy (a separate, larger, independently chairman-gated decision — see
-- 20260815_venture_user_feedback_ownership_rpc.sql / 20260817_restore_feedback_permissive_insert.sql,
-- neither of which this file touches or depends on), this migration implements the fourth mechanism
-- already design-decision-ready in docs/reference/anon-write-contract.md's "FR-4 design" section: a
-- SECURITY DEFINER RPC that reads the caller's identity via auth.uid() rather than trusting any
-- client-supplied value — the same discipline fn_submit_venture_user_feedback already uses. A
-- SECURITY DEFINER function bypasses table RLS entirely for its own internal write (when its owner
-- has direct table privileges — the same mechanism fn_submit_venture_user_feedback already relies
-- on, confirmed working), so no policy edit is needed or wanted for this SD's scope.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SEVERITY IS NOT CLAMPED — A DELIBERATE DEVIATION FROM THE DESIGN DOC'S OWN DRAFT SUGGESTION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The design doc (SECURITY sub-agent evidence 241fb047-1b4a-4795-b73b-8fa4c8ab2778) flagged
-- p_severity as drafted and suggested EITHER dropping it as a parameter OR clamping it server-side
-- to exclude critical/high, mirroring anon_feedback_ingress_bounds. That suggestion was written for
-- an ANONYMOUS-caller threat model. This SD's own problem statement is the opposite: authenticated
-- users selecting Critical/High today get silently rejected. Clamping severity here would reproduce
-- the exact defect this migration exists to fix, under a new code path. Because auth.uid() makes
-- the caller's identity real and non-forgeable (unlike the anonymous case the clamp was designed
-- for), the abuse control chosen instead is a user_id-scoped rate limit (below) plus a global
-- per-hour ceiling — the mechanism this SD's own title names. p_severity therefore accepts the full
-- critical/high/medium/low range; only out-of-enum values are rejected.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STRUCTURAL RLS BYPASS — WHY A GLOBAL CEILING IS INSIDE THE FUNCTION BODY, NOT INHERITED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- This SECURITY DEFINER path never evaluates anon_feedback_ingress_bounds for its own INSERT — the
-- same structural class of gap record_venture_error() already has (documented, out of scope,
-- pre-existing). Fixing identity (auth.uid()) does not fix the missing bound; the 200/hour global
-- ceiling below reproduces anon_feedback_ingress_bounds's own manual_feedback cap independently,
-- inside the function body, scoped to source_type='manual_feedback' specifically (matching
-- fn_submit_venture_user_feedback's own MEDIUM-2 scoping discipline — an unrelated writer of a
-- different source_type must not count against this ceiling).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── check_internal_feedback_rate_limit ────────────────────────────────────────────────────────
-- user_id-scoped rate limit. check_feedback_rate_limit(p_venture_id uuid) cannot be reused here —
-- this caller has no venture_id by design. Mirrors check_feedback_rate_limit's exact shape
-- (STABLE SECURITY DEFINER, SQL function, returns TRUE when rate-limited).
CREATE OR REPLACE FUNCTION public.check_internal_feedback_rate_limit(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT count(*) >= 20
  FROM public.feedback
  WHERE user_id = p_user_id
    AND source_type = 'manual_feedback'
    AND created_at > now() - interval '1 hour';
$function$;

REVOKE ALL ON FUNCTION public.check_internal_feedback_rate_limit(uuid) FROM PUBLIC, anon, authenticated;
-- No external EXECUTE grant: only fn_submit_internal_feedback (below) calls this, and — like
-- check_feedback_rate_limit's identical precedent — a SECURITY DEFINER function's internal calls
-- run as the function OWNER, who always implicitly holds EXECUTE on its own objects regardless of
-- this REVOKE.

-- ── fn_submit_internal_feedback ───────────────────────────────────────────────────────────────
-- p_page_url (TESTING sub-agent finding, prospective PLAN-TO-EXEC review, evidence 25be9f6e):
-- FeedbackWidget.tsx renders "Page: {window.location.pathname}" implying page-context capture, but
-- neither the old payload (source_url — not a real column, 42703) nor this RPC's first draft
-- (no parameter at all) actually persisted it, despite public.feedback having a real page_url
-- column (varchar(500)). Adding it now, while the 4-arg signature is not yet live, is the cheap
-- moment — adding it post-merge would need a new overload or a signature change plus a PostgREST
-- schema-cache reload.
CREATE OR REPLACE FUNCTION public.fn_submit_internal_feedback(
  p_title TEXT,
  p_description TEXT,
  p_type TEXT,
  p_severity TEXT,
  p_page_url TEXT DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_type TEXT;
  v_feedback_type TEXT;
  v_severity TEXT;
  v_priority TEXT;
  v_global_count BIGINT;
  v_new_id UUID;
BEGIN
  -- Identity via auth.uid() only — never a client-supplied parameter (matches
  -- fn_submit_venture_user_feedback's "never accept as a parameter what the caller could forge").
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'fn_submit_internal_feedback: unauthorized' USING ERRCODE = '28000';
  END IF;

  IF p_type NOT IN ('issue', 'enhancement') THEN
    RAISE EXCEPTION 'fn_submit_internal_feedback: invalid type' USING ERRCODE = '22004';
  END IF;

  -- NULL severity defaults to 'medium' (matches the widget's own client-side default state).
  v_severity := coalesce(p_severity, 'medium');
  IF v_severity NOT IN ('critical', 'high', 'medium', 'low') THEN
    RAISE EXCEPTION 'fn_submit_internal_feedback: invalid severity' USING ERRCODE = '22004';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'fn_submit_internal_feedback: title is required' USING ERRCODE = '22004';
  END IF;

  -- Per-user rate limit — direct truthy check (matches fn_submit_venture_user_feedback's polarity
  -- convention for this idiom; contrast an ownership/existence check, which uses IS NOT TRUE).
  -- Distinct message text from the global ceiling below (TESTING finding, evidence 25be9f6e): the
  -- two bounds previously raised byte-identical text, making it impossible for an operator -- or a
  -- test -- to tell which one actually fired.
  IF public.check_internal_feedback_rate_limit(v_user_id) THEN
    RAISE EXCEPTION 'fn_submit_internal_feedback: rate limited (per-user)' USING ERRCODE = '53400';
  END IF;

  -- Global per-hour ceiling (defense in depth — see header). Scoped to source_type='manual_feedback'
  -- specifically so an unrelated writer of a different source_type cannot exhaust this ceiling.
  -- Coupling note (TESTING finding, evidence 25be9f6e): this counts EVERY manual_feedback row,
  -- including automated intake sharing this source_type (harness-bug logger, todoist/youtube/
  -- claude_code intake) -- a spike there could lock out real widget users. Accepted at measured 5x
  -- headroom (peak 42/hr vs this 200/hr cap over a 90-day window); revisit the threshold, not the
  -- coupling, if automated volume grows materially.
  SELECT count(*) INTO v_global_count
  FROM public.feedback
  WHERE source_type = 'manual_feedback'
    AND created_at > now() - interval '1 hour';
  IF v_global_count >= 200 THEN
    RAISE EXCEPTION 'fn_submit_internal_feedback: rate limited (global)' USING ERRCODE = '53400';
  END IF;

  -- type (coarse issue/enhancement classifier) is a separate column+constraint from feedback_type
  -- (confirmed live via feedback_type_check vs feedback_feedback_type_check — two distinct CHECKs).
  v_type := p_type;
  v_feedback_type := CASE WHEN p_type = 'enhancement' THEN 'user_feature_request' ELSE 'user_bug' END;

  -- Priority computed server-side, mirroring FeedbackWidget.tsx's own calculatePriority — the
  -- client can no longer forge priority either.
  v_priority := CASE
    WHEN p_type = 'enhancement' THEN 'P2'
    WHEN v_severity = 'critical' THEN 'P0'
    WHEN v_severity = 'high' THEN 'P1'
    WHEN v_severity = 'low' THEN 'P3'
    ELSE 'P2'
  END;

  -- venture_id is never a parameter and never set — this caller has none, by design (FR-4 design
  -- doc). source_application/source_type/status/user_id are never client-suppliable.
  INSERT INTO public.feedback (
    type, feedback_type, source_type, source_application, title, description, severity, priority,
    status, user_id, page_url
  ) VALUES (
    v_type, v_feedback_type, 'manual_feedback', 'EHG', left(p_title, 255),
    left(coalesce(p_description, ''), 2000), v_severity, v_priority, 'new', v_user_id,
    left(p_page_url, 500)
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'id', v_new_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_submit_internal_feedback(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_submit_internal_feedback(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
-- No anon grant — this caller is never anonymous by construction (FeedbackWidget.tsx already gates
-- on `if (!user) return null`).

-- ============================================================
-- Self-verify: static catalog assertions — the dynamic behavioral proof (every RAISE EXCEPTION
-- branch + the rate limit + the global ceiling, all live-invoked and RETURNING-verified) is in
-- 20260817_fdbk_internal_feedback_rpc_dry_run.mjs, matching this repo's established split between
-- static $verify$ checks here (RETRO PITFALL from SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001's own
-- completion retro: a verify block that only re-checks catalog SHAPE passes while every real call
-- 42501s, because EXECUTE grants were never asserted — this block asserts the grant, not just
-- pg_proc existence) and dynamic behavioral tests elsewhere.
-- ============================================================
DO $verify$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_submit_internal_feedback(text,text,text,text,text)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_submit_internal_feedback is NOT authenticated-callable -- the fix would be unreachable';
  END IF;
  IF has_function_privilege('anon', 'public.fn_submit_internal_feedback(text,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_submit_internal_feedback is callable by anon -- should be authenticated only (anon would inherit a residual PUBLIC grant too, so this also covers that case)';
  END IF;
  IF has_function_privilege('anon', 'public.check_internal_feedback_rate_limit(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.check_internal_feedback_rate_limit(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: check_internal_feedback_rate_limit is directly callable by anon or authenticated -- should have no external grant';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_submit_internal_feedback(text,text,text,text,text)'::regprocedure) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_submit_internal_feedback is not SECURITY DEFINER';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
