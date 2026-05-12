-- SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 FR-1 + FR-5
-- Closes the 4th writer-consumer asymmetry: worker's _canAutoAdvance 4-layer
-- check vs UI's simplified isGlobalAutoApprove. Single source of truth via
-- SECURITY DEFINER RPC consumed by both worker and UI.
--
-- Empirical witness: NameSignal venture at S11 (review-mode), Continue button
-- missing because UI thought stage was auto-advance-eligible but worker refused
-- at Layer 4 (review-mode default-pause without opt-in). 4 stages affected
-- today: S7, S9, S11 (review-mode L4) + S16 (hard_gate_stages drift L2).
--
-- Reviewed by DATABASE sub-agent (verdict 2762deac, WARNING@88%):
--   DB-4 SECURITY DEFINER hardening (search_path, REVOKE/GRANT, DENY anon)
--   DB-5 audit trigger mirroring trg_stage_config_audit
--   DB-8 ADD chairman_dashboard_config to supabase_realtime publication
--
-- Per REGRESSION REG-4 + TESTING #6 cross-check: signature is
-- can_auto_advance(p_stage_number int) — NO p_company_id. No current caller
-- threads company context; multi-tenancy is a deliberate follow-up SD.

-- ────────────────────────────────────────────────────────────────────────────
-- Part A: chairman_dashboard_config audit table + trigger (DATABASE DB-5)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chairman_dashboard_config_audit (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID,
  source_id UUID NOT NULL,
  old_row JSONB,
  new_row JSONB,
  diff JSONB
);

COMMENT ON TABLE chairman_dashboard_config_audit IS
  'Append-only audit log for chairman_dashboard_config governance changes. '
  'Mirrors stage_config_audit. Source: SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 FR-1.';

CREATE INDEX IF NOT EXISTS idx_chairman_dashboard_config_audit_changed_at
  ON chairman_dashboard_config_audit(changed_at DESC);

CREATE OR REPLACE FUNCTION fn_chairman_dashboard_config_governance_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action TEXT := TG_OP;
  v_diff JSONB := '{}'::jsonb;
BEGIN
  IF v_action = 'UPDATE' THEN
    -- Only emit when one of the watched governance columns changed
    IF NEW.global_auto_proceed IS DISTINCT FROM OLD.global_auto_proceed THEN
      v_diff := v_diff || jsonb_build_object('global_auto_proceed', jsonb_build_object('old', OLD.global_auto_proceed, 'new', NEW.global_auto_proceed));
    END IF;
    IF NEW.stage_overrides IS DISTINCT FROM OLD.stage_overrides THEN
      v_diff := v_diff || jsonb_build_object('stage_overrides', jsonb_build_object('old', OLD.stage_overrides, 'new', NEW.stage_overrides));
    END IF;
    IF NEW.hard_gate_stages IS DISTINCT FROM OLD.hard_gate_stages THEN
      v_diff := v_diff || jsonb_build_object('hard_gate_stages_DEPRECATED', jsonb_build_object('old', OLD.hard_gate_stages, 'new', NEW.hard_gate_stages));
      RAISE NOTICE 'chairman_dashboard_config.hard_gate_stages is @deprecated (SD-LEO-REFAC-GATE-AUTO-ADVANCE-001). Use stage_config.gate_type as the source of truth.';
    END IF;

    IF v_diff = '{}'::jsonb THEN
      RETURN NEW;  -- nothing watched changed
    END IF;
  END IF;

  INSERT INTO chairman_dashboard_config_audit (action, changed_by, source_id, old_row, new_row, diff)
  VALUES (
    v_action,
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN v_action <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN v_action <> 'DELETE' THEN to_jsonb(NEW) END,
    CASE WHEN v_action = 'UPDATE' THEN v_diff ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_chairman_dashboard_config_governance_audit() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_chairman_dashboard_config_governance_audit ON chairman_dashboard_config;
CREATE TRIGGER trg_chairman_dashboard_config_governance_audit
  AFTER INSERT OR UPDATE OR DELETE ON chairman_dashboard_config
  FOR EACH ROW EXECUTE FUNCTION fn_chairman_dashboard_config_governance_audit();

-- ────────────────────────────────────────────────────────────────────────────
-- Part B: can_auto_advance RPC (DATABASE DB-3/4/10, REGRESSION REG-7)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION can_auto_advance(p_stage_number INT)
RETURNS TABLE(can BOOLEAN, reason TEXT, layer INT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cdc RECORD;
  v_stage RECORD;
  v_override JSONB;
  v_override_auto_proceed BOOLEAN;
BEGIN
  -- Resolve config (single tenant row by config_key='default' — matches worker).
  SELECT global_auto_proceed, stage_overrides, hard_gate_stages
    INTO v_cdc
    FROM chairman_dashboard_config
   WHERE config_key = 'default'
   LIMIT 1;

  IF v_cdc IS NULL THEN
    RETURN QUERY SELECT FALSE, 'config_missing'::TEXT, 0;
    RETURN;
  END IF;

  -- Resolve stage metadata (gate_type, review_mode) from stage_config.
  SELECT stage_number, gate_type, review_mode
    INTO v_stage
    FROM stage_config
   WHERE stage_number = p_stage_number
   LIMIT 1;

  IF v_stage IS NULL THEN
    RETURN QUERY SELECT FALSE, 'stage_not_found'::TEXT, 0;
    RETURN;
  END IF;

  -- L1: global master toggle
  IF v_cdc.global_auto_proceed IS NOT TRUE THEN
    RETURN QUERY SELECT FALSE, 'global_off'::TEXT, 1;
    RETURN;
  END IF;

  -- L2: kill/promotion gates never auto-advance (source: stage_config.gate_type)
  IF v_stage.gate_type IN ('kill', 'promotion') THEN
    RETURN QUERY SELECT FALSE, 'kill_promotion_gate'::TEXT, 2;
    RETURN;
  END IF;

  -- Resolve per-stage override
  v_override := v_cdc.stage_overrides -> ('stage_' || p_stage_number);
  v_override_auto_proceed := (v_override ->> 'auto_proceed')::BOOLEAN;

  -- L3: explicit pause
  IF v_override_auto_proceed IS FALSE THEN
    RETURN QUERY SELECT FALSE, 'explicit_pause'::TEXT, 3;
    RETURN;
  END IF;

  -- L4: review-mode default-pause unless explicit opt-in
  IF v_stage.review_mode = 'review' AND (v_override_auto_proceed IS NULL OR v_override_auto_proceed IS NOT TRUE) THEN
    RETURN QUERY SELECT FALSE, 'review_default_pause'::TEXT, 4;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 'approved'::TEXT, NULL::INT;
END;
$$;

COMMENT ON FUNCTION can_auto_advance(INT) IS
  'SECURITY DEFINER. Single source of truth for stage auto-advance eligibility. '
  '4-layer check: L1 global_auto_proceed, L2 kill/promotion gate, L3 explicit '
  'pause override, L4 review-mode default-pause. Reason enum: config_missing, '
  'stage_not_found, global_off, kill_promotion_gate, explicit_pause, '
  'review_default_pause, approved. Consumed by both lib/eva/stage-execution-worker '
  '(EHG_Engineer) and useStageGovernance.canAutoAdvance (EHG UI). '
  'Source: SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 FR-1 (2026-05-12).';

REVOKE EXECUTE ON FUNCTION can_auto_advance(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_auto_advance(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION can_auto_advance(INT) TO service_role;
-- anon is implicitly denied via REVOKE FROM PUBLIC.

-- ────────────────────────────────────────────────────────────────────────────
-- Part C: realtime publication for UI invalidation (DATABASE DB-8 BLOCKING)
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'chairman_dashboard_config'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chairman_dashboard_config';
  END IF;
END $$;

ALTER TABLE chairman_dashboard_config REPLICA IDENTITY DEFAULT;

-- ────────────────────────────────────────────────────────────────────────────
-- Part D: FR-5 deprecate hard_gate_stages column (NO removal)
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN chairman_dashboard_config.hard_gate_stages IS
  '@deprecated since SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 (2026-05-12). Source of '
  'truth is now stage_config.gate_type, read via the can_auto_advance(stage_number) '
  'RPC. Column preserved for backward compatibility (8+ active read sites in EHG '
  'UI + 4 worker sites). Removal scheduled in a follow-up SD after bake-in period.';
