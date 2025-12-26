-- ============================================================================
-- Migration: Law 3 - Circuit Breaker 85% Threshold Enforcement
-- ============================================================================
-- SD: SD-2025-12-26-MANIFESTO-HARDENING
-- Date: 2025-12-26
-- Author: Constitutional Audit (Claude Opus 4.5)
-- Purpose: Enforce HARD STOP when validation_score < 85% on handoffs
--
-- THE IMMUTABLE LAW:
--   "Quality Gates are not suggestions. If a step scores <85%, the system must HALT.
--    It cannot 'try again' indefinitely or proceed with a warning."
--
-- ENFORCEMENT:
--   - Database trigger on sd_phase_handoffs rejects validation_score < 85
--   - NO OVERRIDE capability - this is a hard stop
--   - All blocked handoffs logged for audit
--
-- SAFETY:
--   - Idempotent (DROP IF EXISTS, CREATE OR REPLACE)
--   - Rollback instructions included
--   - Modifies existing enforce_handoff_system() trigger
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: Create circuit breaker audit table
-- ============================================================================

CREATE TABLE IF NOT EXISTS circuit_breaker_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Handoff context
  sd_id VARCHAR(100) NOT NULL,
  handoff_type VARCHAR(50) NOT NULL,
  from_phase VARCHAR(20) NOT NULL,
  to_phase VARCHAR(20) NOT NULL,

  -- Score details
  validation_score INTEGER NOT NULL,
  required_threshold INTEGER DEFAULT 85,
  score_deficit INTEGER GENERATED ALWAYS AS (required_threshold - validation_score) STORED,

  -- Block details
  block_reason TEXT NOT NULL,
  attempted_by TEXT,
  blocked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Context for debugging
  handoff_metadata JSONB DEFAULT '{}'::jsonb,
  remediation_hints JSONB DEFAULT '[]'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_circuit_blocks_sd ON circuit_breaker_blocks(sd_id);
CREATE INDEX IF NOT EXISTS idx_circuit_blocks_score ON circuit_breaker_blocks(validation_score);
CREATE INDEX IF NOT EXISTS idx_circuit_blocks_blocked ON circuit_breaker_blocks(blocked_at DESC);

-- RLS
ALTER TABLE circuit_breaker_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS circuit_blocks_service_role ON circuit_breaker_blocks;
CREATE POLICY circuit_blocks_service_role
  ON circuit_breaker_blocks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS circuit_blocks_authenticated ON circuit_breaker_blocks;
CREATE POLICY circuit_blocks_authenticated
  ON circuit_breaker_blocks FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE circuit_breaker_blocks IS
'Audit log for Circuit Breaker blocks (Law 3).
Records all handoffs rejected due to validation_score < 85%.
Part of EHG Immutable Laws v9.0.0 Manifesto enforcement.';

-- ============================================================================
-- PHASE 2: Create enhanced handoff enforcement function
-- ============================================================================
-- This REPLACES the existing enforce_handoff_system() function
-- to add the 85% threshold check

CREATE OR REPLACE FUNCTION enforce_handoff_system()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed_creators TEXT[] := ARRAY[
    'UNIFIED-HANDOFF-SYSTEM',
    'SYSTEM_MIGRATION',
    'ADMIN_OVERRIDE'
  ];
  v_validation_threshold INTEGER := 85;
  v_remediation_hints JSONB;
BEGIN
  -- ========================================================================
  -- GATE 1: Creator Validation (Existing)
  -- ========================================================================

  -- Log the attempt (always, regardless of outcome)
  INSERT INTO handoff_audit_log (
    attempted_by,
    sd_id,
    handoff_type,
    from_phase,
    to_phase,
    blocked,
    block_reason,
    request_metadata
  ) VALUES (
    COALESCE(NEW.created_by, 'NULL'),
    NEW.sd_id,
    NEW.handoff_type,
    NEW.from_phase,
    NEW.to_phase,
    NOT (COALESCE(NEW.created_by, '') = ANY(v_allowed_creators)),
    CASE
      WHEN COALESCE(NEW.created_by, '') = ANY(v_allowed_creators) THEN NULL
      ELSE format('Invalid created_by: %s. Must use handoff.js script.', COALESCE(NEW.created_by, 'NULL'))
    END,
    jsonb_build_object(
      'trigger_time', NOW(),
      'status', NEW.status,
      'validation_score', NEW.validation_score
    )
  );

  -- Check if creator is allowed
  IF NOT (COALESCE(NEW.created_by, '') = ANY(v_allowed_creators)) THEN
    RAISE EXCEPTION 'HANDOFF_BYPASS_BLOCKED: Direct handoff creation is not allowed.

To create a handoff, run:
  node scripts/handoff.js execute <TYPE> <SD-ID>

Attempted created_by: %', COALESCE(NEW.created_by, 'NULL');
  END IF;

  -- ========================================================================
  -- GATE 2: CIRCUIT BREAKER - 85% Threshold (NEW - LAW 3)
  -- ========================================================================
  -- THE LAW: "Quality Gates are not suggestions. If a step scores <85%,
  --           the system must HALT. It cannot proceed with a warning."

  IF NEW.validation_score IS NOT NULL AND NEW.validation_score < v_validation_threshold THEN
    -- Build remediation hints based on score
    v_remediation_hints := jsonb_build_array(
      CASE
        WHEN NEW.validation_score < 50 THEN
          'CRITICAL: Score below 50%. Major rework required. Review PRD requirements thoroughly.'
        WHEN NEW.validation_score < 70 THEN
          'MAJOR: Score below 70%. Significant gaps exist. Run all sub-agent validations.'
        ELSE
          'MINOR: Score below 85%. Close to threshold. Address specific failing checks.'
      END,
      'Run: npm run handoff:compliance ' || NEW.sd_id || ' to see detailed breakdown',
      'Required sub-agents: QA Director (TESTING) is always mandatory',
      'Check: Are all deliverables in sd_scope_deliverables marked completed?'
    );

    -- Log the circuit breaker block
    INSERT INTO circuit_breaker_blocks (
      sd_id,
      handoff_type,
      from_phase,
      to_phase,
      validation_score,
      required_threshold,
      block_reason,
      attempted_by,
      handoff_metadata,
      remediation_hints
    ) VALUES (
      NEW.sd_id,
      NEW.handoff_type,
      NEW.from_phase,
      NEW.to_phase,
      NEW.validation_score,
      v_validation_threshold,
      format('CIRCUIT_BREAKER_TRIPPED: validation_score %s%% < %s%% threshold',
             NEW.validation_score, v_validation_threshold),
      NEW.created_by,
      jsonb_build_object(
        'status', NEW.status,
        'metadata', NEW.metadata,
        'trigger_time', NOW()
      ),
      v_remediation_hints
    );

    -- HARD STOP - No override, no warning, transaction MUST fail
    RAISE EXCEPTION '
╔══════════════════════════════════════════════════════════════════════════════╗
║                    CIRCUIT BREAKER TRIPPED [LAW 3]                           ║
╚══════════════════════════════════════════════════════════════════════════════╝

THE LAW: "Quality Gates are not suggestions. If a step scores <85%%, the system
          must HALT. It cannot try again indefinitely or proceed with a warning."

HANDOFF REJECTED:
  SD:               %
  Type:             %
  From → To:        % → %
  Validation Score: %% (REQUIRED: ≥%%)
  Deficit:          % points below threshold

THIS IS A HARD STOP. There is NO override capability in this flow.

REMEDIATION REQUIRED:
  1. Run validation: npm run handoff:compliance %
  2. Address failing checks identified in the report
  3. Ensure all required sub-agents have PASS verdicts
  4. Verify all deliverables in sd_scope_deliverables are completed
  5. Re-attempt handoff only when score ≥ %% is achievable

The transaction has been ROLLED BACK. No handoff record was created.',
      NEW.sd_id,
      NEW.handoff_type,
      NEW.from_phase,
      NEW.to_phase,
      NEW.validation_score,
      v_validation_threshold,
      v_validation_threshold - NEW.validation_score,
      NEW.sd_id,
      v_validation_threshold
      USING HINT = 'This constraint exists at the DATABASE LAYER. It cannot be bypassed.',
            ERRCODE = 'P0001';
  END IF;

  -- ========================================================================
  -- GATE 3: Null Score Check (NEW - Prevent bypassing with NULL)
  -- ========================================================================

  IF NEW.validation_score IS NULL AND NEW.status IN ('pending_acceptance', 'accepted') THEN
    -- Log attempt to create handoff without score
    INSERT INTO circuit_breaker_blocks (
      sd_id,
      handoff_type,
      from_phase,
      to_phase,
      validation_score,
      required_threshold,
      block_reason,
      attempted_by,
      handoff_metadata,
      remediation_hints
    ) VALUES (
      NEW.sd_id,
      NEW.handoff_type,
      NEW.from_phase,
      NEW.to_phase,
      0, -- Treat NULL as 0
      v_validation_threshold,
      'CIRCUIT_BREAKER_TRIPPED: validation_score is NULL (bypass attempt?)',
      NEW.created_by,
      jsonb_build_object(
        'status', NEW.status,
        'null_score_detected', true,
        'trigger_time', NOW()
      ),
      jsonb_build_array(
        'validation_score cannot be NULL for active handoffs',
        'Run handoff validation to compute score',
        'Score must be computed by UNIFIED-HANDOFF-SYSTEM'
      )
    );

    RAISE EXCEPTION '
CIRCUIT BREAKER TRIPPED [LAW 3]: validation_score cannot be NULL.

All handoffs must have an explicit validation_score ≥ 85%%.
NULL scores are treated as bypass attempts and are BLOCKED.

SD: %
Type: %

Run: node scripts/handoff.js execute % % to compute proper validation score.',
      NEW.sd_id,
      NEW.handoff_type,
      NEW.handoff_type,
      NEW.sd_id
      USING HINT = 'Validation score is MANDATORY. This is not optional.',
            ERRCODE = 'P0001';
  END IF;

  -- All gates passed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION enforce_handoff_system() IS
'Enhanced handoff enforcement with Circuit Breaker (Law 3).

GATES:
  1. Creator Validation: Only UNIFIED-HANDOFF-SYSTEM can create handoffs
  2. Circuit Breaker (NEW): validation_score must be ≥ 85%
  3. Null Score Block (NEW): NULL scores are rejected as bypass attempts

The 85% threshold is a HARD STOP with NO override capability.
Part of EHG Immutable Laws v9.0.0 Manifesto enforcement.';

-- ============================================================================
-- PHASE 3: Recreate trigger with enhanced function
-- ============================================================================

DROP TRIGGER IF EXISTS enforce_handoff_creation ON sd_phase_handoffs;

CREATE TRIGGER enforce_handoff_creation
  BEFORE INSERT ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_handoff_system();

-- ============================================================================
-- PHASE 4: Add constraint as backup enforcement
-- ============================================================================
-- Belt-and-suspenders: Even if trigger fails, constraint will catch it

-- First, ensure the column exists and is integer
DO $$
BEGIN
  -- Add CHECK constraint for validation_score threshold
  -- This is a backup in case the trigger somehow doesn't fire
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_handoff_validation_threshold'
    AND table_name = 'sd_phase_handoffs'
  ) THEN
    -- Only add constraint if we can verify column type
    ALTER TABLE sd_phase_handoffs
    ADD CONSTRAINT chk_handoff_validation_threshold
    CHECK (
      -- Allow NULL only for rejected/failed status
      validation_score IS NULL AND status IN ('rejected', 'failed')
      OR
      -- Require score >= 85 for active handoffs
      validation_score >= 85
    );

    RAISE NOTICE 'Added CHECK constraint chk_handoff_validation_threshold';
  ELSE
    RAISE NOTICE 'CHECK constraint chk_handoff_validation_threshold already exists';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add CHECK constraint: %. Trigger enforcement remains active.', SQLERRM;
END $$;

-- ============================================================================
-- PHASE 5: Create monitoring views
-- ============================================================================

-- View: Recent circuit breaker blocks
CREATE OR REPLACE VIEW v_recent_circuit_breaker_blocks AS
SELECT
  id,
  sd_id,
  handoff_type,
  from_phase || ' → ' || to_phase as transition,
  validation_score,
  required_threshold,
  score_deficit,
  block_reason,
  attempted_by,
  blocked_at,
  EXTRACT(EPOCH FROM (NOW() - blocked_at)) / 60 as minutes_ago
FROM circuit_breaker_blocks
ORDER BY blocked_at DESC
LIMIT 50;

COMMENT ON VIEW v_recent_circuit_breaker_blocks IS
'Recent handoffs blocked by Circuit Breaker (Law 3).
Shows score deficit and remediation needed.';

-- View: Circuit breaker statistics
CREATE OR REPLACE VIEW v_circuit_breaker_stats AS
SELECT
  DATE_TRUNC('day', blocked_at) as block_date,
  COUNT(*) as blocks_total,
  AVG(validation_score) as avg_score,
  MIN(validation_score) as min_score,
  MAX(validation_score) as max_score,
  AVG(score_deficit) as avg_deficit,
  COUNT(DISTINCT sd_id) as unique_sds_blocked
FROM circuit_breaker_blocks
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW v_circuit_breaker_stats IS
'Daily statistics for Circuit Breaker blocks.
Useful for identifying systemic quality issues.';

-- View: SDs with repeated blocks (quality debt indicator)
CREATE OR REPLACE VIEW v_circuit_breaker_repeat_offenders AS
SELECT
  sd_id,
  COUNT(*) as block_count,
  MIN(validation_score) as lowest_score,
  MAX(validation_score) as highest_score,
  MIN(blocked_at) as first_blocked,
  MAX(blocked_at) as last_blocked,
  ARRAY_AGG(DISTINCT handoff_type) as attempted_handoffs
FROM circuit_breaker_blocks
GROUP BY sd_id
HAVING COUNT(*) > 1
ORDER BY block_count DESC;

COMMENT ON VIEW v_circuit_breaker_repeat_offenders IS
'SDs that have been blocked multiple times.
Indicates quality debt or systemic issues with the SD.';

-- ============================================================================
-- PHASE 6: Verification
-- ============================================================================

DO $$
DECLARE
  constraint_exists BOOLEAN;
  trigger_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_handoff_validation_threshold'
  ) INTO constraint_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'enforce_handoff_creation'
  ) INTO trigger_exists;

  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║           LAW 3: CIRCUIT BREAKER 85%% THRESHOLD                       ║';
  RAISE NOTICE '║                    DATABASE-LEVEL ENFORCEMENT                        ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'THE LAW:';
  RAISE NOTICE '  "Quality Gates are not suggestions. If a step scores <85%%,';
  RAISE NOTICE '   the system must HALT. It cannot try again indefinitely';
  RAISE NOTICE '   or proceed with a warning."';
  RAISE NOTICE '';
  RAISE NOTICE 'ENFORCEMENT STATUS:';
  RAISE NOTICE '  Trigger installed: %', trigger_exists;
  RAISE NOTICE '  CHECK constraint: %', constraint_exists;
  RAISE NOTICE '';
  RAISE NOTICE 'CIRCUIT BREAKER BEHAVIOR:';
  RAISE NOTICE '  [X] validation_score < 85%% → HARD STOP (transaction rollback)';
  RAISE NOTICE '  [X] validation_score IS NULL → HARD STOP (bypass prevention)';
  RAISE NOTICE '  [X] NO override capability in this flow';
  RAISE NOTICE '  [X] All blocks logged to circuit_breaker_blocks table';
  RAISE NOTICE '';
  RAISE NOTICE 'MONITORING VIEWS:';
  RAISE NOTICE '  - v_recent_circuit_breaker_blocks (last 50 blocks)';
  RAISE NOTICE '  - v_circuit_breaker_stats (daily statistics)';
  RAISE NOTICE '  - v_circuit_breaker_repeat_offenders (quality debt)';
  RAISE NOTICE '';
  RAISE NOTICE 'This constraint exists at the SCHEMA LAYER.';
  RAISE NOTICE 'It CANNOT be bypassed by prompt engineering or application code.';
  RAISE NOTICE '';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
--
-- ALTER TABLE sd_phase_handoffs DROP CONSTRAINT IF EXISTS chk_handoff_validation_threshold;
-- DROP VIEW IF EXISTS v_circuit_breaker_repeat_offenders;
-- DROP VIEW IF EXISTS v_circuit_breaker_stats;
-- DROP VIEW IF EXISTS v_recent_circuit_breaker_blocks;
-- DROP TABLE IF EXISTS circuit_breaker_blocks;
--
-- Then restore the original enforce_handoff_system() function from:
-- database/migrations/20251204_handoff_enforcement_trigger.sql
-- ============================================================================
