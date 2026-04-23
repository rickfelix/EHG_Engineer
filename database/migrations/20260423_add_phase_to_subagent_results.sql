-- ============================================================================
-- Migration: SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-C
--   Phase 3: promote `phase` from metadata JSONB to a first-class TEXT column
--   on sub_agent_execution_results.
-- ============================================================================
-- Parent orchestrator : SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001
-- PRD                 : PRD-SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-C
-- Related arch        : ARCH-LEO-INFRA-PROTOCOL-HARDENING-001 (phase_telemetry)
-- Canonical template  : database/migrations/20251128_sd_deliverables_v2_phase1.sql
-- Date                : 2026-04-23
-- ============================================================================
--
-- CHANGES (additive, idempotent):
--   1. Add `phase TEXT` column (nullable, no default).
--   2. Backfill from metadata->>'phase' where set and column is null.
--   3. Create composite index (sd_id, phase, sub_agent_code) for future gate
--      lookups filtering by phase.
--
-- DEPRECATION NOTE:
--   metadata.phase is retained during a one-release burn-in window for
--   rollback safety (dual-write). Canonical writer `lib/sub-agent-executor/
--   results-storage.js` and 5 top-volume direct writers write BOTH the
--   native column and metadata.phase this SD. The remaining ~41 direct
--   writers continue writing metadata.phase only; they are tracked by a
--   follow-up SD (see SD metadata.deferred_followup).
--
--   Reader side: there are currently ZERO gate validators probing
--   metadata->>'phase' (confirmed via grep 2026-04-23), so no reader
--   migration is part of this SD. A separate SD will update readers once
--   writer coverage expands.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: Add phase TEXT column (FR-1)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sub_agent_execution_results'
      AND column_name = 'phase'
  ) THEN
    ALTER TABLE sub_agent_execution_results
      ADD COLUMN phase TEXT;

    RAISE NOTICE 'Added phase column to sub_agent_execution_results';
  ELSE
    RAISE NOTICE 'phase column already exists on sub_agent_execution_results - skipping';
  END IF;
END $$;

COMMENT ON COLUMN sub_agent_execution_results.phase IS
  'First-class handoff phase (e.g., LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL). '
  'Promoted from metadata->>''phase'' by SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-C. '
  'During burn-in, writers dual-write to this column AND metadata.phase; readers may consult either.';

-- ----------------------------------------------------------------------------
-- SECTION 2: Backfill from metadata->>'phase' (FR-1 AC-2)
-- ----------------------------------------------------------------------------
--   Scoped to rows where the metadata JSON actually contains a phase value
--   AND the native column is still NULL. Skips unrelated rows.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  backfill_count INTEGER := 0;
  remaining INTEGER := 0;
BEGIN
  UPDATE sub_agent_execution_results
     SET phase = metadata->>'phase'
   WHERE phase IS NULL
     AND metadata IS NOT NULL
     AND metadata->>'phase' IS NOT NULL
     AND metadata->>'phase' <> '';

  GET DIAGNOSTICS backfill_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled phase column for % rows from metadata', backfill_count;

  SELECT COUNT(*) INTO remaining
    FROM sub_agent_execution_results
   WHERE phase IS NULL
     AND metadata->>'phase' IS NOT NULL;

  IF remaining > 0 THEN
    RAISE WARNING 'Backfill left % rows with metadata.phase set but native column null. '
                  'Investigate before relying on the native column as the source of truth.',
                  remaining;
  ELSE
    RAISE NOTICE 'Backfill coverage verified: 0 rows have metadata.phase set and native column null.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 3: Composite index (sd_id, phase, sub_agent_code) (FR-2)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sub_agent_results_sd_phase_agent
  ON sub_agent_execution_results (sd_id, phase, sub_agent_code);

COMMENT ON INDEX idx_sub_agent_results_sd_phase_agent IS
  'Composite index for gate lookups filtering by (sd_id, phase, sub_agent_code). '
  'Added by SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-C.';
