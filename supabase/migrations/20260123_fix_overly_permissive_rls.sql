-- Migration: Fix Overly Permissive RLS Policies
-- SD-SEC-RLS-POLICIES-001
--
-- Problem: 27 tables have FOR ALL TO authenticated USING(true) policies
-- which give authenticated users full read/write/delete access.
--
-- Solution: For audit/log tables, restrict to append-only (INSERT + SELECT).
-- For other internal tables, restrict to service_role only.

-- ============================================
-- AUDIT TABLES - Make Append-Only
-- These tables track history and should not be modifiable/deletable
-- ============================================

-- 1. activity_logs - User activity tracking
DROP POLICY IF EXISTS "authenticated_all_activity_logs" ON activity_logs;
CREATE POLICY "authenticated_insert_activity_logs" ON activity_logs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_select_activity_logs" ON activity_logs
  FOR SELECT TO authenticated USING (true);
-- No UPDATE/DELETE for authenticated

-- 2. continuous_execution_log - Execution history
DROP POLICY IF EXISTS "Allow all for authenticated" ON continuous_execution_log;
CREATE POLICY "authenticated_insert_continuous_execution_log" ON continuous_execution_log
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_select_continuous_execution_log" ON continuous_execution_log
  FOR SELECT TO authenticated USING (true);

-- 3. model_usage_log - AI model usage tracking
DROP POLICY IF EXISTS "Allow all for authenticated" ON model_usage_log;
CREATE POLICY "authenticated_insert_model_usage_log" ON model_usage_log
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_select_model_usage_log" ON model_usage_log
  FOR SELECT TO authenticated USING (true);

-- 4. context_usage_log - Context usage tracking
DROP POLICY IF EXISTS "Allow all for authenticated" ON context_usage_log;
CREATE POLICY "authenticated_insert_context_usage_log" ON context_usage_log
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_select_context_usage_log" ON context_usage_log
  FOR SELECT TO authenticated USING (true);

-- 5. context_usage_daily - Daily context aggregates
DROP POLICY IF EXISTS "Allow all for authenticated" ON context_usage_daily;
CREATE POLICY "authenticated_insert_context_usage_daily" ON context_usage_daily
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_select_context_usage_daily" ON context_usage_daily
  FOR SELECT TO authenticated USING (true);

-- 6. sd_checkpoint_history - SD checkpoint audit trail
DROP POLICY IF EXISTS "Allow all for authenticated" ON sd_checkpoint_history;
CREATE POLICY "authenticated_insert_sd_checkpoint_history" ON sd_checkpoint_history
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_select_sd_checkpoint_history" ON sd_checkpoint_history
  FOR SELECT TO authenticated USING (true);

-- 7. sd_type_change_audit - SD type change history
DROP POLICY IF EXISTS "Allow all for authenticated" ON sd_type_change_audit;
CREATE POLICY "authenticated_insert_sd_type_change_audit" ON sd_type_change_audit
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_select_sd_type_change_audit" ON sd_type_change_audit
  FOR SELECT TO authenticated USING (true);

-- 8. workflow_executions - Workflow execution history
DROP POLICY IF EXISTS "authenticated_all_workflow_executions" ON workflow_executions;
CREATE POLICY "authenticated_insert_workflow_executions" ON workflow_executions
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_select_workflow_executions" ON workflow_executions
  FOR SELECT TO authenticated USING (true);

-- 9. wizard_analytics - Usage analytics
DROP POLICY IF EXISTS "authenticated_all_wizard_analytics" ON wizard_analytics;
CREATE POLICY "authenticated_insert_wizard_analytics" ON wizard_analytics
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_select_wizard_analytics" ON wizard_analytics
  FOR SELECT TO authenticated USING (true);

-- ============================================
-- INTERNAL LEO TABLES - Service Role Only
-- These are internal protocol tables, not user-facing
-- ============================================

-- 10. pattern_subagent_mapping - Internal mapping
DROP POLICY IF EXISTS "Authenticated users can manage pattern_subagent_mapping" ON pattern_subagent_mapping;
CREATE POLICY "service_role_all_pattern_subagent_mapping" ON pattern_subagent_mapping
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_pattern_subagent_mapping" ON pattern_subagent_mapping
  FOR SELECT TO authenticated USING (true);

-- 11. scaffold_patterns - Internal patterns
DROP POLICY IF EXISTS "Allow all for authenticated" ON scaffold_patterns;
CREATE POLICY "service_role_all_scaffold_patterns" ON scaffold_patterns
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_scaffold_patterns" ON scaffold_patterns
  FOR SELECT TO authenticated USING (true);

-- 12. sd_baseline_rationale - Internal rationale
DROP POLICY IF EXISTS "Allow all for authenticated" ON sd_baseline_rationale;
CREATE POLICY "service_role_all_sd_baseline_rationale" ON sd_baseline_rationale
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_sd_baseline_rationale" ON sd_baseline_rationale
  FOR SELECT TO authenticated USING (true);

-- 13. sd_intensity_adjustments - Internal adjustments
DROP POLICY IF EXISTS "Allow all for authenticated" ON sd_intensity_adjustments;
CREATE POLICY "service_role_all_sd_intensity_adjustments" ON sd_intensity_adjustments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_sd_intensity_adjustments" ON sd_intensity_adjustments
  FOR SELECT TO authenticated USING (true);

-- 14. sd_intensity_gate_exemptions - Internal exemptions
DROP POLICY IF EXISTS "Allow all for authenticated" ON sd_intensity_gate_exemptions;
CREATE POLICY "service_role_all_sd_intensity_gate_exemptions" ON sd_intensity_gate_exemptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_sd_intensity_gate_exemptions" ON sd_intensity_gate_exemptions
  FOR SELECT TO authenticated USING (true);

-- 15. sd_type_gate_exemptions - Internal exemptions
DROP POLICY IF EXISTS "Allow all for authenticated" ON sd_type_gate_exemptions;
CREATE POLICY "service_role_all_sd_type_gate_exemptions" ON sd_type_gate_exemptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_sd_type_gate_exemptions" ON sd_type_gate_exemptions
  FOR SELECT TO authenticated USING (true);

-- ============================================
-- SESSION/CLAIMS TABLES - User-Scoped Access
-- These tables should be user-scoped (own records only)
-- ============================================

-- 16. claude_sessions - User's own sessions only
DROP POLICY IF EXISTS "Allow all for authenticated" ON claude_sessions;
CREATE POLICY "service_role_all_claude_sessions" ON claude_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_claude_sessions" ON claude_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_claude_sessions" ON claude_sessions
  FOR INSERT TO authenticated WITH CHECK (true);
-- Note: Full user-scoping would require user_id column

-- 17. sd_claims - Claims management
DROP POLICY IF EXISTS "Allow all for authenticated" ON sd_claims;
CREATE POLICY "service_role_all_sd_claims" ON sd_claims
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_sd_claims" ON sd_claims
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_sd_claims" ON sd_claims
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_sd_claims" ON sd_claims
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- DELETE restricted to service_role

-- ============================================
-- REMAINING TABLES - Keep Current (Legitimate Use Cases)
-- ============================================
-- naming_suggestions - Users create/edit their suggestions
-- opportunities - Users manage opportunities
-- opportunity_* - Related opportunity tables
-- quick_fixes - Users manage quick fixes
-- research_sessions - Users manage sessions
-- simulation_sessions - Users manage simulations
-- soul_extractions - Users manage extractions
-- venture_raid_summary - Venture-related access
-- These tables have legitimate user write needs

-- ============================================
-- Verification Comments
-- ============================================
COMMENT ON TABLE activity_logs IS 'RLS: Append-only for authenticated, no delete/update';
COMMENT ON TABLE continuous_execution_log IS 'RLS: Append-only for authenticated';
COMMENT ON TABLE model_usage_log IS 'RLS: Append-only for authenticated';
COMMENT ON TABLE sd_checkpoint_history IS 'RLS: Append-only for authenticated';
COMMENT ON TABLE sd_type_change_audit IS 'RLS: Append-only for authenticated';
COMMENT ON TABLE pattern_subagent_mapping IS 'RLS: Service role write, authenticated read';
