-- Migration 021: Enable RLS on Agent and Documentation Tables
-- Date: 2025-10-26
-- Purpose: Enable Row Level Security on 10 tables missing RLS (discovered via RLS coverage analysis)
-- Tables: 5 agent tables + 5 documentation tables
--
-- Context: RLS coverage analysis revealed 10 tables (6% of total) without RLS enabled.
-- These tables are security vulnerabilities - accessible to anonymous users.
-- This migration applies standard RLS policies to secure them.

-- Create helper function for standard RLS policies (if not exists from previous migrations)
CREATE OR REPLACE FUNCTION create_standard_rls_policies(table_name text)
RETURNS void AS $$
BEGIN
  -- Service role: Full access (for backend operations)
  EXECUTE format('
    CREATE POLICY "service_role_all_%I"
    ON %I
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
  ', table_name, table_name);

  -- Authenticated users: Read-only access
  EXECUTE format('
    CREATE POLICY "authenticated_read_%I"
    ON %I
    FOR SELECT
    TO authenticated
    USING (true)
  ', table_name, table_name);

  -- Note: Anonymous users implicitly denied (no policy = no access)
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AGENT TABLES (5)
-- ============================================================================

-- 1. agent_coordination_state
ALTER TABLE agent_coordination_state ENABLE ROW LEVEL SECURITY;
SELECT create_standard_rls_policies('agent_coordination_state');

-- 2. agent_events
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
SELECT create_standard_rls_policies('agent_events');

-- 3. agent_execution_cache
ALTER TABLE agent_execution_cache ENABLE ROW LEVEL SECURITY;
SELECT create_standard_rls_policies('agent_execution_cache');

-- 4. agent_knowledge_base
ALTER TABLE agent_knowledge_base ENABLE ROW LEVEL SECURITY;
SELECT create_standard_rls_policies('agent_knowledge_base');

-- 5. agent_performance_metrics
ALTER TABLE agent_performance_metrics ENABLE ROW LEVEL SECURITY;
SELECT create_standard_rls_policies('agent_performance_metrics');

-- ============================================================================
-- DOCUMENTATION TABLES (5)
-- ============================================================================

-- 6. compliance_alerts
ALTER TABLE compliance_alerts ENABLE ROW LEVEL SECURITY;
SELECT create_standard_rls_policies('compliance_alerts');

-- 7. documentation_health_checks
ALTER TABLE documentation_health_checks ENABLE ROW LEVEL SECURITY;
SELECT create_standard_rls_policies('documentation_health_checks');

-- 8. documentation_inventory
ALTER TABLE documentation_inventory ENABLE ROW LEVEL SECURITY;
SELECT create_standard_rls_policies('documentation_inventory');

-- 9. documentation_templates
ALTER TABLE documentation_templates ENABLE ROW LEVEL SECURITY;
SELECT create_standard_rls_policies('documentation_templates');

-- 10. documentation_violations
ALTER TABLE documentation_violations ENABLE ROW LEVEL SECURITY;
SELECT create_standard_rls_policies('documentation_violations');

-- Clean up helper function
DROP FUNCTION IF EXISTS create_standard_rls_policies(text);

-- Add documentation comments
COMMENT ON TABLE agent_coordination_state IS 'RLS enabled 2025-10-26 (migration 021) - Agent coordination state tracking';
COMMENT ON TABLE agent_events IS 'RLS enabled 2025-10-26 (migration 021) - Agent event log';
COMMENT ON TABLE agent_execution_cache IS 'RLS enabled 2025-10-26 (migration 021) - Agent execution cache';
COMMENT ON TABLE agent_knowledge_base IS 'RLS enabled 2025-10-26 (migration 021) - Agent knowledge base';
COMMENT ON TABLE agent_performance_metrics IS 'RLS enabled 2025-10-26 (migration 021) - Agent performance metrics (from context learning schema)';
COMMENT ON TABLE compliance_alerts IS 'RLS enabled 2025-10-26 (migration 021) - Compliance alerts and violations';
COMMENT ON TABLE documentation_health_checks IS 'RLS enabled 2025-10-26 (migration 021) - Documentation health check results';
COMMENT ON TABLE documentation_inventory IS 'RLS enabled 2025-10-26 (migration 021) - Documentation inventory';
COMMENT ON TABLE documentation_templates IS 'RLS enabled 2025-10-26 (migration 021) - Documentation templates';
COMMENT ON TABLE documentation_violations IS 'RLS enabled 2025-10-26 (migration 021) - Documentation violations';

-- Verification query (for manual testing)
-- SELECT
--   schemaname,
--   tablename,
--   rowsecurity
-- FROM pg_tables
-- WHERE tablename IN (
--   'agent_coordination_state',
--   'agent_events',
--   'agent_execution_cache',
--   'agent_knowledge_base',
--   'agent_performance_metrics',
--   'compliance_alerts',
--   'documentation_health_checks',
--   'documentation_inventory',
--   'documentation_templates',
--   'documentation_violations'
-- )
-- ORDER BY tablename;
