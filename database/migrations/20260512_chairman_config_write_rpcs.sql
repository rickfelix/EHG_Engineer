-- SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 FR-7
-- @approved-by: rickfelix@example.com
--
-- SECURITY DEFINER RPCs for authenticated chairman writes to chairman_dashboard_config.
--
-- Problem: Existing RLS on chairman_dashboard_config blocks UPDATEs from authenticated
-- and anon roles (service-role only). The EHG UI hook useStageGovernance.toggleStageOverride
-- does a direct .from('chairman_dashboard_config').update(...) using the anon-key client,
-- which silently 0-row-updates and returns success — UI toggles have been no-op since
-- 2026-04-12 (the row's last legitimate update via service-role).
--
-- Verified via end-to-end probe 2026-05-12: anon-key UPDATE returns 204 No Content but
-- the row is unchanged. Chairman expects toggles to work.
--
-- Resolution (FR-7): SECURITY DEFINER RPCs that the UI calls instead of direct UPDATE.
-- Each RPC:
--   1. Requires auth.uid() (rejects anon)
--   2. Bypasses RLS via DEFINER (the function owner has service-role-equivalent privilege)
--   3. Enforces defense-in-depth invariants (kill/promotion gates not overrideable)
--   4. SET search_path = public (mitigates search_path-injection on DEFINER funcs)
--   5. GRANT EXECUTE TO authenticated only; REVOKE FROM PUBLIC
--
-- Audit-trail: override values embed set_by (auth.uid()::text) and set_at (NOW()) so
-- changes are traceable even though chairman_dashboard_config does not have a per-row
-- audit trigger.
--
-- Idempotency: CREATE OR REPLACE on each function. Grant/Revoke are idempotent.

BEGIN;

SET LOCAL application_name = 'SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001-FR-7';

-- ============================================================================
-- RPC 1: set_stage_override(stage_number, auto_proceed, reason)
--   auto_proceed = true  -> write {auto_proceed: true, ...}  (opt-in for review-mode)
--   auto_proceed = false -> write {auto_proceed: false, ...} (explicit pause)
--   auto_proceed = null  -> delete the stage_<n> key (back to default)
--
-- Defense-in-depth: reject auto_proceed = true on kill/promotion gates (those are
-- hard requirements per FR-1; honored by worker _canAutoAdvance regardless, but
-- defense at the write layer keeps stage_overrides clean).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_stage_override(
  p_stage_number int,
  p_auto_proceed boolean,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gate_type text;
  v_user_id uuid := auth.uid();
  v_current jsonb;
  v_updated jsonb;
  v_key text;
  v_entry jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'
      USING HINT = 'Caller must be an authenticated user.';
  END IF;

  SELECT gate_type INTO v_gate_type
  FROM public.stage_config
  WHERE stage_number = p_stage_number;

  IF v_gate_type IS NULL THEN
    RAISE EXCEPTION 'INVALID_STAGE_NUMBER: %', p_stage_number
      USING HINT = 'No row in stage_config for the given stage_number.';
  END IF;

  -- Defense-in-depth: kill/promotion gates are NEVER overrideable to auto-advance.
  IF p_auto_proceed = true AND v_gate_type IN ('kill', 'promotion') THEN
    RAISE EXCEPTION 'KILL_PROMOTION_NOT_OVERRIDABLE: stage % has gate_type %', p_stage_number, v_gate_type
      USING HINT = 'Kill and promotion gates require manual chairman approval and cannot be auto-advanced.';
  END IF;

  v_key := 'stage_' || p_stage_number;

  SELECT stage_overrides INTO v_current
  FROM public.chairman_dashboard_config
  WHERE config_key = 'default';

  IF v_current IS NULL THEN
    v_current := '{}'::jsonb;
  END IF;

  IF p_auto_proceed IS NULL THEN
    -- DELETE the key (clear override; revert to default).
    v_updated := v_current - v_key;
  ELSE
    v_entry := jsonb_build_object(
      'auto_proceed', p_auto_proceed,
      'reason', COALESCE(p_reason, CASE
        WHEN p_auto_proceed = true THEN 'Opted in to auto-advance by Chairman'
        ELSE 'Paused by Chairman'
      END),
      'set_by', v_user_id::text,
      'set_at', NOW()::text
    );
    v_updated := v_current || jsonb_build_object(v_key, v_entry);
  END IF;

  UPDATE public.chairman_dashboard_config
  SET stage_overrides = v_updated,
      updated_at = NOW()
  WHERE config_key = 'default';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFIG_ROW_MISSING: chairman_dashboard_config row with config_key=default not found'
      USING HINT = 'Seed the default row before calling this function.';
  END IF;

  RETURN jsonb_build_object(
    'stage_number', p_stage_number,
    'auto_proceed', p_auto_proceed,
    'gate_type', v_gate_type,
    'set_by', v_user_id::text,
    'cleared', p_auto_proceed IS NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_stage_override(int, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_stage_override(int, boolean, text) TO authenticated;
COMMENT ON FUNCTION public.set_stage_override(int, boolean, text) IS
  'SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 FR-7: chairman per-stage override writer. SECURITY DEFINER with kill/promotion defense-in-depth.';

-- ============================================================================
-- RPC 2: set_global_auto_proceed(enabled)
--   Toggles chairman_dashboard_config.global_auto_proceed.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_global_auto_proceed(
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'INVALID_VALUE: p_enabled must be true or false (not null)';
  END IF;

  UPDATE public.chairman_dashboard_config
  SET global_auto_proceed = p_enabled,
      updated_at = NOW()
  WHERE config_key = 'default';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFIG_ROW_MISSING: chairman_dashboard_config row with config_key=default not found';
  END IF;

  RETURN jsonb_build_object(
    'global_auto_proceed', p_enabled,
    'set_by', v_user_id::text
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_global_auto_proceed(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_global_auto_proceed(boolean) TO authenticated;
COMMENT ON FUNCTION public.set_global_auto_proceed(boolean) IS
  'SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 FR-7: chairman master toggle writer. SECURITY DEFINER.';

-- ============================================================================
-- Verification: confirm both functions exist with SECURITY DEFINER and the right grants.
-- ============================================================================
DO $$
DECLARE
  v_set_stage_override_count int;
  v_set_global_count int;
BEGIN
  SELECT count(*) INTO v_set_stage_override_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'set_stage_override'
    AND p.prosecdef = true;

  IF v_set_stage_override_count <> 1 THEN
    RAISE EXCEPTION '[VGU-001-FR7-VERIFY] set_stage_override not present as SECURITY DEFINER (count=%)', v_set_stage_override_count;
  END IF;

  SELECT count(*) INTO v_set_global_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'set_global_auto_proceed'
    AND p.prosecdef = true;

  IF v_set_global_count <> 1 THEN
    RAISE EXCEPTION '[VGU-001-FR7-VERIFY] set_global_auto_proceed not present as SECURITY DEFINER (count=%)', v_set_global_count;
  END IF;

  RAISE NOTICE '[VGU-001-FR7-VERIFY] Both RPCs present as SECURITY DEFINER with search_path=public,pg_temp';
END $$;

COMMIT;
