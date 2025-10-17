-- Migration: Add missing columns to leo_handoff_executions table
-- Purpose: Support unified handoff system workflow tracking
-- Date: 2025-10-16
-- Related: scripts/unified-handoff-system.js

-- Add timestamp for when handoff execution was initiated
-- Used for ordering executions chronologically (line 806 in unified-handoff-system.js)
ALTER TABLE leo_handoff_executions
ADD COLUMN IF NOT EXISTS initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add timestamp for when handoff execution completed
-- Used for tracking completion time (line 701 in unified-handoff-system.js)
ALTER TABLE leo_handoff_executions
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Add boolean flag for validation pass/fail status
-- Used for tracking validation results (line 694 in unified-handoff-system.js)
ALTER TABLE leo_handoff_executions
ADD COLUMN IF NOT EXISTS validation_passed BOOLEAN;

-- Add JSONB field for detailed validation information
-- Stores structured validation results (line 695 in unified-handoff-system.js)
ALTER TABLE leo_handoff_executions
ADD COLUMN IF NOT EXISTS validation_details JSONB;

-- Add reference to handoff template ID
-- Links execution to template for audit trail (line 685 in unified-handoff-system.js)
-- NOTE: leo_handoff_templates.id is INTEGER, not UUID
ALTER TABLE leo_handoff_executions
ADD COLUMN IF NOT EXISTS template_id INTEGER;

-- Add reference to PRD ID for PLAN-to-EXEC handoffs
-- Links execution to specific PRD (line 689 in unified-handoff-system.js)
ALTER TABLE leo_handoff_executions
ADD COLUMN IF NOT EXISTS prd_id TEXT;

-- Add foreign key constraint for template_id
-- Ensures referential integrity with leo_handoff_templates table
ALTER TABLE leo_handoff_executions
ADD CONSTRAINT fk_handoff_template
FOREIGN KEY (template_id)
REFERENCES leo_handoff_templates(id)
ON DELETE SET NULL;

-- Add index on initiated_at for ordering queries
-- Improves performance for dashboard queries (line 806)
CREATE INDEX IF NOT EXISTS idx_handoff_executions_initiated_at
ON leo_handoff_executions(initiated_at DESC);

-- Add index on sd_id for filtering by Strategic Directive
-- Improves performance for SD-specific queries
CREATE INDEX IF NOT EXISTS idx_handoff_executions_sd_id
ON leo_handoff_executions(sd_id);

-- Add index on template_id for analytics
-- Enables efficient template-based reporting
CREATE INDEX IF NOT EXISTS idx_handoff_executions_template_id
ON leo_handoff_executions(template_id);

-- Add comment to document the table purpose
COMMENT ON TABLE leo_handoff_executions IS 'Tracks all LEO Protocol handoff executions with full audit trail. Used by unified-handoff-system.js for workflow orchestration.';

-- Add comments to new columns
COMMENT ON COLUMN leo_handoff_executions.initiated_at IS 'Timestamp when handoff execution was initiated (default: NOW())';
COMMENT ON COLUMN leo_handoff_executions.completed_at IS 'Timestamp when handoff execution completed (success, failure, or rejection)';
COMMENT ON COLUMN leo_handoff_executions.validation_passed IS 'Boolean flag indicating if validation passed (true) or failed (false)';
COMMENT ON COLUMN leo_handoff_executions.validation_details IS 'JSONB field storing structured validation results and verification data';
COMMENT ON COLUMN leo_handoff_executions.template_id IS 'Foreign key to leo_handoff_templates table (INTEGER) for audit trail';
COMMENT ON COLUMN leo_handoff_executions.prd_id IS 'Reference to PRD ID for PLAN-to-EXEC handoffs';

-- Backfill initiated_at for existing records (use created_at as fallback)
UPDATE leo_handoff_executions
SET initiated_at = created_at
WHERE initiated_at IS NULL AND created_at IS NOT NULL;

-- Backfill completed_at for existing records (use accepted_at as fallback)
UPDATE leo_handoff_executions
SET completed_at = accepted_at
WHERE completed_at IS NULL AND accepted_at IS NOT NULL;

-- Backfill validation_passed for existing records (infer from status)
UPDATE leo_handoff_executions
SET validation_passed = (status = 'accepted')
WHERE validation_passed IS NULL;
