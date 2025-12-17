-- Migration: Fix SD-ID Foreign Key Integrity
-- Generated: 2025-12-17
-- Purpose: Add FK constraints and clean up orphaned records

-- IMPORTANT: Run this migration in phases to avoid data loss
-- Phase 1: Clean up test data
-- Phase 2: Migrate legacy_id references to UUIDs
-- Phase 3: Add FK constraints
-- Phase 4: Clean up remaining orphans

BEGIN;

-- ============================================================================
-- PHASE 1: Clean up test/development data
-- ============================================================================

-- Delete test data from agent_events
DELETE FROM agent_events
WHERE sd_id IN ('test-sd-123', 'QUERY', 'MIGRATION', 'OVERRIDE-TEST-001');

-- Delete STANDALONE entries from model_usage_log (non-SD specific tracking)
-- Note: Keep these but mark as informational
UPDATE model_usage_log
SET sd_id = NULL
WHERE sd_id IN ('STANDALONE', 'QUERY', 'MIGRATION', 'vision-transition-001');

-- ============================================================================
-- PHASE 2: Migrate legacy_id references to UUIDs
-- ============================================================================

-- Create temporary function to migrate legacy IDs
CREATE OR REPLACE FUNCTION migrate_legacy_sd_id() RETURNS void AS $$
DECLARE
  rec RECORD;
  tables_to_migrate TEXT[] := ARRAY[
    'sub_agent_execution_results',
    'handoff_audit_log',
    'retro_notifications',
    'model_usage_log',
    'sd_baseline_items',
    'sd_execution_actuals',
    'sd_execution_timeline',
    'leo_mandatory_validations',
    'sd_claims',
    'agent_events'
  ];
  table_name TEXT;
BEGIN
  -- For each table, update sd_id from legacy_id to UUID
  FOREACH table_name IN ARRAY tables_to_migrate
  LOOP
    EXECUTE format('
      UPDATE %I
      SET sd_id = sd.id
      FROM strategic_directives_v2 sd
      WHERE %I.sd_id = sd.legacy_id
        AND %I.sd_id != sd.id
    ', table_name, table_name, table_name);

    RAISE NOTICE 'Migrated legacy IDs in %', table_name;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute migration
SELECT migrate_legacy_sd_id();

-- Drop temporary function
DROP FUNCTION migrate_legacy_sd_id();

-- ============================================================================
-- PHASE 3: Add Foreign Key Constraints (BASE TABLES ONLY)
-- ============================================================================

-- Note: Do NOT add FK constraints to views (they start with v_)
-- Views inherit constraints from their base tables

-- Add FK constraints to tables without them (excluding views)
ALTER TABLE active_github_operations
  ADD CONSTRAINT fk_active_github_operations_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE agent_coordination_state
  ADD CONSTRAINT fk_agent_coordination_state_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE agent_events
  ADD CONSTRAINT fk_agent_events_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE claude_sessions
  ADD CONSTRAINT fk_claude_sessions_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE github_operations
  ADD CONSTRAINT fk_github_operations_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE handoff_audit_log
  ADD CONSTRAINT fk_handoff_audit_log_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE handoff_readiness_dashboard
  ADD CONSTRAINT fk_handoff_readiness_dashboard_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE handoff_verification_gates
  ADD CONSTRAINT fk_handoff_verification_gates_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE leo_mandatory_validations
  ADD CONSTRAINT fk_leo_mandatory_validations_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE leo_reasoning_sessions
  ADD CONSTRAINT fk_leo_reasoning_sessions_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE model_usage_log
  ADD CONSTRAINT fk_model_usage_log_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE plan_verification_results
  ADD CONSTRAINT fk_plan_verification_results_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE retro_notifications
  ADD CONSTRAINT fk_retro_notifications_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE sd_baseline_items
  ADD CONSTRAINT fk_sd_baseline_items_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE sd_capabilities
  ADD CONSTRAINT fk_sd_capabilities_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE sd_claims
  ADD CONSTRAINT fk_sd_claims_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE sd_execution_actuals
  ADD CONSTRAINT fk_sd_execution_actuals_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE sd_execution_timeline
  ADD CONSTRAINT fk_sd_execution_timeline_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE sd_session_activity
  ADD CONSTRAINT fk_sd_session_activity_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE strategic_directives_backlog
  ADD CONSTRAINT fk_strategic_directives_backlog_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE sub_agent_execution_results
  ADD CONSTRAINT fk_sub_agent_execution_results_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE ui_validation_results
  ADD CONSTRAINT fk_ui_validation_results_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

ALTER TABLE ui_validation_summary
  ADD CONSTRAINT fk_ui_validation_summary_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

-- ============================================================================
-- PHASE 4: Review remaining orphaned records
-- ============================================================================

-- Create a view to track any remaining orphaned records after migration
CREATE OR REPLACE VIEW v_remaining_orphaned_sd_ids AS
SELECT
  'sub_agent_execution_results' as table_name,
  sd_id,
  COUNT(*) as record_count
FROM sub_agent_execution_results
WHERE sd_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM strategic_directives_v2 sd WHERE sd.id = sub_agent_execution_results.sd_id)
GROUP BY sd_id

UNION ALL

SELECT
  'handoff_audit_log' as table_name,
  sd_id,
  COUNT(*) as record_count
FROM handoff_audit_log
WHERE sd_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM strategic_directives_v2 sd WHERE sd.id = handoff_audit_log.sd_id)
GROUP BY sd_id

UNION ALL

SELECT
  'retro_notifications' as table_name,
  sd_id,
  COUNT(*) as record_count
FROM retro_notifications
WHERE sd_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM strategic_directives_v2 sd WHERE sd.id = retro_notifications.sd_id)
GROUP BY sd_id

UNION ALL

SELECT
  'model_usage_log' as table_name,
  sd_id,
  COUNT(*) as record_count
FROM model_usage_log
WHERE sd_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM strategic_directives_v2 sd WHERE sd.id = model_usage_log.sd_id)
GROUP BY sd_id

ORDER BY record_count DESC;

-- ============================================================================
-- VALIDATION QUERIES
-- ============================================================================

-- Check FK constraint coverage
SELECT
  COUNT(*) FILTER (WHERE tc.constraint_name IS NULL) as tables_without_fk,
  COUNT(*) FILTER (WHERE tc.constraint_name IS NOT NULL) as tables_with_fk
FROM information_schema.columns c
LEFT JOIN information_schema.table_constraints tc
  ON tc.table_name = c.table_name
  AND tc.constraint_type = 'FOREIGN KEY'
  AND EXISTS (
    SELECT 1 FROM information_schema.key_column_usage kcu
    WHERE kcu.constraint_name = tc.constraint_name
      AND kcu.column_name = 'sd_id'
  )
WHERE c.table_schema = 'public'
  AND c.column_name = 'sd_id'
  AND c.table_name NOT LIKE 'v_%';  -- Exclude views

-- Report remaining orphaned records
SELECT * FROM v_remaining_orphaned_sd_ids;

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================

-- After running this migration:
-- 1. Review v_remaining_orphaned_sd_ids for any records that still need attention
-- 2. Determine if remaining orphans are from deleted SDs that should be preserved
-- 3. Consider implementing soft-delete pattern for strategic_directives_v2
-- 4. Update application code to always use UUID (not legacy_id) for sd_id references
