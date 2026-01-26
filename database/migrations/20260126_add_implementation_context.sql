-- Migration: Add implementation_context to strategic_directives_v2
-- SD: SD-LEO-INFRA-PRD-GROUNDING-VALIDATION-001
-- User Story: US-001 - SD Creator specifies implementation context
-- Date: 2026-01-26
-- Purpose: Allow SDs to specify target platform (cli/web/api/database) to prevent LLM hallucination

-- Add implementation_context column with default 'web' for backward compatibility
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS implementation_context TEXT DEFAULT 'web';

-- Add check constraint for valid values
DO $$
BEGIN
  -- Drop existing constraint if any
  ALTER TABLE strategic_directives_v2
  DROP CONSTRAINT IF EXISTS valid_implementation_context;

  -- Add new constraint
  ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT valid_implementation_context
  CHECK (implementation_context IN ('cli', 'web', 'api', 'database', 'infrastructure', 'hybrid'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Constraint already exists
END $$;

-- Add comment explaining the field
COMMENT ON COLUMN strategic_directives_v2.implementation_context IS
'Target platform context for PRD generation. Valid values: cli, web, api, database, infrastructure, hybrid. Used to prevent LLM hallucination of irrelevant requirements (e.g., WCAG for CLI tools). Default: web.';

-- Update existing infrastructure SDs to have correct context
UPDATE strategic_directives_v2
SET implementation_context = 'infrastructure'
WHERE sd_type = 'infrastructure'
  AND (implementation_context IS NULL OR implementation_context = 'web');

-- Update existing database SDs
UPDATE strategic_directives_v2
SET implementation_context = 'database'
WHERE sd_type = 'database'
  AND (implementation_context IS NULL OR implementation_context = 'web');

-- Log migration
INSERT INTO audit_log (event_type, entity_type, entity_id, old_value, new_value, details, created_at)
VALUES (
  'MIGRATION_APPLIED',
  'schema',
  'strategic_directives_v2.implementation_context',
  NULL,
  'column_added',
  jsonb_build_object(
    'migration', '20260126_add_implementation_context.sql',
    'sd_key', 'SD-LEO-INFRA-PRD-GROUNDING-VALIDATION-001',
    'changes', ARRAY['Added implementation_context column', 'Added CHECK constraint', 'Updated existing infrastructure/database SDs']
  ),
  NOW()
);

SELECT 'Migration complete: implementation_context column added to strategic_directives_v2' AS result;
