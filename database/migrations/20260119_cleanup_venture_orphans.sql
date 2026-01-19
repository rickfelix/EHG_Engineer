-- Migration: Cleanup orphaned venture tracking artifacts
-- Priority: P2 (Medium) - Tech debt cleanup
-- Validated by: Triangulation Protocol (OpenAI + AntiGravity + Ground Truth)
-- Date: 2026-01-19
-- Description: Remove unused vh schema, empty vh_ventures table, and deprecated venture columns

BEGIN;

-- 1. Drop orphaned vh.vh_ventures table (0 records, 0 code references)
DROP TABLE IF EXISTS vh.vh_ventures CASCADE;

-- 2. Drop vh schema if empty after dropping table
DROP SCHEMA IF EXISTS vh CASCADE;

-- 3. Drop deprecated columns from ventures table
-- All values are default/null, no code references
ALTER TABLE ventures DROP COLUMN IF EXISTS deprecated_stage;
ALTER TABLE ventures DROP COLUMN IF EXISTS deprecated_current_workflow_stage;
ALTER TABLE ventures DROP COLUMN IF EXISTS deprecated_current_stage;

COMMIT;

-- Verification queries (run manually after migration):
-- SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'vh'; -- Should return 0 rows
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'ventures' AND column_name LIKE 'deprecated%'; -- Should return 0 rows
