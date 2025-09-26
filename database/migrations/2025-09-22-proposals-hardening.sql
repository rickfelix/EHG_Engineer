-- Hardening constraints and indexes for eng_sequence_proposals
-- Date: 2025-09-22
-- Purpose: Add constraints, indexes, and triggers for data integrity
-- Risk: LOW - Additive only, no breaking changes

\set ON_ERROR_STOP on
\timing on

BEGIN;

-- 1. Add missing columns if not present
ALTER TABLE eng_sequence_proposals
  ADD COLUMN IF NOT EXISTS source_run_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Add check constraint for status enum (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'eng_sequence_proposals'
    AND constraint_name = 'eng_seq_status_chk'
  ) THEN
    ALTER TABLE eng_sequence_proposals
    ADD CONSTRAINT eng_seq_status_chk
    CHECK (status IN ('proposed', 'accepted', 'applied', 'rejected', 'stale'));
  END IF;
END $$;

-- 3. Unique constraint: one proposal per SD per run
-- This prevents duplicate proposals in the same ingest run
CREATE UNIQUE INDEX IF NOT EXISTS eng_seq_proposals_uniq
  ON eng_sequence_proposals (
    sd_id,
    COALESCE(source_run_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'proposed';

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS eng_seq_proposals_status_idx
  ON eng_sequence_proposals (status)
  WHERE status IN ('proposed', 'accepted');  -- Partial index for active statuses

CREATE INDEX IF NOT EXISTS eng_seq_proposals_venture_idx
  ON eng_sequence_proposals (venture_id)
  WHERE venture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS eng_seq_proposals_delta_idx
  ON eng_sequence_proposals (ABS(delta))
  WHERE status = 'proposed';

CREATE INDEX IF NOT EXISTS eng_seq_proposals_source_run_idx
  ON eng_sequence_proposals (source_run_id)
  WHERE source_run_id IS NOT NULL;

-- 5. Updated_at trigger function
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 6. Apply trigger
DROP TRIGGER IF EXISTS eng_seq_proposals_touch ON eng_sequence_proposals;
CREATE TRIGGER eng_seq_proposals_touch
  BEFORE UPDATE ON eng_sequence_proposals
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated_at();

-- 7. Add freshness check function (for stale detection)
CREATE OR REPLACE FUNCTION is_proposal_fresh(
  p_sd_id varchar(50),
  p_current_order integer
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM strategic_directives_v2
    WHERE id = p_sd_id
    AND execution_order = p_current_order
  );
$$;

COMMENT ON FUNCTION is_proposal_fresh IS
  'Check if a proposal current_execution_order matches actual SD execution_order (stale protection)';

-- 8. Add audit columns to snapshots table
ALTER TABLE execution_order_snapshots
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS rollback_applied boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rollback_applied_at timestamptz;

-- 9. Create index for fast rollback queries
CREATE INDEX IF NOT EXISTS idx_snapshots_run_type
  ON execution_order_snapshots (snapshot_run_id, snapshot_type);

-- 10. Add constraint to prevent duplicate execution_order within ventures
-- (Only if ventures are used for scoping)
DO $$
BEGIN
  -- Check if strategic_directives_v2 has venture_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategic_directives_v2'
    AND column_name = 'venture_id'
  ) THEN
    -- Create partial unique index for execution_order within venture
    CREATE UNIQUE INDEX IF NOT EXISTS sd_unique_execution_order_per_venture
      ON strategic_directives_v2 (venture_id, execution_order)
      WHERE venture_id IS NOT NULL AND execution_order IS NOT NULL;

    RAISE NOTICE 'Added unique constraint for execution_order within ventures';
  ELSE
    -- Global uniqueness for execution_order
    CREATE UNIQUE INDEX IF NOT EXISTS sd_unique_execution_order_global
      ON strategic_directives_v2 (execution_order)
      WHERE execution_order IS NOT NULL;

    RAISE NOTICE 'Added global unique constraint for execution_order';
  END IF;
END $$;

-- 11. Create stale detection view for monitoring
CREATE OR REPLACE VIEW v_stale_proposals AS
SELECT
  p.id,
  p.sd_id,
  p.current_execution_order AS proposal_current,
  s.execution_order AS actual_current,
  p.proposed_execution_order,
  p.status,
  p.created_at,
  CASE
    WHEN s.execution_order != p.current_execution_order THEN 'stale'
    WHEN s.execution_order IS NULL THEN 'sd_missing'
    ELSE 'fresh'
  END AS freshness
FROM eng_sequence_proposals p
LEFT JOIN strategic_directives_v2 s ON s.id = p.sd_id
WHERE p.status IN ('proposed', 'accepted');

COMMENT ON VIEW v_stale_proposals IS
  'Monitor proposals for staleness - when SD execution_order has changed since proposal creation';

-- 12. Verification
DO $$
DECLARE
  constraint_count integer;
  index_count integer;
BEGIN
  SELECT COUNT(*) INTO constraint_count
  FROM information_schema.table_constraints
  WHERE table_name = 'eng_sequence_proposals'
  AND constraint_type IN ('CHECK', 'UNIQUE');

  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE tablename = 'eng_sequence_proposals';

  RAISE NOTICE '✅ Hardening complete:';
  RAISE NOTICE '   Constraints: %', constraint_count;
  RAISE NOTICE '   Indexes: %', index_count;
  RAISE NOTICE '   Stale detection: v_stale_proposals view created';
  RAISE NOTICE '   Updated_at trigger: active';
END $$;

COMMIT;

-- Migration verification
\echo '✅ Migration 2025-09-22-proposals-hardening.sql completed successfully'
\echo '🔒 Added constraints, indexes, and stale detection for eng_sequence_proposals'
\echo '📊 Monitor stale proposals with: SELECT * FROM v_stale_proposals'