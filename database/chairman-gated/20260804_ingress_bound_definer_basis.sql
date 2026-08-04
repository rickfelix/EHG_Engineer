-- SD-LEO-INFRA-INGRESS-BOUND-DEFINER-BASIS-001 — give the anon ingress bound a basis that can bind
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- There is NO non-production database. This lands directly on a live production ingress path, and
-- it converts a bound that has been INERT for its entire life into one that REJECTS. Applying it
-- without an approved threshold is not a deployment, it is an outage with a commit message.
--
-- PREREQUISITE, per the SD: chairman approval of (a) the per-source thresholds below and (b) the
-- projected rejection volume they imply. Both are measured and recorded — see
-- strategic_directives_v2.metadata.ingress_bound_projection.
--
-- @approved-by: codestreetlabs@gmail.com
-- (Chairman verbal approval at his terminal 2026-08-04 ~07:3x ET, recorded by Adam in-session:
-- "approved" — after the full recommendation: auto_capture 250 / manual_feedback 200 / default 50,
-- with the projected rejection volumes and the numbers-tunable-later caveat stated. The approval
-- covers both the per-source thresholds AND the SECURITY DEFINER counting basis.)
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE DEFECT, VERIFIED LIVE (not inherited from the SD text)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--   pg_policy.polpermissive = false                     -> RESTRICTIVE, as claimed
--   pg_get_expr(polwithcheck) contains, verbatim:
--       ( SELECT (count(*) < 50) FROM feedback f
--         WHERE NOT (f.source_type IS DISTINCT FROM feedback.source_type)
--           AND f.created_at > (now() - '01:00:00'::interval) )
--   ...and calls NO definer function.
--
-- An inline subquery inside a policy executes as the INSERTING role. anon's SELECT policy is
-- telegram-only, so for every non-telegram source the visible basis is n=1 and `count(*) < 50` is
-- arithmetically incapable of being false. The limit is dormant, not absent.
--
-- NOT THE SAME BUG as check_feedback_rate_limit(venture_id), which venture_user_insert_feedback
-- also calls: verified live prosecdef = TRUE. That function IS definer and DOES bind. It is
-- deliberately untouched here — changing it would be a fix aimed at a control that works.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY PER-SOURCE THRESHOLDS, MEASURED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Replaying the exact live bound over 30 days, UNCAPPED (every row, no sample):
--
--   source_type          inserts   would_reject_at_50   peak_prior_hour
--   auto_capture           8309          1226 (14.8%)          213
--   manual_feedback        3666             0  (0.0%)           48
--   manual_capture          114             0                    4
--   error_capture            16             0                    4
--   claude_code_intake        3             0                    1
--   TOTAL                 12108          1226 (10.1%)
--
-- auto_capture bursts to 4.3x the limit; manual_feedback peaks at 48 against that same 50 — about
-- 4% headroom on HUMAN submissions, with no warning before it starts rejecting them. The two
-- populations differ by >2 orders of magnitude, so one shared number either fails to bind the
-- noisy source or endangers the human one. It cannot do both.
--
-- THRESHOLDS BELOW ARE PROPOSALS FOR THE CHAIRMAN, NOT DECISIONS I MADE:
--   auto_capture      250  -- above the observed 213 peak, so it bounds runaway rather than normal
--                          -- operation. Set it at/below 213 only with intent to reject today's
--                          -- traffic; the projection says that is 14.8% of that source.
--   manual_feedback   200  -- ~4x the observed 48 peak. Real headroom, because a false reject here
--                          -- is a lost human report, which no retry recovers.
--   default            50  -- unchanged for the low-volume sources (peaks of 4, 4, 1).
--
-- ROLLBACK: restore the original WITH CHECK captured verbatim at the head of this file, and DROP
-- the function. The policy is RESTRICTIVE either way, so rollback never widens access.

BEGIN;

-- ── The basis ────────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER is the entire fix: it makes the count independent of what the INSERTING role
-- can see. STABLE (not IMMUTABLE) because it reads a table whose contents change. search_path is
-- pinned — a SECURITY DEFINER function with a mutable search_path is a privilege-escalation
-- surface, which would be a worse defect than the one being repaired.
CREATE OR REPLACE FUNCTION public.fn_anon_ingress_prior_hour_count(p_source_type text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT count(*)
  FROM public.feedback f
  WHERE f.source_type IS NOT DISTINCT FROM p_source_type
    AND f.created_at > now() - interval '1 hour';
$function$;

COMMENT ON FUNCTION public.fn_anon_ingress_prior_hour_count(text) IS
  'SD-LEO-INFRA-INGRESS-BOUND-DEFINER-BASIS-001: real prior-hour ingress count for the RESTRICTIVE '
  'anon bound. SECURITY DEFINER so the basis does not collapse to the inserting role''s visible '
  'rows (anon SELECT is telegram-only, which made the inline-subquery basis n=1 and the bound inert).';

-- Callable by the ingress roles only. It answers one aggregate question and exposes no rows, but
-- it still reads a table the caller cannot, so the grant is deliberately narrow.
REVOKE ALL ON FUNCTION public.fn_anon_ingress_prior_hour_count(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_anon_ingress_prior_hour_count(text) TO anon, authenticated;

-- ── The bound ────────────────────────────────────────────────────────────────────────────────
-- Stays RESTRICTIVE. The severity and category clauses are carried over BYTE-FOR-BYTE from the
-- live policy; only the counting term changes. Retyping the untouched half is how an unrelated
-- clause silently disappears.
DROP POLICY IF EXISTS anon_feedback_ingress_bounds ON public.feedback;

CREATE POLICY anon_feedback_ingress_bounds ON public.feedback
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    ((severity IS NULL) OR ((severity)::text <> ALL ((ARRAY['critical'::character varying, 'high'::character varying])::text[])))
    AND ((category)::text IS DISTINCT FROM 'chairman_decision_deferred'::text)
    AND (
      public.fn_anon_ingress_prior_hour_count((source_type)::text)
      < CASE (source_type)::text
          WHEN 'auto_capture'    THEN 250
          WHEN 'manual_feedback' THEN 200
          ELSE 50
        END
    )
  );

COMMIT;
