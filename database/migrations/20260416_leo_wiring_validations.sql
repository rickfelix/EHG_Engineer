-- =============================================================================
-- Migration: LEO Wiring Verification Framework — persistence + gate spine
-- SD:   SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-D
-- Date: 2026-04-16
--
-- Ships the schema that turns five stand-alone detector scripts (Child A
-- orphan-detector, Child B spec-code-drift-detector, and future C/E verifiers)
-- from advisory stdout-emitters into a DB-backed gate.
--
-- Design informed by eva_vision_documents.quality_checked (reference:
-- 20260314_quality_checked_enforcement_triggers.sql). Deliberate divergences:
--   - Normalises results into a separate table (leo_wiring_validations) instead
--     of a jsonb column, so trigger aggregation is an indexed scan, not a
--     jsonb parse.
--   - Delegates blocking to the application-layer handoff gate, not a
--     BEFORE UPDATE RAISE EXCEPTION trigger, because wiring has per-check
--     waiver semantics that belong in app code.
--
-- Applies DATABASE sub-agent CONDITIONAL_PASS conditions (row
-- 50ed9ee2-230e-442e-ab20-f25297727d21):
--   C1 ENUM_ENCODING          — PG ENUM types (ALTER TYPE ADD VALUE O(1))
--   C2 INDEX_COVERAGE         — idx_lwv_sd_key + partial idx for failed/pending
--   C3 RLS_WAIVE_GUARD        — REVOKE/GRANT + search_path = pg_catalog, public
--   C4 CHAIRMAN_READ_PATH     — SECDEF wrapper get_wiring_validation_status
--   C5 LOCK_TIMEOUT           — SET lock_timeout = 3s around ALTER TABLE
--   C6 AUDIT_ATOMIC           — audit_log insert atomic with waive insert
--   C7 TRIGGER_CASCADE_GUARD  — WHERE wiring_validated IS DISTINCT FROM new
--
-- Applies DESIGN sub-agent conditions (row 6bc14243-fc9b-4365-abd0-b24f18d9bad8):
--   DC3 EVIDENCE_JSONB_SHAPE  — standardised {file, reason, confidence,
--                               check_type, detail?} so future chairman
--                               dashboard does not need schema refactor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ENUM types (C1 — ALTER TYPE ADD VALUE is catalog-only)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE leo_wiring_check_type AS ENUM (
    'orphan_detection',
    'spec_code_drift',
    'vision_traceability',
    'pipeline_integration',
    'e2e_demo'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE leo_wiring_check_status AS ENUM (
    'passed',
    'failed',
    'warning',
    'pending'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE leo_wiring_check_type IS
  'Discriminates the five LEO Wiring Verification Framework detectors. '
  'New values added via ALTER TYPE ... ADD VALUE (O(1), no table rewrite).';

COMMENT ON TYPE leo_wiring_check_status IS
  'Per-check outcome. status=passed OR waived_by IS NOT NULL counts as pass '
  'in recompute_wiring_validated().';


-- ---------------------------------------------------------------------------
-- 2. leo_wiring_validations table (detector output persistence)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS leo_wiring_validations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_key             text NOT NULL,
  check_type         leo_wiring_check_type NOT NULL,
  status             leo_wiring_check_status NOT NULL DEFAULT 'pending',
  signals_detected   int NOT NULL DEFAULT 0 CHECK (signals_detected >= 0),
  -- DC3: standardised evidence shape for future dashboard compatibility.
  -- Expected keys: file, reason, confidence, check_type; detail optional.
  evidence           jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_at        timestamptz NOT NULL DEFAULT now(),
  waived_by          uuid,
  waive_reason       text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- One row per (sd_key, check_type); latest result wins via UPSERT.
  CONSTRAINT leo_wiring_validations_unique UNIQUE (sd_key, check_type),

  -- Waiver consistency: either both set or both null.
  CONSTRAINT leo_wiring_validations_waiver_consistency CHECK (
    (waived_by IS NULL AND waive_reason IS NULL)
    OR
    (waived_by IS NOT NULL AND waive_reason IS NOT NULL AND length(waive_reason) >= 10)
  )
);

COMMENT ON TABLE leo_wiring_validations IS
  'Persistent store of LEO Wiring Verification Framework detector outputs. '
  'Mirrors eva_vision_documents.quality_checked pattern — detector writes, '
  'trigger derives strategic_directives_v2.wiring_validated, handoff gate '
  'queries derived column. SD: SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-D.';

-- C2: index coverage beyond the unique key.
-- Covers: recompute aggregate (sd_key lookup) + dashboard queue query.
CREATE INDEX IF NOT EXISTS idx_lwv_sd_key
  ON leo_wiring_validations (sd_key);

CREATE INDEX IF NOT EXISTS idx_lwv_status_open
  ON leo_wiring_validations (status)
  WHERE status IN ('failed', 'pending');

-- updated_at maintenance (standard pattern used elsewhere in this DB).
CREATE OR REPLACE FUNCTION lwv_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lwv_set_updated_at ON leo_wiring_validations;
CREATE TRIGGER trg_lwv_set_updated_at
  BEFORE UPDATE ON leo_wiring_validations
  FOR EACH ROW
  EXECUTE FUNCTION lwv_set_updated_at();


-- ---------------------------------------------------------------------------
-- 3. strategic_directives_v2.wiring_validated column
-- C5: lock_timeout wrapper. DEFAULT NULL is metadata-only on PG15 but still
--     takes a brief ACCESS EXCLUSIVE for the catalog update.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategic_directives_v2'
      AND column_name = 'wiring_validated'
  ) INTO col_exists;

  IF NOT col_exists THEN
    SET LOCAL lock_timeout = '3s';
    ALTER TABLE strategic_directives_v2
      ADD COLUMN wiring_validated boolean DEFAULT NULL;
    COMMENT ON COLUMN strategic_directives_v2.wiring_validated IS
      'Derived boolean maintained by trg_zz_maintain_wiring_validated on '
      'leo_wiring_validations insert/update. true = all required checks '
      'passed-or-waived; false = at least one required check failed '
      'unwaived; null = required checks missing. Gate logic reads this '
      'column, not the underlying validation rows.';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 4. Required-checks configuration (which check_types are required per SD).
--    Start with static list — future work can move to per-orchestrator config.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION leo_wiring_required_check_types()
RETURNS leo_wiring_check_type[] AS $$
  SELECT ARRAY[
    'orphan_detection'::leo_wiring_check_type,
    'spec_code_drift'::leo_wiring_check_type
    -- vision_traceability / pipeline_integration / e2e_demo added as C/E land
  ];
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION leo_wiring_required_check_types() IS
  'Required check_types for wiring_validated derivation. Currently A + B only '
  '(shipped detectors). Extend as C/E land. Kept as function (not constant) '
  'to support future per-orchestrator override without schema changes.';


-- ---------------------------------------------------------------------------
-- 5. recompute_wiring_validated(sd_key) — trigger-invoked derivation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recompute_wiring_validated(p_sd_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public   -- C3 hardening
AS $$
DECLARE
  v_required    leo_wiring_check_type[] := leo_wiring_required_check_types();
  v_required_n  int := array_length(v_required, 1);
  v_present_n   int;
  v_failed_n    int;
  v_new         boolean;
  v_current     boolean;
BEGIN
  -- How many required checks are present (passed or waived)?
  SELECT count(*)
    INTO v_present_n
    FROM leo_wiring_validations
   WHERE sd_key = p_sd_key
     AND check_type = ANY(v_required)
     AND (status = 'passed' OR waived_by IS NOT NULL);

  -- How many required checks are actively failed (not waived)?
  SELECT count(*)
    INTO v_failed_n
    FROM leo_wiring_validations
   WHERE sd_key = p_sd_key
     AND check_type = ANY(v_required)
     AND status = 'failed'
     AND waived_by IS NULL;

  IF v_failed_n > 0 THEN
    v_new := false;
  ELSIF v_present_n = v_required_n THEN
    v_new := true;
  ELSE
    v_new := NULL;
  END IF;

  -- C7: cascade guard — only UPDATE if value actually changes.
  SELECT wiring_validated INTO v_current
    FROM strategic_directives_v2
   WHERE sd_key = p_sd_key;

  IF v_current IS DISTINCT FROM v_new THEN
    UPDATE strategic_directives_v2
       SET wiring_validated = v_new
     WHERE sd_key = p_sd_key;
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION recompute_wiring_validated(text) IS
  'Derives strategic_directives_v2.wiring_validated for the given SD from '
  'leo_wiring_validations. Invoked by trigger after INSERT/UPDATE on the '
  'validations table. C7 cascade guard prevents no-op UPDATEs.';


-- ---------------------------------------------------------------------------
-- 6. Trigger: maintain wiring_validated on detector writes
--    Name prefix "trg_zz_" future-proofs alphabetical ordering (fires after
--    any other trg_* on this table).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_zz_maintain_wiring_validated_fn()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recompute_wiring_validated(NEW.sd_key);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

DROP TRIGGER IF EXISTS trg_zz_maintain_wiring_validated ON leo_wiring_validations;
CREATE TRIGGER trg_zz_maintain_wiring_validated
  AFTER INSERT OR UPDATE ON leo_wiring_validations
  FOR EACH ROW
  EXECUTE FUNCTION trg_zz_maintain_wiring_validated_fn();


-- ---------------------------------------------------------------------------
-- 7. waive_wiring_check RPC — chairman override with atomic audit trail (C6)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION waive_wiring_check(
  p_sd_key     text,
  p_check_type leo_wiring_check_type,
  p_reason     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public   -- C3 hardening
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role   text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
BEGIN
  -- C3: explicit role check inside SECURITY DEFINER body.
  IF v_role NOT IN ('service_role', 'chairman') THEN
    RAISE EXCEPTION 'waive_wiring_check requires chairman or service_role (got: %)', v_role
      USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'waive_wiring_check: p_reason must be >= 10 chars (got length %)',
      coalesce(length(trim(p_reason)), 0)
      USING ERRCODE = '22023';
  END IF;

  -- C6: waiver update and audit_log insert in a single transaction (implicit
  -- in plpgsql function body). No try/catch — any failure rolls back both.
  UPDATE leo_wiring_validations
     SET waived_by    = v_caller,
         waive_reason = p_reason,
         updated_at   = now()
   WHERE sd_key = p_sd_key
     AND check_type = p_check_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'waive_wiring_check: no row for sd_key=% check_type=%',
      p_sd_key, p_check_type
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO audit_log (event_type, severity, sd_key, payload, created_by)
  VALUES (
    'wiring_waiver_granted',
    'warning',
    p_sd_key,
    jsonb_build_object(
      'check_type', p_check_type::text,
      'reason', p_reason,
      'waived_by', v_caller
    ),
    v_caller
  );

  -- Trigger will recompute wiring_validated via the UPDATE above.
END;
$$;

REVOKE EXECUTE ON FUNCTION waive_wiring_check(text, leo_wiring_check_type, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION waive_wiring_check(text, leo_wiring_check_type, text) TO service_role;

COMMENT ON FUNCTION waive_wiring_check(text, leo_wiring_check_type, text) IS
  'Chairman override for a single wiring check. Updates the row and writes '
  'an audit_log entry atomically. Revoked from anon/PUBLIC (C3). Reason must '
  'be >=10 chars. Trigger recomputes wiring_validated.';


-- ---------------------------------------------------------------------------
-- 8. get_wiring_validation_status — read wrapper for chairman dashboard (C4)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_wiring_validation_status(p_sd_key text)
RETURNS TABLE (
  sd_key            text,
  check_type        leo_wiring_check_type,
  status            leo_wiring_check_status,
  signals_detected  int,
  evidence          jsonb,
  executed_at       timestamptz,
  waived_by         uuid,
  waive_reason      text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT sd_key, check_type, status, signals_detected, evidence,
         executed_at, waived_by, waive_reason
    FROM leo_wiring_validations
   WHERE sd_key = p_sd_key
   ORDER BY check_type;
$$;

REVOKE EXECUTE ON FUNCTION get_wiring_validation_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_wiring_validation_status(text) TO service_role, authenticated;

COMMENT ON FUNCTION get_wiring_validation_status(text) IS
  'Read wrapper so the chairman dashboard can inspect wiring status without '
  'direct table access (which is service-role only). Authenticated users can '
  'read; write access still requires service_role or the waive_wiring_check '
  'RPC.';


-- ---------------------------------------------------------------------------
-- 9. RLS — service-role write, authenticated read via RPC only.
-- ---------------------------------------------------------------------------

ALTER TABLE leo_wiring_validations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lwv_service_all ON leo_wiring_validations;
CREATE POLICY lwv_service_all
  ON leo_wiring_validations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated clients go through get_wiring_validation_status() (SECURITY DEFINER).
-- No direct SELECT policy is deliberately intended.


-- ---------------------------------------------------------------------------
-- 10. Down-migration guidance (manual; not wrapped in a DOWN transaction).
-- ---------------------------------------------------------------------------
-- To roll back this migration (order matters):
--
--   DROP TRIGGER IF EXISTS trg_zz_maintain_wiring_validated ON leo_wiring_validations;
--   DROP FUNCTION IF EXISTS trg_zz_maintain_wiring_validated_fn();
--   DROP FUNCTION IF EXISTS recompute_wiring_validated(text);
--   DROP FUNCTION IF EXISTS get_wiring_validation_status(text);
--   DROP FUNCTION IF EXISTS waive_wiring_check(text, leo_wiring_check_type, text);
--   DROP FUNCTION IF EXISTS leo_wiring_required_check_types();
--   DROP TRIGGER IF EXISTS trg_lwv_set_updated_at ON leo_wiring_validations;
--   DROP FUNCTION IF EXISTS lwv_set_updated_at();
--   DROP TABLE IF EXISTS leo_wiring_validations;
--   DROP TYPE IF EXISTS leo_wiring_check_status;
--   DROP TYPE IF EXISTS leo_wiring_check_type;
--   ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS wiring_validated;
-- =============================================================================
