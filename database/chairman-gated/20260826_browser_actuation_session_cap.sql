-- SD-LEO-FEAT-GUARDRAILED-BROWSER-ACTUATION-001 — FR-4 atomic per-session action cap
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
-- Adds browser_actuation_session_caps (one row per session_id) and
-- fn_try_consume_browser_actuation_cap(p_session_id, p_cap_limit), an atomic
-- INSERT ... ON CONFLICT DO UPDATE ... WHERE action_count < cap_limit RETURNING statement — the
-- increment and the cap check happen in a single DB round trip, so two concurrent calls against a
-- session one action below its cap cannot both succeed (PRD TS-5).
--
-- app_config (existing key/value table) is reused for the fleet-wide kill switch
-- (browser_actuation_kill_switch) and the write allowlist (browser_actuation_write_allowlist) — no
-- new tables needed for those two; only the cap needs a dedicated table because it requires an
-- atomic per-session counter, which app_config's shared key/value shape cannot express safely.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ============================================================
-- 1. browser_actuation_session_caps
-- ============================================================
CREATE TABLE IF NOT EXISTS public.browser_actuation_session_caps (
  session_id TEXT PRIMARY KEY,
  action_count INTEGER NOT NULL DEFAULT 0,
  cap_limit INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.browser_actuation_session_caps IS
  'SD-LEO-FEAT-GUARDRAILED-BROWSER-ACTUATION-001 FR-4: one row per browser-actuation session, '
  'tracking the atomic action count against its configured cap. Written only via '
  'fn_try_consume_browser_actuation_cap, never a direct client UPDATE.';

-- ============================================================
-- 2. fn_try_consume_browser_actuation_cap
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_try_consume_browser_actuation_cap(
  p_session_id TEXT,
  p_cap_limit INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_consumed BOOLEAN := false;
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN
    RAISE EXCEPTION 'fn_try_consume_browser_actuation_cap: p_session_id is required';
  END IF;
  IF p_cap_limit IS NULL OR p_cap_limit < 1 THEN
    RAISE EXCEPTION 'fn_try_consume_browser_actuation_cap: p_cap_limit must be >= 1';
  END IF;

  INSERT INTO public.browser_actuation_session_caps (session_id, action_count, cap_limit)
  VALUES (p_session_id, 1, p_cap_limit)
  ON CONFLICT (session_id) DO UPDATE
    SET action_count = public.browser_actuation_session_caps.action_count + 1,
        updated_at = now()
    WHERE public.browser_actuation_session_caps.action_count < public.browser_actuation_session_caps.cap_limit
  RETURNING true INTO v_consumed;

  RETURN COALESCE(v_consumed, false);
END;
$$;

COMMENT ON FUNCTION public.fn_try_consume_browser_actuation_cap(TEXT, INTEGER) IS
  'SD-LEO-FEAT-GUARDRAILED-BROWSER-ACTUATION-001 FR-4: atomic check-and-increment of a session''s '
  'browser-actuation action count against its cap. Returns true (and consumes one unit) if the '
  'session is below its cap, false (no mutation) if at or above it. service_role ONLY.';

-- Explicit, belt-and-suspenders REVOKE + minimal GRANT (20260812_venture_ingest_key_binding.sql
-- precedent — ALTER DEFAULT PRIVILEGES is confirmed still open in this database, so every new
-- function needs this explicit pair).
REVOKE EXECUTE ON FUNCTION public.fn_try_consume_browser_actuation_cap(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_try_consume_browser_actuation_cap(TEXT, INTEGER) TO service_role;

-- browser_actuation_session_caps itself is never read/written directly by anon/authenticated —
-- only via the SECURITY DEFINER RPC above.
REVOKE ALL ON public.browser_actuation_session_caps FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.browser_actuation_session_caps TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 3. Self-verify the grant posture (20260812/20260826 precedent pattern).
-- ============================================================
DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.fn_try_consume_browser_actuation_cap(text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_try_consume_browser_actuation_cap(text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_try_consume_browser_actuation_cap is callable by anon or authenticated -- must be service_role only';
  END IF;

  IF has_function_privilege('service_role', 'public.fn_try_consume_browser_actuation_cap(text,integer)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: service_role cannot execute fn_try_consume_browser_actuation_cap -- FR-4''s call site would be unreachable';
  END IF;

  IF (SELECT count(*) FROM pg_proc WHERE proname = 'fn_try_consume_browser_actuation_cap') <> 1 THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_try_consume_browser_actuation_cap signature count != 1 -- an unexpected overload may exist';
  END IF;

  IF to_regclass('public.browser_actuation_session_caps') IS NULL THEN
    RAISE EXCEPTION 'VERIFY FAILED: browser_actuation_session_caps table was not created';
  END IF;
END
$verify$;

COMMIT;

-- ROLLBACK: see 20260826_browser_actuation_session_cap_DOWN.sql
