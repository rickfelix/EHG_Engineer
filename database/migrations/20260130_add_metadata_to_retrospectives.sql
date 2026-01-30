-- Migration: Add metadata column to retrospectives table
-- Issue: BL-INF-2337C - retrospectives table missing metadata column in schema cache
-- RCA: retrospectives lacks metadata JSONB column unlike other core tables
--      (strategic_directives_v2, execution_sequences_v2, hap_blocks_v2 all have it)
-- Solution: Add metadata column for consistency and flexibility

-- Step 1: Add metadata column if not exists
ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Step 2: Add index for JSON querying efficiency
CREATE INDEX IF NOT EXISTS idx_retrospectives_metadata
ON retrospectives USING GIN (metadata);

-- Step 3: Add comment documenting the column
COMMENT ON COLUMN retrospectives.metadata IS
'Flexible JSONB storage for retrospective metadata. Added 2026-01-30 per RCA BL-INF-2337C for consistency with other core tables.';

-- Verification query (run after migration to confirm)
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'retrospectives' AND column_name = 'metadata';
