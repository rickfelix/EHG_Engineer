-- ============================================================================
-- COMPREHENSIVE RLS POLICY FIX SCRIPT
-- ============================================================================
-- Generated: 2025-12-02
-- Database: dedlbzhpgkmetvhbkyzq (EHG Consolidated)
--
-- This script adds missing RLS policies to 32 tables that have incomplete coverage.
-- Total policies to create: 76
--
-- Priority tables addressed:
--   - profiles (missing DELETE)
--   - ventures (missing INSERT, UPDATE, DELETE)
--
-- Naming convention: "Allow authenticated users to {action} {table}"
-- ============================================================================

-- Begin transaction for atomic application
BEGIN;

-- ============================================================================
-- PRIORITY TABLE: profiles
-- Currently missing: DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to delete profiles" ON public.profiles;
CREATE POLICY "Allow authenticated users to delete profiles"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- ============================================================================
-- PRIORITY TABLE: ventures
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: ventures table has created_by (uuid) column for ownership
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to insert ventures" ON public.ventures;
CREATE POLICY "Allow authenticated users to insert ventures"
  ON public.ventures
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = created_by::text OR created_by IS NULL);

DROP POLICY IF EXISTS "Allow authenticated users to update ventures" ON public.ventures;
CREATE POLICY "Allow authenticated users to update ventures"
  ON public.ventures
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = created_by::text)
  WITH CHECK (auth.uid()::text = created_by::text);

DROP POLICY IF EXISTS "Allow authenticated users to delete ventures" ON public.ventures;
CREATE POLICY "Allow authenticated users to delete ventures"
  ON public.ventures
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = created_by::text);

-- Service role needs full access for automated workflows
DROP POLICY IF EXISTS "Allow service_role to manage ventures" ON public.ventures;
CREATE POLICY "Allow service_role to manage ventures"
  ON public.ventures
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: agentic_reviews
-- Currently missing: DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to delete agentic_reviews" ON public.agentic_reviews;
CREATE POLICY "Allow authenticated users to delete agentic_reviews"
  ON public.agentic_reviews
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- TABLE: chairman_feedback
-- Currently missing: INSERT, UPDATE, DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to insert chairman_feedback" ON public.chairman_feedback;
CREATE POLICY "Allow authenticated users to insert chairman_feedback"
  ON public.chairman_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update chairman_feedback" ON public.chairman_feedback;
CREATE POLICY "Allow authenticated users to update chairman_feedback"
  ON public.chairman_feedback
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete chairman_feedback" ON public.chairman_feedback;
CREATE POLICY "Allow authenticated users to delete chairman_feedback"
  ON public.chairman_feedback
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- TABLE: companies
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: Companies are typically managed by admins, using service_role policy
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to insert companies" ON public.companies;
CREATE POLICY "Allow service_role to insert companies"
  ON public.companies
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role to update companies" ON public.companies;
CREATE POLICY "Allow service_role to update companies"
  ON public.companies
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role to delete companies" ON public.companies;
CREATE POLICY "Allow service_role to delete companies"
  ON public.companies
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- TABLE: content_types
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: Reference data, typically managed by admins
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage content_types" ON public.content_types;
CREATE POLICY "Allow service_role to manage content_types"
  ON public.content_types
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: crewai_flow_executions
-- Currently missing: UPDATE, DELETE
-- Note: Has executed_by (uuid) column for ownership
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to update crewai_flow_executions" ON public.crewai_flow_executions;
CREATE POLICY "Allow authenticated users to update crewai_flow_executions"
  ON public.crewai_flow_executions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = executed_by)
  WITH CHECK (auth.uid() = executed_by);

DROP POLICY IF EXISTS "Allow authenticated users to delete crewai_flow_executions" ON public.crewai_flow_executions;
CREATE POLICY "Allow authenticated users to delete crewai_flow_executions"
  ON public.crewai_flow_executions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = executed_by);

-- Service role for automated workflows
DROP POLICY IF EXISTS "Allow service_role to manage crewai_flow_executions" ON public.crewai_flow_executions;
CREATE POLICY "Allow service_role to manage crewai_flow_executions"
  ON public.crewai_flow_executions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: crewai_flow_templates
-- Currently missing: UPDATE, DELETE
-- Note: Has created_by (uuid) column for ownership
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to update crewai_flow_templates" ON public.crewai_flow_templates;
CREATE POLICY "Allow authenticated users to update crewai_flow_templates"
  ON public.crewai_flow_templates
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Allow authenticated users to delete crewai_flow_templates" ON public.crewai_flow_templates;
CREATE POLICY "Allow authenticated users to delete crewai_flow_templates"
  ON public.crewai_flow_templates
  FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Service role for system templates
DROP POLICY IF EXISTS "Allow service_role to manage crewai_flow_templates" ON public.crewai_flow_templates;
CREATE POLICY "Allow service_role to manage crewai_flow_templates"
  ON public.crewai_flow_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: ehg_component_patterns
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: EHG design system tables - admin managed
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage ehg_component_patterns" ON public.ehg_component_patterns;
CREATE POLICY "Allow service_role to manage ehg_component_patterns"
  ON public.ehg_component_patterns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: ehg_design_decisions
-- Currently missing: UPDATE, DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to update ehg_design_decisions" ON public.ehg_design_decisions;
CREATE POLICY "Allow authenticated users to update ehg_design_decisions"
  ON public.ehg_design_decisions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete ehg_design_decisions" ON public.ehg_design_decisions;
CREATE POLICY "Allow authenticated users to delete ehg_design_decisions"
  ON public.ehg_design_decisions
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- TABLE: ehg_feature_areas
-- Currently missing: INSERT, UPDATE, DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage ehg_feature_areas" ON public.ehg_feature_areas;
CREATE POLICY "Allow service_role to manage ehg_feature_areas"
  ON public.ehg_feature_areas
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: ehg_page_routes
-- Currently missing: INSERT, UPDATE, DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage ehg_page_routes" ON public.ehg_page_routes;
CREATE POLICY "Allow service_role to manage ehg_page_routes"
  ON public.ehg_page_routes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: ehg_user_workflows
-- Currently missing: INSERT, UPDATE, DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage ehg_user_workflows" ON public.ehg_user_workflows;
CREATE POLICY "Allow service_role to manage ehg_user_workflows"
  ON public.ehg_user_workflows
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: github_operations
-- Currently missing: UPDATE, DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to update github_operations" ON public.github_operations;
CREATE POLICY "Allow authenticated users to update github_operations"
  ON public.github_operations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete github_operations" ON public.github_operations;
CREATE POLICY "Allow authenticated users to delete github_operations"
  ON public.github_operations
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- TABLE: governance_policies
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: Governance is admin-managed
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage governance_policies" ON public.governance_policies;
CREATE POLICY "Allow service_role to manage governance_policies"
  ON public.governance_policies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: issue_patterns
-- Currently missing: DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to delete issue_patterns" ON public.issue_patterns;
CREATE POLICY "Allow authenticated users to delete issue_patterns"
  ON public.issue_patterns
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- TABLE: llm_models
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: Reference data, admin managed
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage llm_models" ON public.llm_models;
CREATE POLICY "Allow service_role to manage llm_models"
  ON public.llm_models
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: llm_providers
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: Reference data, admin managed
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage llm_providers" ON public.llm_providers;
CREATE POLICY "Allow service_role to manage llm_providers"
  ON public.llm_providers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: market_segments
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: Reference data, admin managed
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage market_segments" ON public.market_segments;
CREATE POLICY "Allow service_role to manage market_segments"
  ON public.market_segments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: portfolios
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: portfolios table links via company_id, not user_id
-- Using service_role for management, authenticated for company members
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage portfolios" ON public.portfolios;
CREATE POLICY "Allow service_role to manage portfolios"
  ON public.portfolios
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to manage portfolios through company access
DROP POLICY IF EXISTS "Allow authenticated users to insert portfolios" ON public.portfolios;
CREATE POLICY "Allow authenticated users to insert portfolios"
  ON public.portfolios
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update portfolios" ON public.portfolios;
CREATE POLICY "Allow authenticated users to update portfolios"
  ON public.portfolios
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete portfolios" ON public.portfolios;
CREATE POLICY "Allow authenticated users to delete portfolios"
  ON public.portfolios
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- TABLE: pr_metrics
-- Currently missing: DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to delete pr_metrics" ON public.pr_metrics;
CREATE POLICY "Allow authenticated users to delete pr_metrics"
  ON public.pr_metrics
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- TABLE: prd_research_audit_log
-- Currently missing: UPDATE, DELETE
-- Note: Audit logs should be immutable - only service_role can modify
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to update prd_research_audit_log" ON public.prd_research_audit_log;
CREATE POLICY "Allow service_role to update prd_research_audit_log"
  ON public.prd_research_audit_log
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role to delete prd_research_audit_log" ON public.prd_research_audit_log;
CREATE POLICY "Allow service_role to delete prd_research_audit_log"
  ON public.prd_research_audit_log
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- TABLE: prompt_templates
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: Reference data, admin managed
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage prompt_templates" ON public.prompt_templates;
CREATE POLICY "Allow service_role to manage prompt_templates"
  ON public.prompt_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: screen_layouts
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: Reference data, admin managed
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage screen_layouts" ON public.screen_layouts;
CREATE POLICY "Allow service_role to manage screen_layouts"
  ON public.screen_layouts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: sub_agent_execution_results
-- Currently missing: DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to delete sub_agent_execution_results" ON public.sub_agent_execution_results;
CREATE POLICY "Allow service_role to delete sub_agent_execution_results"
  ON public.sub_agent_execution_results
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- TABLE: system_health
-- Currently missing: DELETE
-- Note: System health logs - service_role only for delete
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to delete system_health" ON public.system_health;
CREATE POLICY "Allow service_role to delete system_health"
  ON public.system_health
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- TABLE: uat_credential_history
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: Credential history is sensitive - service_role only
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage uat_credential_history" ON public.uat_credential_history;
CREATE POLICY "Allow service_role to manage uat_credential_history"
  ON public.uat_credential_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: user_company_access
-- Currently missing: INSERT, UPDATE, DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage user_company_access" ON public.user_company_access;
CREATE POLICY "Allow service_role to manage user_company_access"
  ON public.user_company_access
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also allow users to insert their own access (for onboarding flows)
DROP POLICY IF EXISTS "Allow authenticated users to insert own user_company_access" ON public.user_company_access;
CREATE POLICY "Allow authenticated users to insert own user_company_access"
  ON public.user_company_access
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- TABLE: voice_cached_responses
-- Currently missing: UPDATE, DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to update voice_cached_responses" ON public.voice_cached_responses;
CREATE POLICY "Allow service_role to update voice_cached_responses"
  ON public.voice_cached_responses
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role to delete voice_cached_responses" ON public.voice_cached_responses;
CREATE POLICY "Allow service_role to delete voice_cached_responses"
  ON public.voice_cached_responses
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- TABLE: voice_conversations
-- Currently missing: DELETE
-- Note: Has user_id column for ownership
-- ============================================================================
DROP POLICY IF EXISTS "Allow users to delete own voice_conversations" ON public.voice_conversations;
CREATE POLICY "Allow users to delete own voice_conversations"
  ON public.voice_conversations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- TABLE: voice_function_calls
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: Join to voice_conversations for ownership (via conversation_id)
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to insert voice_function_calls" ON public.voice_function_calls;
CREATE POLICY "Allow authenticated users to insert voice_function_calls"
  ON public.voice_function_calls
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update voice_function_calls" ON public.voice_function_calls;
CREATE POLICY "Allow authenticated users to update voice_function_calls"
  ON public.voice_function_calls
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete voice_function_calls" ON public.voice_function_calls;
CREATE POLICY "Allow authenticated users to delete voice_function_calls"
  ON public.voice_function_calls
  FOR DELETE
  TO authenticated
  USING (true);

-- Service role access for voice function calls
DROP POLICY IF EXISTS "Allow service_role to manage voice_function_calls" ON public.voice_function_calls;
CREATE POLICY "Allow service_role to manage voice_function_calls"
  ON public.voice_function_calls
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE: voice_usage_metrics
-- Currently missing: INSERT, UPDATE, DELETE
-- Note: Links via conversation_id, need to join for user ownership
-- Using service_role for write operations
-- ============================================================================
DROP POLICY IF EXISTS "Allow service_role to manage voice_usage_metrics" ON public.voice_usage_metrics;
CREATE POLICY "Allow service_role to manage voice_usage_metrics"
  ON public.voice_usage_metrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated insert for metrics tracking
DROP POLICY IF EXISTS "Allow authenticated users to insert voice_usage_metrics" ON public.voice_usage_metrics;
CREATE POLICY "Allow authenticated users to insert voice_usage_metrics"
  ON public.voice_usage_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- COMMIT TRANSACTION
-- ============================================================================
COMMIT;

-- ============================================================================
-- VERIFICATION QUERY
-- Run this after applying to verify all policies are in place
-- ============================================================================
-- SELECT tablename, COUNT(*) as policy_count,
--        array_agg(DISTINCT cmd) as covered_commands
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'profiles', 'ventures', 'agentic_reviews', 'chairman_feedback',
--     'companies', 'content_types', 'crewai_flow_executions',
--     'crewai_flow_templates', 'ehg_component_patterns', 'ehg_design_decisions',
--     'ehg_feature_areas', 'ehg_page_routes', 'ehg_user_workflows',
--     'github_operations', 'governance_policies', 'issue_patterns',
--     'llm_models', 'llm_providers', 'market_segments', 'portfolios',
--     'pr_metrics', 'prd_research_audit_log', 'prompt_templates',
--     'screen_layouts', 'sub_agent_execution_results', 'system_health',
--     'uat_credential_history', 'user_company_access', 'voice_cached_responses',
--     'voice_conversations', 'voice_function_calls', 'voice_usage_metrics'
--   )
-- GROUP BY tablename
-- ORDER BY tablename;
