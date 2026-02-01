-- Migration: Add Missing RLS Policies
-- QF-20260201-568: Fix RLS verification failures
-- Purpose: Add RLS policies to tables identified as missing them in CI
--
-- Tables addressed:
--   1. learning_inbox
--   2. leo_audit_checklists
--   3. leo_audit_config
--   4. leo_feature_flag_approvals
--   5. leo_feature_flag_audit
--   6. leo_feature_flag_audit_log
--   7. leo_feature_flag_policies
--   8. leo_feature_flags
--   9. leo_kill_switches
--  10. leo_planner_rankings
--  11. session_lifecycle_events
--
-- All policies use service_role bypass for admin access

-- ============================================================================
-- 1. learning_inbox
-- ============================================================================
ALTER TABLE learning_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learning_inbox_service_role_all"
  ON learning_inbox
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "learning_inbox_authenticated_select"
  ON learning_inbox
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "learning_inbox_authenticated_insert"
  ON learning_inbox
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- 2. leo_audit_checklists
-- ============================================================================
ALTER TABLE leo_audit_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leo_audit_checklists_service_role_all"
  ON leo_audit_checklists
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "leo_audit_checklists_authenticated_select"
  ON leo_audit_checklists
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 3. leo_audit_config
-- ============================================================================
ALTER TABLE leo_audit_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leo_audit_config_service_role_all"
  ON leo_audit_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "leo_audit_config_authenticated_select"
  ON leo_audit_config
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 4. leo_feature_flag_approvals
-- ============================================================================
ALTER TABLE leo_feature_flag_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leo_feature_flag_approvals_service_role_all"
  ON leo_feature_flag_approvals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "leo_feature_flag_approvals_authenticated_select"
  ON leo_feature_flag_approvals
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 5. leo_feature_flag_audit
-- ============================================================================
ALTER TABLE leo_feature_flag_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leo_feature_flag_audit_service_role_all"
  ON leo_feature_flag_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "leo_feature_flag_audit_authenticated_select"
  ON leo_feature_flag_audit
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 6. leo_feature_flag_audit_log
-- ============================================================================
ALTER TABLE leo_feature_flag_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leo_feature_flag_audit_log_service_role_all"
  ON leo_feature_flag_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "leo_feature_flag_audit_log_authenticated_select"
  ON leo_feature_flag_audit_log
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 7. leo_feature_flag_policies
-- ============================================================================
ALTER TABLE leo_feature_flag_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leo_feature_flag_policies_service_role_all"
  ON leo_feature_flag_policies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "leo_feature_flag_policies_authenticated_select"
  ON leo_feature_flag_policies
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 8. leo_feature_flags
-- ============================================================================
ALTER TABLE leo_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leo_feature_flags_service_role_all"
  ON leo_feature_flags
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "leo_feature_flags_authenticated_select"
  ON leo_feature_flags
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 9. leo_kill_switches
-- ============================================================================
ALTER TABLE leo_kill_switches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leo_kill_switches_service_role_all"
  ON leo_kill_switches
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "leo_kill_switches_authenticated_select"
  ON leo_kill_switches
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 10. leo_planner_rankings
-- ============================================================================
ALTER TABLE leo_planner_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leo_planner_rankings_service_role_all"
  ON leo_planner_rankings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "leo_planner_rankings_authenticated_select"
  ON leo_planner_rankings
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 11. session_lifecycle_events
-- ============================================================================
ALTER TABLE session_lifecycle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_lifecycle_events_service_role_all"
  ON session_lifecycle_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "session_lifecycle_events_authenticated_select"
  ON session_lifecycle_events
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Grant anon access for public tables (read-only)
-- ============================================================================
-- Note: Most of these are admin/internal tables that don't need anon access
-- leo_feature_flags is the exception - apps may need to check feature flags
GRANT SELECT ON leo_feature_flags TO anon;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON POLICY "learning_inbox_service_role_all" ON learning_inbox IS
  'QF-20260201-568: Allow service_role full access to learning inbox';

COMMENT ON POLICY "leo_feature_flags_service_role_all" ON leo_feature_flags IS
  'QF-20260201-568: Allow service_role full access to feature flags';

COMMENT ON POLICY "session_lifecycle_events_service_role_all" ON session_lifecycle_events IS
  'QF-20260201-568: Allow service_role full access to session lifecycle events';
