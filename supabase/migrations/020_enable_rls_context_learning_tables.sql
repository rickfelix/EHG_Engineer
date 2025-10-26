-- Migration 020: Enable RLS on Context Learning Tables
-- Date: 2025-10-26
-- Purpose: Enable Row Level Security on 5 new context learning tables created in migration 009
-- Tables: context_embeddings, feedback_events, interaction_history, learning_configurations, user_context_patterns
--
-- Context: These tables were created without RLS policies, breaking our 100% RLS coverage.
-- This migration applies standard RLS policies to restore security compliance.

-- Create helper function for standard RLS policies
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

-- Enable RLS on all 5 context learning tables
ALTER TABLE context_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_context_patterns ENABLE ROW LEVEL SECURITY;

-- Apply standard policies to all tables
SELECT create_standard_rls_policies('context_embeddings');
SELECT create_standard_rls_policies('feedback_events');
SELECT create_standard_rls_policies('interaction_history');
SELECT create_standard_rls_policies('learning_configurations');
SELECT create_standard_rls_policies('user_context_patterns');

-- Clean up helper function
DROP FUNCTION IF EXISTS create_standard_rls_policies(text);

-- Verification query (for manual testing)
-- SELECT
--   schemaname,
--   tablename,
--   rowsecurity
-- FROM pg_tables
-- WHERE tablename IN (
--   'context_embeddings',
--   'feedback_events',
--   'interaction_history',
--   'learning_configurations',
--   'user_context_patterns'
-- )
-- ORDER BY tablename;

COMMENT ON TABLE context_embeddings IS 'RLS enabled 2025-10-26 (migration 020) - Vector embeddings for semantic similarity matching';
COMMENT ON TABLE feedback_events IS 'RLS enabled 2025-10-26 (migration 020) - User feedback events for continuous learning';
COMMENT ON TABLE interaction_history IS 'RLS enabled 2025-10-26 (migration 020) - Complete history of context monitoring interactions';
COMMENT ON TABLE learning_configurations IS 'RLS enabled 2025-10-26 (migration 020) - Adaptive configuration parameters that evolve';
COMMENT ON TABLE user_context_patterns IS 'RLS enabled 2025-10-26 (migration 020) - Learned patterns of user behavior and context';
