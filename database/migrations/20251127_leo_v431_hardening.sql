-- LEO Protocol v4.3.1 Hardening Migration
-- SD: SD-LEO-4-3-1-HARDENING
-- Purpose: Eliminate version drift and schema-knowledge gaps
-- Target: EHG_Engineer database only
-- Date: 2025-11-27

BEGIN;

-- ============================================================================
-- TABLE 1: leo_schema_constraints
-- Stores all CHECK constraints for LEO tables with agent-readable documentation
-- ============================================================================

CREATE TABLE IF NOT EXISTS leo_schema_constraints (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    constraint_type VARCHAR(50) NOT NULL CHECK (constraint_type IN ('check', 'enum', 'foreign_key', 'not_null', 'unique')),
    constraint_definition TEXT NOT NULL,
    valid_values JSONB, -- For CHECK/enum constraints, list of valid values
    error_pattern TEXT, -- Regex to match error messages for this constraint
    remediation_hint TEXT, -- Agent-readable fix suggestion
    documentation TEXT, -- Human-readable explanation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(table_name, column_name, constraint_type)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_leo_schema_constraints_table ON leo_schema_constraints(table_name);
CREATE INDEX IF NOT EXISTS idx_leo_schema_constraints_type ON leo_schema_constraints(constraint_type);

-- Add comment
COMMENT ON TABLE leo_schema_constraints IS 'Documents all CHECK constraints for LEO tables - used by agents to pre-validate data before insert';

-- ============================================================================
-- TABLE 2: leo_process_scripts
-- Stores documentation for all LEO process scripts
-- ============================================================================

CREATE TABLE IF NOT EXISTS leo_process_scripts (
    id SERIAL PRIMARY KEY,
    script_name VARCHAR(200) NOT NULL UNIQUE,
    script_path VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    usage_pattern TEXT NOT NULL, -- e.g., "node unified-handoff-system.js execute TYPE SD-ID [PRD-ID]"
    argument_format VARCHAR(50) CHECK (argument_format IN ('positional', 'flags', 'mixed', 'none')),
    arguments JSONB NOT NULL DEFAULT '[]', -- Array of {name, type, required, description}
    examples JSONB NOT NULL DEFAULT '[]', -- Array of {command, description}
    common_errors JSONB DEFAULT '[]', -- Array of {error_pattern, cause, fix}
    category VARCHAR(50) CHECK (category IN ('handoff', 'prd', 'generation', 'validation', 'utility', 'migration')),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_leo_process_scripts_category ON leo_process_scripts(category);
CREATE INDEX IF NOT EXISTS idx_leo_process_scripts_active ON leo_process_scripts(active) WHERE active = TRUE;

-- Add comment
COMMENT ON TABLE leo_process_scripts IS 'Documents all LEO process scripts with usage patterns and examples - single source of truth for script documentation';

-- ============================================================================
-- TABLE 3: leo_kb_generation_log
-- Tracks KB file generation for staleness detection
-- ============================================================================

CREATE TABLE IF NOT EXISTS leo_kb_generation_log (
    id SERIAL PRIMARY KEY,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(200) NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    source_tables JSONB NOT NULL, -- Tables queried to generate
    content_hash VARCHAR(64), -- SHA-256 of generated content
    char_count INTEGER,
    generator_script VARCHAR(200),
    protocol_version VARCHAR(50), -- Version at time of generation

    -- Track latest generation per file
    UNIQUE(file_path)
);

-- Add index for staleness queries
CREATE INDEX IF NOT EXISTS idx_leo_kb_generation_log_date ON leo_kb_generation_log(generated_at DESC);

-- Add comment
COMMENT ON TABLE leo_kb_generation_log IS 'Tracks KB file generation timestamps for staleness detection - warn if >30 days old';

-- ============================================================================
-- INITIAL DATA: Schema Constraints (from existing migrations)
-- ============================================================================

INSERT INTO leo_schema_constraints (table_name, column_name, constraint_type, constraint_definition, valid_values, error_pattern, remediation_hint, documentation)
VALUES
-- user_stories constraints
('user_stories', 'e2e_test_status', 'check',
 'CHECK (e2e_test_status IN (''not_created'', ''created'', ''passing'', ''failing'', ''skipped''))',
 '["not_created", "created", "passing", "failing", "skipped"]',
 'violates check constraint.*e2e_test_status',
 'Use one of: not_created, created, passing, failing, skipped',
 'Status of E2E test for user story. Use "not_created" for new stories, "passing" when E2E test passes.'),

('user_stories', 'validation_status', 'check',
 'CHECK (validation_status IN (''pending'', ''in_progress'', ''validated'', ''failed'', ''skipped''))',
 '["pending", "in_progress", "validated", "failed", "skipped"]',
 'violates check constraint.*validation_status',
 'Use one of: pending, in_progress, validated, failed, skipped',
 'Overall validation status of user story. Auto-set to "validated" when E2E test passes.'),

('user_stories', 'status', 'check',
 'CHECK (status IN (''draft'', ''completed'', ''in_progress'', ''ready''))',
 '["draft", "completed", "in_progress", "ready"]',
 'violates check constraint.*status',
 'Use one of: draft, completed, in_progress, ready. NOT "approved" - that is not a valid value.',
 'User story workflow status. Stories start as "draft", move to "in_progress" during EXEC, then "completed".'),

-- sd_backlog_map constraints
('sd_backlog_map', 'item_type', 'check',
 'CHECK (item_type IN (''epic'', ''story'', ''task''))',
 '["epic", "story", "task"]',
 'violates check constraint.*item_type',
 'Use one of: epic, story, task',
 'Backlog item hierarchy type. Epics contain stories, stories contain tasks.'),

('sd_backlog_map', 'verification_status', 'check',
 'CHECK (verification_status IN (''not_run'', ''failing'', ''passing''))',
 '["not_run", "failing", "passing"]',
 'violates check constraint.*verification_status',
 'Use one of: not_run, failing, passing',
 'Test verification status for backlog item.'),

-- leo_protocols constraints
('leo_protocols', 'status', 'check',
 'CHECK (status IN (''active'', ''superseded'', ''draft'', ''deprecated''))',
 '["active", "superseded", "draft", "deprecated"]',
 'violates check constraint.*leo_protocols_status',
 'Use one of: active, superseded, draft, deprecated. Only ONE protocol can be "active" at a time.',
 'Protocol lifecycle status. Only one active protocol allowed (enforced by unique index).'),

-- sd_phase_handoffs constraints
('sd_phase_handoffs', 'status', 'check',
 'CHECK (status IN (''pending_acceptance'', ''accepted'', ''rejected''))',
 '["pending_acceptance", "accepted", "rejected"]',
 'violates check constraint.*status',
 'Use one of: pending_acceptance, accepted, rejected',
 'Handoff acceptance status. Starts as pending_acceptance, then accepted or rejected.'),

-- strategic_directives_v2 constraints
('strategic_directives_v2', 'status', 'check',
 'CHECK (status IN (''draft'', ''active'', ''completed'', ''archived''))',
 '["draft", "active", "completed", "archived"]',
 'violates check constraint.*status',
 'Use one of: draft, active, completed, archived',
 'Strategic Directive lifecycle status.'),

-- product_requirements_v2 constraints
('product_requirements_v2', 'status', 'check',
 'CHECK (status IN (''draft'', ''planning'', ''in_progress'', ''testing'', ''approved'', ''completed'', ''archived''))',
 '["draft", "planning", "in_progress", "testing", "approved", "completed", "archived"]',
 'violates check constraint.*status',
 'Use one of: draft, planning, in_progress, testing, approved, completed, archived',
 'PRD lifecycle status through PLAN and EXEC phases.'),

-- sd_scope_deliverables constraints
('sd_scope_deliverables', 'completion_status', 'check',
 'CHECK (completion_status IN (''pending'', ''in_progress'', ''completed'', ''blocked'', ''cancelled''))',
 '["pending", "in_progress", "completed", "blocked", "cancelled"]',
 'violates check constraint.*completion_status',
 'Use one of: pending, in_progress, completed, blocked, cancelled',
 'Deliverable completion tracking status.')

ON CONFLICT (table_name, column_name, constraint_type) DO UPDATE SET
    constraint_definition = EXCLUDED.constraint_definition,
    valid_values = EXCLUDED.valid_values,
    error_pattern = EXCLUDED.error_pattern,
    remediation_hint = EXCLUDED.remediation_hint,
    documentation = EXCLUDED.documentation,
    updated_at = NOW();

-- ============================================================================
-- INITIAL DATA: Process Scripts
-- ============================================================================

INSERT INTO leo_process_scripts (script_name, script_path, description, usage_pattern, argument_format, arguments, examples, common_errors, category)
VALUES
('unified-handoff-system.js', 'scripts/unified-handoff-system.js',
 'Unified LEO Protocol handoff execution system. Handles all handoff types with database-driven templates and validation.',
 'node scripts/unified-handoff-system.js <command> [TYPE] [SD-ID] [PRD-ID]',
 'positional',
 '[{"name": "command", "type": "string", "required": true, "description": "Command: execute, list, stats, help"},
   {"name": "TYPE", "type": "string", "required": true, "description": "Handoff type: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD"},
   {"name": "SD-ID", "type": "string", "required": true, "description": "Strategic Directive ID (e.g., SD-IDEATION-STAGE1-001)"},
   {"name": "PRD-ID", "type": "string", "required": false, "description": "Optional PRD ID for PLAN-TO-EXEC handoffs"}]'::jsonb,
 '[{"command": "node scripts/unified-handoff-system.js execute LEAD-TO-PLAN SD-IDEATION-STAGE1-001", "description": "Execute LEAD to PLAN handoff"},
   {"command": "node scripts/unified-handoff-system.js execute PLAN-TO-EXEC SD-IDEATION-STAGE1-001 PRD-IDEATION-001", "description": "Execute PLAN to EXEC handoff with PRD"},
   {"command": "node scripts/unified-handoff-system.js list SD-IDEATION-STAGE1-001", "description": "List handoffs for an SD"},
   {"command": "node scripts/unified-handoff-system.js stats", "description": "Show handoff statistics"}]'::jsonb,
 '[{"error_pattern": "--type.*not recognized", "cause": "Using flag format instead of positional arguments", "fix": "Use positional: execute TYPE SD-ID, not --type TYPE"},
   {"error_pattern": "Strategic Directive.*not found", "cause": "SD does not exist in database", "fix": "Create SD first using LEO Protocol dashboard or create-strategic-directive.js"}]'::jsonb,
 'handoff'),

('generate-claude-md-from-db.js', 'scripts/generate-claude-md-from-db.js',
 'Generates modular CLAUDE files (CLAUDE.md, CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md) from database tables.',
 'node scripts/generate-claude-md-from-db.js',
 'none',
 '[]'::jsonb,
 '[{"command": "node scripts/generate-claude-md-from-db.js", "description": "Regenerate all CLAUDE files from database"}]'::jsonb,
 '[{"error_pattern": "No active protocol found", "cause": "No leo_protocols record with status=active", "fix": "Ensure one protocol has status=active in leo_protocols table"}]'::jsonb,
 'generation'),

('add-prd-to-database.js', 'scripts/add-prd-to-database.js',
 'Adds a Product Requirements Document to the database with proper schema validation.',
 'node scripts/add-prd-to-database.js --sd-id <SD-ID> --title <title> [options]',
 'flags',
 '[{"name": "--sd-id", "type": "string", "required": true, "description": "Strategic Directive ID"},
   {"name": "--title", "type": "string", "required": true, "description": "PRD title"},
   {"name": "--description", "type": "string", "required": false, "description": "PRD description"}]'::jsonb,
 '[{"command": "node scripts/add-prd-to-database.js --sd-id SD-IDEATION-STAGE1-001 --title \"Stage 1 Implementation\"", "description": "Create PRD for SD"}]'::jsonb,
 '[]'::jsonb,
 'prd'),

('verify-handoff-lead-to-plan.js', 'scripts/verify-handoff-lead-to-plan.js',
 'Verifies LEAD to PLAN handoff requirements are met before allowing transition.',
 'node scripts/verify-handoff-lead-to-plan.js <SD-ID>',
 'positional',
 '[{"name": "SD-ID", "type": "string", "required": true, "description": "Strategic Directive ID to verify"}]'::jsonb,
 '[{"command": "node scripts/verify-handoff-lead-to-plan.js SD-IDEATION-STAGE1-001", "description": "Verify SD is ready for PLAN phase"}]'::jsonb,
 '[]'::jsonb,
 'validation'),

('verify-handoff-plan-to-exec.js', 'scripts/verify-handoff-plan-to-exec.js',
 'Verifies PLAN to EXEC handoff requirements including PRD completeness and sub-agent validations.',
 'node scripts/verify-handoff-plan-to-exec.js <SD-ID> [PRD-ID]',
 'positional',
 '[{"name": "SD-ID", "type": "string", "required": true, "description": "Strategic Directive ID"},
   {"name": "PRD-ID", "type": "string", "required": false, "description": "PRD ID to verify"}]'::jsonb,
 '[{"command": "node scripts/verify-handoff-plan-to-exec.js SD-IDEATION-STAGE1-001", "description": "Verify PLAN phase complete"}]'::jsonb,
 '[]'::jsonb,
 'validation')

ON CONFLICT (script_name) DO UPDATE SET
    script_path = EXCLUDED.script_path,
    description = EXCLUDED.description,
    usage_pattern = EXCLUDED.usage_pattern,
    argument_format = EXCLUDED.argument_format,
    arguments = EXCLUDED.arguments,
    examples = EXCLUDED.examples,
    common_errors = EXCLUDED.common_errors,
    category = EXCLUDED.category,
    updated_at = NOW();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE leo_schema_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_process_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_kb_generation_log ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated users
CREATE POLICY "Authenticated users can read schema constraints"
    ON leo_schema_constraints FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can read process scripts"
    ON leo_process_scripts FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can read kb generation log"
    ON leo_kb_generation_log FOR SELECT
    TO authenticated
    USING (true);

-- Service role has full access
CREATE POLICY "Service role has full access to schema constraints"
    ON leo_schema_constraints FOR ALL
    TO service_role
    USING (true);

CREATE POLICY "Service role has full access to process scripts"
    ON leo_process_scripts FOR ALL
    TO service_role
    USING (true);

CREATE POLICY "Service role has full access to kb generation log"
    ON leo_kb_generation_log FOR ALL
    TO service_role
    USING (true);

-- ============================================================================
-- HELPER FUNCTION: Get constraints for a table
-- ============================================================================

CREATE OR REPLACE FUNCTION get_table_constraints(p_table_name VARCHAR)
RETURNS JSONB AS $$
BEGIN
    RETURN (
        SELECT jsonb_agg(jsonb_build_object(
            'column', column_name,
            'type', constraint_type,
            'valid_values', valid_values,
            'hint', remediation_hint
        ))
        FROM leo_schema_constraints
        WHERE table_name = p_table_name
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTION: Validate value against constraint
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_constraint(
    p_table_name VARCHAR,
    p_column_name VARCHAR,
    p_value TEXT
) RETURNS JSONB AS $$
DECLARE
    v_constraint RECORD;
    v_valid BOOLEAN;
BEGIN
    SELECT * INTO v_constraint
    FROM leo_schema_constraints
    WHERE table_name = p_table_name
    AND column_name = p_column_name
    AND constraint_type = 'check'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', true, 'message', 'No constraint found');
    END IF;

    -- Check if value is in valid_values array
    v_valid := v_constraint.valid_values ? p_value;

    IF v_valid THEN
        RETURN jsonb_build_object('valid', true);
    ELSE
        RETURN jsonb_build_object(
            'valid', false,
            'value', p_value,
            'valid_values', v_constraint.valid_values,
            'hint', v_constraint.remediation_hint
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
    v_constraint_count INTEGER;
    v_script_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_constraint_count FROM leo_schema_constraints;
    SELECT COUNT(*) INTO v_script_count FROM leo_process_scripts;

    RAISE NOTICE 'LEO Protocol v4.3.1 Hardening Migration Applied';
    RAISE NOTICE 'Tables created: leo_schema_constraints, leo_process_scripts, leo_kb_generation_log';
    RAISE NOTICE 'Constraints documented: %', v_constraint_count;
    RAISE NOTICE 'Scripts documented: %', v_script_count;
    RAISE NOTICE 'Helper functions: get_table_constraints(), validate_constraint()';
END $$;

COMMIT;
