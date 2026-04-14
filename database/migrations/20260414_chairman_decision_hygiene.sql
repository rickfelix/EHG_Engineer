-- SD-FIX-STAGE-TIMING-ZEROS-ORCH-001-B
-- Chairman decision hygiene: soft-delete, NOT NULL decision_type,
-- and mark spurious decisions from non-gate/non-review stages.
--
-- Gate stages: 3, 5, 10, 13, 17 (BLOCKING gates)
-- Review stages: 7, 8, 9, 11 (REVIEW_MODE_STAGES)
-- Promotion gates: 18, 19, 20, 21, 22, 23 (PROMOTION_GATE_STAGES)
-- Advisory stages: any (but should have decision_type = 'advisory')
-- Legitimate non-null types: stage_gate, review, promotion_gate, advisory,
--   gate_failure_escalation, stage_failure_review, budget_override
--
-- This migration is idempotent: safe to run multiple times.

-- Step 1: Add deleted_at column for soft-delete (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chairman_decisions'
      AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE chairman_decisions ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_chairman_decisions_deleted_at
      ON chairman_decisions (deleted_at) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- Step 2: Backfill any remaining NULL decision_type values
-- (the 20260411 migration did this but new NULLs appeared)
UPDATE chairman_decisions
SET decision_type = 'stage_gate'
WHERE decision_type IS NULL;

-- Step 3: Soft-delete spurious decisions from non-gate, non-review stages
-- that have generic 'stage_gate' type but shouldn't exist at all.
-- Legitimate gate stages: 3, 5, 10, 13, 17, 18, 19, 20, 21, 22, 23
-- Legitimate review stages: 7, 8, 9, 11
-- Everything else with 'stage_gate' type is spurious.
UPDATE chairman_decisions
SET deleted_at = NOW()
WHERE decision_type = 'stage_gate'
  AND lifecycle_stage NOT IN (3, 5, 7, 8, 9, 10, 11, 13, 17, 18, 19, 20, 21, 22, 23)
  AND deleted_at IS NULL;

-- Step 4: Add NOT NULL constraint on decision_type
-- (after backfill ensures no NULLs remain)
DO $$
BEGIN
  -- Check if column already has NOT NULL constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chairman_decisions'
      AND column_name = 'decision_type'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE chairman_decisions ALTER COLUMN decision_type SET NOT NULL;
  END IF;
END $$;

-- Step 5: Update v_chairman_pending_decisions view to exclude soft-deleted
CREATE OR REPLACE VIEW v_chairman_pending_decisions AS
SELECT
  cd.id,
  cd.venture_id,
  v.name AS venture_name,
  cd.lifecycle_stage,
  lsc.stage_name,
  cd.health_score,
  cd.recommendation,
  cd.decision,
  cd.status,
  cd.summary,
  cd.brief_data,
  cd.override_reason,
  cd.risks_acknowledged,
  cd.quick_fixes_applied,
  cd.created_at,
  cd.updated_at,
  cd.decided_by,
  cd.rationale,
  CASE
    WHEN v.updated_at > cd.created_at THEN true
    ELSE false
  END AS is_stale_context,
  v.updated_at AS venture_updated_at
FROM chairman_decisions cd
JOIN ventures v ON v.id = cd.venture_id
LEFT JOIN lifecycle_stage_config lsc ON lsc.stage_number = cd.lifecycle_stage
WHERE cd.deleted_at IS NULL  -- SD-FIX-STAGE-TIMING-ZEROS-ORCH-001-B: exclude soft-deleted
ORDER BY
  cd.created_at DESC;
