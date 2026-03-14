-- Migration: Advisory triggers for artifact creation source validation
-- Purpose: Log warnings to audit_log when PRDs, Vision Docs, or Architecture Plans
--          are created without proper provenance (extends NC-002 pattern from SD trigger)
-- Advisory only: NEVER blocks INSERT, only logs for observability
--
-- Reference: 20260314_sd_creation_source_advisory.sql (same pattern)
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_prd_creation_source_advisory ON product_requirements_v2;
--   DROP FUNCTION IF EXISTS check_prd_creation_source();
--   DROP TRIGGER IF EXISTS trg_vision_creation_source_advisory ON eva_vision_documents;
--   DROP FUNCTION IF EXISTS check_vision_creation_source();
--   DROP TRIGGER IF EXISTS trg_arch_creation_source_advisory ON eva_architecture_plans;
--   DROP FUNCTION IF EXISTS check_arch_creation_source();

-- ============================================================================
-- 1. PRD Creation Source Advisory (product_requirements_v2)
-- ============================================================================
-- Schema notes:
--   - Has metadata JSONB column -> check metadata->>'created_via'
--   - Has created_by VARCHAR column (fallback context)
--   - Has directive_id VARCHAR (SD reference, logged for traceability)

CREATE OR REPLACE FUNCTION check_prd_creation_source()
RETURNS TRIGGER AS $$
DECLARE
  v_created_via TEXT;
  v_valid_sources TEXT[] := ARRAY[
    'add-prd-to-database',
    'unified-handoff-system',
    'ADMIN_OVERRIDE'
  ];
  v_entity_id TEXT;
  v_audit_log_exists BOOLEAN;
BEGIN
  -- Extract created_via from metadata JSONB (safely handle NULL metadata)
  v_created_via := COALESCE(NEW.metadata->>'created_via', 'MISSING');
  v_entity_id := COALESCE(NEW.id::text, 'UNKNOWN');

  -- Only fire advisory logic if source is missing or not in valid list
  IF v_created_via = 'MISSING' OR NOT (v_created_via = ANY(v_valid_sources)) THEN

    -- Check if audit_log table exists (defensive: avoid breaking if table is dropped)
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'audit_log'
    ) INTO v_audit_log_exists;

    IF v_audit_log_exists THEN
      -- Log advisory warning to audit_log
      INSERT INTO audit_log (
        event_type,
        entity_type,
        entity_id,
        new_value,
        metadata,
        severity,
        created_by
      ) VALUES (
        'prd_creation_source_missing',
        'product_requirement',
        v_entity_id,
        jsonb_build_object(
          'prd_id', v_entity_id,
          'directive_id', COALESCE(NEW.directive_id, 'UNKNOWN'),
          'created_via', v_created_via,
          'created_by', COALESCE(NEW.created_by, 'UNKNOWN'),
          'metadata_snapshot', NEW.metadata
        ),
        jsonb_build_object(
          'nc_code', 'NC-002',
          'description', 'PRD created without valid provenance. Expected creation via add-prd-to-database.js or other approved pipeline.',
          'valid_sources', to_jsonb(v_valid_sources),
          'detected_source', v_created_via,
          'trigger', 'trg_prd_creation_source_advisory'
        ),
        'warning',
        'trg_prd_creation_source_advisory'
      );
    ELSE
      -- Fallback: use RAISE NOTICE if audit_log does not exist
      RAISE NOTICE '[NC-002 ADVISORY] PRD "%" created with unrecognized source: "%". Expected one of: add-prd-to-database, unified-handoff-system, ADMIN_OVERRIDE',
        v_entity_id, v_created_via;
    END IF;

  END IF;

  -- ALWAYS return NEW: this trigger must NEVER block an insert
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_prd_creation_source() IS
  'Advisory trigger function for NC-002: logs warning when PRD is created without valid provenance (metadata->created_via). Never blocks inserts.';

DROP TRIGGER IF EXISTS trg_prd_creation_source_advisory ON product_requirements_v2;

CREATE TRIGGER trg_prd_creation_source_advisory
  AFTER INSERT ON product_requirements_v2
  FOR EACH ROW
  EXECUTE FUNCTION check_prd_creation_source();

COMMENT ON TRIGGER trg_prd_creation_source_advisory ON product_requirements_v2 IS
  'NC-002 Advisory: Logs warning to audit_log when PRD is created without valid created_via metadata. Does NOT block inserts.';


-- ============================================================================
-- 2. Vision Document Creation Source Advisory (eva_vision_documents)
-- ============================================================================
-- Schema notes:
--   - NO metadata JSONB column -> check created_by TEXT column instead
--   - Has vision_key VARCHAR (human-readable key)
--   - created_by stores the pipeline name (e.g., 'brainstorm-to-vision')

CREATE OR REPLACE FUNCTION check_vision_creation_source()
RETURNS TRIGGER AS $$
DECLARE
  v_created_by TEXT;
  v_valid_sources TEXT[] := ARRAY[
    'brainstorm-to-vision',
    'seed-l1-vision',
    'vision-scorer',
    'ADMIN_OVERRIDE'
  ];
  v_entity_id TEXT;
  v_audit_log_exists BOOLEAN;
BEGIN
  -- Extract created_by (the provenance indicator for this table)
  v_created_by := COALESCE(NEW.created_by, 'MISSING');
  v_entity_id := COALESCE(NEW.vision_key, NEW.id::text, 'UNKNOWN');

  -- Only fire advisory logic if source is missing or not in valid list
  IF v_created_by = 'MISSING' OR NOT (v_created_by = ANY(v_valid_sources)) THEN

    -- Check if audit_log table exists (defensive: avoid breaking if table is dropped)
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'audit_log'
    ) INTO v_audit_log_exists;

    IF v_audit_log_exists THEN
      -- Log advisory warning to audit_log
      INSERT INTO audit_log (
        event_type,
        entity_type,
        entity_id,
        new_value,
        metadata,
        severity,
        created_by
      ) VALUES (
        'vision_creation_source_missing',
        'vision_document',
        v_entity_id,
        jsonb_build_object(
          'vision_key', COALESCE(NEW.vision_key, 'UNKNOWN'),
          'created_by', v_created_by,
          'level', COALESCE(NEW.level, 'UNKNOWN'),
          'status', COALESCE(NEW.status, 'UNKNOWN')
        ),
        jsonb_build_object(
          'nc_code', 'NC-002',
          'description', 'Vision document created without valid provenance. Expected creation via brainstorm-to-vision, seed-l1-vision, or other approved pipeline.',
          'valid_sources', to_jsonb(v_valid_sources),
          'detected_source', v_created_by,
          'trigger', 'trg_vision_creation_source_advisory'
        ),
        'warning',
        'trg_vision_creation_source_advisory'
      );
    ELSE
      -- Fallback: use RAISE NOTICE if audit_log does not exist
      RAISE NOTICE '[NC-002 ADVISORY] Vision document "%" created with unrecognized source: "%". Expected one of: brainstorm-to-vision, seed-l1-vision, vision-scorer, ADMIN_OVERRIDE',
        v_entity_id, v_created_by;
    END IF;

  END IF;

  -- ALWAYS return NEW: this trigger must NEVER block an insert
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_vision_creation_source() IS
  'Advisory trigger function for NC-002: logs warning when vision document is created without valid provenance (created_by). Never blocks inserts.';

DROP TRIGGER IF EXISTS trg_vision_creation_source_advisory ON eva_vision_documents;

CREATE TRIGGER trg_vision_creation_source_advisory
  AFTER INSERT ON eva_vision_documents
  FOR EACH ROW
  EXECUTE FUNCTION check_vision_creation_source();

COMMENT ON TRIGGER trg_vision_creation_source_advisory ON eva_vision_documents IS
  'NC-002 Advisory: Logs warning to audit_log when vision document is created without valid created_by provenance. Does NOT block inserts.';


-- ============================================================================
-- 3. Architecture Plan Creation Source Advisory (eva_architecture_plans)
-- ============================================================================
-- Schema notes:
--   - NO metadata JSONB column -> check created_by TEXT column instead
--   - Has plan_key VARCHAR (human-readable key)
--   - created_by stores the pipeline name (e.g., 'vision-to-architecture')

CREATE OR REPLACE FUNCTION check_arch_creation_source()
RETURNS TRIGGER AS $$
DECLARE
  v_created_by TEXT;
  v_valid_sources TEXT[] := ARRAY[
    'brainstorm-to-vision',
    'vision-to-architecture',
    'ADMIN_OVERRIDE'
  ];
  v_entity_id TEXT;
  v_audit_log_exists BOOLEAN;
BEGIN
  -- Extract created_by (the provenance indicator for this table)
  v_created_by := COALESCE(NEW.created_by, 'MISSING');
  v_entity_id := COALESCE(NEW.plan_key, NEW.id::text, 'UNKNOWN');

  -- Only fire advisory logic if source is missing or not in valid list
  IF v_created_by = 'MISSING' OR NOT (v_created_by = ANY(v_valid_sources)) THEN

    -- Check if audit_log table exists (defensive: avoid breaking if table is dropped)
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'audit_log'
    ) INTO v_audit_log_exists;

    IF v_audit_log_exists THEN
      -- Log advisory warning to audit_log
      INSERT INTO audit_log (
        event_type,
        entity_type,
        entity_id,
        new_value,
        metadata,
        severity,
        created_by
      ) VALUES (
        'arch_creation_source_missing',
        'architecture_plan',
        v_entity_id,
        jsonb_build_object(
          'plan_key', COALESCE(NEW.plan_key, 'UNKNOWN'),
          'created_by', v_created_by,
          'vision_id', COALESCE(NEW.vision_id::text, 'UNKNOWN'),
          'status', COALESCE(NEW.status, 'UNKNOWN')
        ),
        jsonb_build_object(
          'nc_code', 'NC-002',
          'description', 'Architecture plan created without valid provenance. Expected creation via vision-to-architecture or other approved pipeline.',
          'valid_sources', to_jsonb(v_valid_sources),
          'detected_source', v_created_by,
          'trigger', 'trg_arch_creation_source_advisory'
        ),
        'warning',
        'trg_arch_creation_source_advisory'
      );
    ELSE
      -- Fallback: use RAISE NOTICE if audit_log does not exist
      RAISE NOTICE '[NC-002 ADVISORY] Architecture plan "%" created with unrecognized source: "%". Expected one of: brainstorm-to-vision, vision-to-architecture, ADMIN_OVERRIDE',
        v_entity_id, v_created_by;
    END IF;

  END IF;

  -- ALWAYS return NEW: this trigger must NEVER block an insert
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_arch_creation_source() IS
  'Advisory trigger function for NC-002: logs warning when architecture plan is created without valid provenance (created_by). Never blocks inserts.';

DROP TRIGGER IF EXISTS trg_arch_creation_source_advisory ON eva_architecture_plans;

CREATE TRIGGER trg_arch_creation_source_advisory
  AFTER INSERT ON eva_architecture_plans
  FOR EACH ROW
  EXECUTE FUNCTION check_arch_creation_source();

COMMENT ON TRIGGER trg_arch_creation_source_advisory ON eva_architecture_plans IS
  'NC-002 Advisory: Logs warning to audit_log when architecture plan is created without valid created_by provenance. Does NOT block inserts.';
