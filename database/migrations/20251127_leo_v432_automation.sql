-- LEO Protocol v4.3.2 - Automation & RLS Fix Migration
-- SD: SD-LEO-4-3-2-AUTOMATION
--
-- This migration addresses:
-- 1. RLS policy fixes for all LEO tables (anon read access)
-- 2. Additional schema constraints auto-discovered
-- 3. Retrospective table constraints

BEGIN;

-- ============================================================================
-- PHASE 1: FIX RLS POLICIES FOR LEO TABLES
-- ============================================================================
-- Problem: Most LEO tables have RLS that blocks anon key reads
-- Solution: Add "anon can read" policies for all LEO reference tables

-- leo_agents - Add anon read policy
DROP POLICY IF EXISTS "Anon users can read agents" ON leo_agents;
CREATE POLICY "Anon users can read agents"
    ON leo_agents FOR SELECT
    TO anon
    USING (true);

-- leo_sub_agents - Add anon read policy
DROP POLICY IF EXISTS "Anon users can read sub_agents" ON leo_sub_agents;
CREATE POLICY "Anon users can read sub_agents"
    ON leo_sub_agents FOR SELECT
    TO anon
    USING (true);

-- leo_sub_agent_triggers - Add anon read policy
DROP POLICY IF EXISTS "Anon users can read sub_agent_triggers" ON leo_sub_agent_triggers;
CREATE POLICY "Anon users can read sub_agent_triggers"
    ON leo_sub_agent_triggers FOR SELECT
    TO anon
    USING (true);

-- leo_handoff_templates - Add anon read policy
DROP POLICY IF EXISTS "Anon users can read handoff_templates" ON leo_handoff_templates;
CREATE POLICY "Anon users can read handoff_templates"
    ON leo_handoff_templates FOR SELECT
    TO anon
    USING (true);

-- leo_handoff_executions - Add anon read policy (for audit trail visibility)
DROP POLICY IF EXISTS "Anon users can read handoff_executions" ON leo_handoff_executions;
CREATE POLICY "Anon users can read handoff_executions"
    ON leo_handoff_executions FOR SELECT
    TO anon
    USING (true);

-- leo_validation_rules - Add anon read policy
DROP POLICY IF EXISTS "Anon users can read validation_rules" ON leo_validation_rules;
CREATE POLICY "Anon users can read validation_rules"
    ON leo_validation_rules FOR SELECT
    TO anon
    USING (true);

-- leo_schema_constraints - Add anon read policy
DROP POLICY IF EXISTS "Anon users can read schema_constraints" ON leo_schema_constraints;
CREATE POLICY "Anon users can read schema_constraints"
    ON leo_schema_constraints FOR SELECT
    TO anon
    USING (true);

-- leo_process_scripts - Add anon read policy
DROP POLICY IF EXISTS "Anon users can read process_scripts" ON leo_process_scripts;
CREATE POLICY "Anon users can read process_scripts"
    ON leo_process_scripts FOR SELECT
    TO anon
    USING (true);

-- leo_kb_generation_log - Add anon read policy
DROP POLICY IF EXISTS "Anon users can read kb_generation_log" ON leo_kb_generation_log;
CREATE POLICY "Anon users can read kb_generation_log"
    ON leo_kb_generation_log FOR SELECT
    TO anon
    USING (true);

-- ============================================================================
-- PHASE 2: ADD ADDITIONAL SCHEMA CONSTRAINTS (Auto-discovered)
-- ============================================================================

-- Strategic Directives constraints
INSERT INTO leo_schema_constraints (table_name, column_name, constraint_type, constraint_definition, valid_values, error_pattern, remediation_hint, documentation)
VALUES
('strategic_directives_v2', 'status', 'check',
 'CHECK (status IN (''draft'', ''lead_review'', ''plan_active'', ''exec_active'', ''completed'', ''on_hold'', ''cancelled''))',
 '["draft", "lead_review", "plan_active", "exec_active", "completed", "on_hold", "cancelled"]',
 'violates check constraint.*strategic_directives.*status',
 'Use one of: draft, lead_review, plan_active, exec_active, completed, on_hold, cancelled',
 'SD lifecycle status. Follows LEAD→PLAN→EXEC flow.')
ON CONFLICT (table_name, column_name, constraint_type) DO UPDATE SET
  valid_values = EXCLUDED.valid_values,
  remediation_hint = EXCLUDED.remediation_hint;

INSERT INTO leo_schema_constraints (table_name, column_name, constraint_type, constraint_definition, valid_values, error_pattern, remediation_hint, documentation)
VALUES
('strategic_directives_v2', 'priority', 'check',
 'CHECK (priority IN (''critical'', ''high'', ''medium'', ''low''))',
 '["critical", "high", "medium", "low"]',
 'violates check constraint.*priority',
 'Use one of: critical, high, medium, low',
 'SD priority level for scheduling.')
ON CONFLICT (table_name, column_name, constraint_type) DO UPDATE SET
  valid_values = EXCLUDED.valid_values;

-- sd_phase_handoffs additional constraints
INSERT INTO leo_schema_constraints (table_name, column_name, constraint_type, constraint_definition, valid_values, error_pattern, remediation_hint, documentation)
VALUES
('sd_phase_handoffs', 'from_phase', 'check',
 'CHECK (from_phase IN (''LEAD'', ''PLAN'', ''EXEC''))',
 '["LEAD", "PLAN", "EXEC"]',
 'violates check constraint.*from_phase',
 'Use one of: LEAD, PLAN, EXEC (uppercase)',
 'Source phase of handoff. Must be uppercase.')
ON CONFLICT (table_name, column_name, constraint_type) DO UPDATE SET
  valid_values = EXCLUDED.valid_values;

INSERT INTO leo_schema_constraints (table_name, column_name, constraint_type, constraint_definition, valid_values, error_pattern, remediation_hint, documentation)
VALUES
('sd_phase_handoffs', 'to_phase', 'check',
 'CHECK (to_phase IN (''LEAD'', ''PLAN'', ''EXEC''))',
 '["LEAD", "PLAN", "EXEC"]',
 'violates check constraint.*to_phase',
 'Use one of: LEAD, PLAN, EXEC (uppercase)',
 'Target phase of handoff. Must be uppercase.')
ON CONFLICT (table_name, column_name, constraint_type) DO UPDATE SET
  valid_values = EXCLUDED.valid_values;

-- leo_handoff_executions constraints
INSERT INTO leo_schema_constraints (table_name, column_name, constraint_type, constraint_definition, valid_values, error_pattern, remediation_hint, documentation)
VALUES
('leo_handoff_executions', 'status', 'check',
 'CHECK (status IN (''pending'', ''accepted'', ''rejected'', ''failed''))',
 '["pending", "accepted", "rejected", "failed"]',
 'violates check constraint.*leo_handoff_executions.*status',
 'Use one of: pending, accepted, rejected, failed',
 'Handoff execution status.')
ON CONFLICT (table_name, column_name, constraint_type) DO UPDATE SET
  valid_values = EXCLUDED.valid_values;

-- sub_agent_execution_results constraints
INSERT INTO leo_schema_constraints (table_name, column_name, constraint_type, constraint_definition, valid_values, error_pattern, remediation_hint, documentation)
VALUES
('sub_agent_execution_results', 'status', 'check',
 'CHECK (status IN (''pending'', ''running'', ''completed'', ''failed'', ''skipped''))',
 '["pending", "running", "completed", "failed", "skipped"]',
 'violates check constraint.*sub_agent.*status',
 'Use one of: pending, running, completed, failed, skipped',
 'Sub-agent execution status.')
ON CONFLICT (table_name, column_name, constraint_type) DO UPDATE SET
  valid_values = EXCLUDED.valid_values;

-- ============================================================================
-- PHASE 3: ADD MORE PROCESS SCRIPTS
-- ============================================================================

INSERT INTO leo_process_scripts (script_name, script_path, description, usage_pattern, category, examples, common_errors, active)
VALUES
('check-leo-version.js', 'scripts/check-leo-version.js',
 'Verifies version consistency between CLAUDE*.md files and database. Use --fix to auto-regenerate.',
 'node scripts/check-leo-version.js [--fix]',
 'validation',
 '[{"command": "node scripts/check-leo-version.js", "description": "Check version consistency"},
   {"command": "node scripts/check-leo-version.js --fix", "description": "Check and auto-fix if drift detected"}]'::jsonb,
 '[{"error_pattern": "No active protocol found", "fix": "Ensure leo_protocols has exactly one active record"}]'::jsonb,
 true),

('run-sql-migration.js', 'scripts/run-sql-migration.js',
 'Executes SQL migration files against the database. Handles statement splitting and error reporting.',
 'node scripts/run-sql-migration.js <migration-file-path>',
 'migration',
 '[{"command": "node scripts/run-sql-migration.js database/migrations/20251127_leo_v432.sql", "description": "Run a migration file"}]'::jsonb,
 '[{"error_pattern": "relation .* does not exist", "fix": "Check table names and run migrations in order"}]'::jsonb,
 true),

('insert-leo-v431-protocol.js', 'scripts/insert-leo-v431-protocol.js',
 'Inserts a new LEO protocol version and copies sections from previous version.',
 'node scripts/insert-leo-v431-protocol.js',
 'utility',
 '[{"command": "node scripts/insert-leo-v431-protocol.js", "description": "Install LEO v4.3.1 protocol"}]'::jsonb,
 '[{"error_pattern": "violates check constraint.*status", "fix": "Use valid status: active, superseded, draft, deprecated"}]'::jsonb,
 true)
ON CONFLICT (script_name) DO UPDATE SET
  description = EXCLUDED.description,
  usage_pattern = EXCLUDED.usage_pattern,
  examples = EXCLUDED.examples,
  common_errors = EXCLUDED.common_errors;

-- ============================================================================
-- PHASE 4: VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_rls_count INTEGER;
    v_constraint_count INTEGER;
    v_script_count INTEGER;
BEGIN
    -- Count RLS policies for LEO tables
    SELECT COUNT(*) INTO v_rls_count
    FROM pg_policies
    WHERE tablename LIKE 'leo_%' AND policyname LIKE 'Anon%';

    -- Count constraints
    SELECT COUNT(*) INTO v_constraint_count
    FROM leo_schema_constraints;

    -- Count scripts
    SELECT COUNT(*) INTO v_script_count
    FROM leo_process_scripts WHERE active = true;

    RAISE NOTICE '✅ LEO v4.3.2 Migration Verification:';
    RAISE NOTICE '   - Anon RLS policies: %', v_rls_count;
    RAISE NOTICE '   - Schema constraints: %', v_constraint_count;
    RAISE NOTICE '   - Process scripts: %', v_script_count;
END $$;

COMMIT;
