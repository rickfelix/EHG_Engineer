-- SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C — fn_venture_usage_window_summary read RPC
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- No @approved-by stamp exists for this file yet, deliberately — do not add one until an actual
-- chairman approval has happened (per the drift-prevention discipline established in
-- 20260812_venture_ingest_key_binding.sql's header).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Adds fn_venture_usage_window_summary(p_venture_id, p_window_start, p_window_end), a SECURITY
-- DEFINER read RPC over venture_usage_events (owned by sibling SD-LEO-GEN-ALL-VENTURES-PRODUCED-
-- 001-A — NOT created by this file; see the to_regclass guard below). Returns event_count and
-- active_users (DISTINCT actor_hash count, never raw row count — FR-5) for a venture+window.
--
-- ACCESS MODEL (PLAN-phase correction, TESTING evidence 553db48a, finding B1): this RPC's ONLY
-- callers are trusted internal server-side code (lib/eva/utils/validate-venture-default-
-- capabilities.js's verifyCapabilityWired, lib/eva/stage-templates/analysis-steps/stage-23-
-- launch-readiness.js) — never a browser-side end-user session calling it directly. There is no
-- caller-identity argument on this RPC's signature (no ingest secret, no auth.uid()-bound
-- session) because none is needed: EXECUTE is granted to service_role ONLY (REVOKE ALL FROM
-- PUBLIC, anon, authenticated), which structurally eliminates the cross-venture leak vector by
-- making the RPC unreachable to any untrusted caller in the first place.
--
-- DEPENDENCY ORDERING: this file depends on SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A's
-- venture_usage_events table already existing. The function body's first statement is an
-- existence guard (to_regclass) that RAISEs a clear, actionable error if applied out of order,
-- rather than a cryptic "relation does not exist" from deep inside a query plan.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ============================================================
-- 1. fn_venture_usage_window_summary
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_venture_usage_window_summary(
  p_venture_id UUID,
  p_window_start TIMESTAMPTZ,
  p_window_end TIMESTAMPTZ
)
RETURNS TABLE(event_count BIGINT, active_users BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Dependency-ordering guard (see file header) -- fails loudly if Child A's table is
  -- missing, instead of an opaque error surfacing later in this function body.
  IF to_regclass('public.venture_usage_events') IS NULL THEN
    RAISE EXCEPTION 'fn_venture_usage_window_summary: public.venture_usage_events does not exist yet -- apply SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A''s migration first';
  END IF;

  IF p_venture_id IS NULL THEN
    RAISE EXCEPTION 'fn_venture_usage_window_summary: p_venture_id is required';
  END IF;

  -- Malformed window (start > end, or either NULL) resolves to an empty result rather
  -- than an error -- callers treat "no data" and "bad window" identically as not-wired.
  IF p_window_start IS NULL OR p_window_end IS NULL OR p_window_start > p_window_end THEN
    RETURN QUERY SELECT 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      count(*)::BIGINT AS event_count,
      count(DISTINCT actor_hash)::BIGINT AS active_users
    FROM public.venture_usage_events
    WHERE venture_id = p_venture_id
      AND created_at >= p_window_start
      AND created_at <= p_window_end;
END;
$$;

COMMENT ON FUNCTION public.fn_venture_usage_window_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C: SECURITY DEFINER read RPC over venture_usage_events. '
  'service_role ONLY (not anon/authenticated-callable) -- callers are trusted internal server-side '
  'code (verifyCapabilityWired, stage-23-launch-readiness.js), never an end-user session.';

-- Explicit, belt-and-suspenders REVOKE + minimal GRANT (see 20260812_venture_ingest_key_binding.sql
-- header for why this is not redundant with ALTER DEFAULT PRIVILEGES -- that mechanism is
-- confirmed still open in this database, so every new function needs this explicit pair).
REVOKE ALL ON FUNCTION public.fn_venture_usage_window_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_venture_usage_window_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 2. Self-verify the grant posture (20260812 precedent pattern).
-- ============================================================
DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.fn_venture_usage_window_summary(uuid,timestamptz,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_venture_usage_window_summary(uuid,timestamptz,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_venture_usage_window_summary is callable by anon or authenticated -- must be service_role only';
  END IF;

  IF has_function_privilege('service_role', 'public.fn_venture_usage_window_summary(uuid,timestamptz,timestamptz)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: service_role cannot execute fn_venture_usage_window_summary -- FR-3''s call site would be unreachable';
  END IF;

  IF (SELECT count(*) FROM pg_proc WHERE proname = 'fn_venture_usage_window_summary') <> 1 THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_venture_usage_window_summary signature count != 1 -- an unexpected overload may exist';
  END IF;
END
$verify$;

COMMIT;

-- ROLLBACK: DROP FUNCTION IF EXISTS public.fn_venture_usage_window_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
