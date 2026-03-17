-- =============================================================================
-- Migration: 20260317_rls_tighten_phase1.sql
-- SD: SD-LEO-INFRA-RLS-POLICY-TIGHTENING-001
-- Purpose: Tighten RLS policies on ~35 zero-row infrastructure tables
--          and audit/log tables. Phase 1 of semantic RLS audit remediation.
--
-- Strategy:
--   A) Zero-row INFRASTRUCTURE tables: Drop all non-service-role write policies,
--      make SERVICE-ONLY (service_role ALL + authenticated SELECT where appropriate)
--   B) Audit/log tables: Ensure append-only pattern (service_role ALL or INSERT,
--      authenticated SELECT only - no INSERT/UPDATE/DELETE for authenticated)
--
-- Safety:
--   - All tables targeted have 0 rows (verified via pg_stat_user_tables)
--   - Uses DROP POLICY IF EXISTS for idempotency
--   - Does NOT touch core business tables (strategic_directives_v2, product_requirements_v2, etc.)
--   - Does NOT touch app-facing tables (venture_*, chairman_*, voice_*, user_*, etc.)
--   - service_role access is NEVER removed
--
-- Executed by: database-agent (Opus 4.6)
-- Date: 2026-03-17
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION A: Zero-row infrastructure tables -> SERVICE-ONLY
-- Pattern: service_role ALL + authenticated SELECT (read-only dashboard access)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A1: debate_circuit_breaker (0 rows)
-- Current: public ALL (misnamed "service role" but targets {public}), public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service role full access to circuit breaker" ON debate_circuit_breaker;
DROP POLICY IF EXISTS "Allow read access to circuit breaker" ON debate_circuit_breaker;
CREATE POLICY service_role_all_debate_circuit_breaker ON debate_circuit_breaker FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_debate_circuit_breaker ON debate_circuit_breaker FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A2: ehg_design_decisions (0 rows)
-- Current: public INSERT, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated insert to design decisions" ON ehg_design_decisions;
DROP POLICY IF EXISTS "Allow read access to design decisions" ON ehg_design_decisions;
CREATE POLICY service_role_all_ehg_design_decisions ON ehg_design_decisions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_ehg_design_decisions ON ehg_design_decisions FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A3: github_operations (0 rows)
-- Current: public INSERT, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow insert GitHub operations" ON github_operations;
DROP POLICY IF EXISTS "Allow read access to GitHub operations" ON github_operations;
CREATE POLICY service_role_all_github_operations ON github_operations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_github_operations ON github_operations FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A4: leo_prioritization_config (0 rows)
-- Current: public ALL (misnamed "service role"), public SELECT (anon)
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access to leo_prioritization_config" ON leo_prioritization_config;
DROP POLICY IF EXISTS "Anon can read active configs" ON leo_prioritization_config;
CREATE POLICY service_role_all_leo_prioritization_config ON leo_prioritization_config FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_leo_prioritization_config ON leo_prioritization_config FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A5: leo_proposal_transitions (0 rows)
-- Current: public ALL, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "transitions_service_role" ON leo_proposal_transitions;
DROP POLICY IF EXISTS "transitions_select_all" ON leo_proposal_transitions;
CREATE POLICY service_role_all_leo_proposal_transitions ON leo_proposal_transitions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_leo_proposal_transitions ON leo_proposal_transitions FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A6: leo_vetting_outcomes (0 rows)
-- Current: public INSERT, public SELECT, public UPDATE
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service role to insert vetting outcomes" ON leo_vetting_outcomes;
DROP POLICY IF EXISTS "Allow read access to vetting outcomes" ON leo_vetting_outcomes;
DROP POLICY IF EXISTS "Allow human decision updates" ON leo_vetting_outcomes;
CREATE POLICY service_role_all_leo_vetting_outcomes ON leo_vetting_outcomes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_leo_vetting_outcomes ON leo_vetting_outcomes FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A7: pipeline_metrics (0 rows)
-- Current: public ALL, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access to pipeline_metrics" ON pipeline_metrics;
DROP POLICY IF EXISTS "Authenticated users can read pipeline_metrics" ON pipeline_metrics;
CREATE POLICY service_role_all_pipeline_metrics ON pipeline_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_pipeline_metrics ON pipeline_metrics FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A8: pr_metrics (0 rows)
-- Current: public INSERT, public SELECT, public UPDATE
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON pr_metrics;
DROP POLICY IF EXISTS "Enable read access for all users" ON pr_metrics;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON pr_metrics;
CREATE POLICY service_role_all_pr_metrics ON pr_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_pr_metrics ON pr_metrics FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A9: proposal_debate_rounds (0 rows)
-- Current: public ALL, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "proposal_debate_rounds_service_all" ON proposal_debate_rounds;
DROP POLICY IF EXISTS "proposal_debate_rounds_read" ON proposal_debate_rounds;
CREATE POLICY service_role_all_proposal_debate_rounds ON proposal_debate_rounds FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_proposal_debate_rounds ON proposal_debate_rounds FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A10: proposal_debates (0 rows)
-- Current: public ALL, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "proposal_debates_service_all" ON proposal_debates;
DROP POLICY IF EXISTS "proposal_debates_read" ON proposal_debates;
CREATE POLICY service_role_all_proposal_debates ON proposal_debates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_proposal_debates ON proposal_debates FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A11: rca_learning_records (0 rows)
-- Current: service_role ALL, public INSERT, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "public_insert_rca_learning_records" ON rca_learning_records;
DROP POLICY IF EXISTS "public_select_rca_learning_records" ON rca_learning_records;
CREATE POLICY authenticated_select_rca_learning_records ON rca_learning_records FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A12: recursion_events (0 rows)
-- Current: authenticated INSERT, authenticated SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "insert_recursion_events_policy" ON recursion_events;
DROP POLICY IF EXISTS "select_recursion_events_policy" ON recursion_events;
CREATE POLICY service_role_all_recursion_events ON recursion_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_recursion_events ON recursion_events FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A13: remediation_manifests (0 rows)
-- Current: service_role ALL, public INSERT, public SELECT, public UPDATE
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "public_insert_remediation_manifests" ON remediation_manifests;
DROP POLICY IF EXISTS "public_select_remediation_manifests" ON remediation_manifests;
DROP POLICY IF EXISTS "public_update_remediation_manifests" ON remediation_manifests;
CREATE POLICY authenticated_select_remediation_manifests ON remediation_manifests FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A14: sd_burn_rate_snapshots (0 rows)
-- Current: anon ALL (wide open!)
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all for anon" ON sd_burn_rate_snapshots;
CREATE POLICY service_role_all_sd_burn_rate_snapshots ON sd_burn_rate_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_sd_burn_rate_snapshots ON sd_burn_rate_snapshots FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A15: sd_conflict_matrix (0 rows)
-- Current: anon ALL (wide open!)
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all for anon" ON sd_conflict_matrix;
CREATE POLICY service_role_all_sd_conflict_matrix ON sd_conflict_matrix FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_sd_conflict_matrix ON sd_conflict_matrix FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A16: sd_contract_exceptions (0 rows)
-- Current: authenticated INSERT, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sd_contract_exceptions_insert" ON sd_contract_exceptions;
DROP POLICY IF EXISTS "sd_contract_exceptions_select" ON sd_contract_exceptions;
CREATE POLICY service_role_all_sd_contract_exceptions ON sd_contract_exceptions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_sd_contract_exceptions ON sd_contract_exceptions FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A17: sd_contract_violations (0 rows)
-- Current: authenticated INSERT, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sd_contract_violations_insert" ON sd_contract_violations;
DROP POLICY IF EXISTS "sd_contract_violations_select" ON sd_contract_violations;
CREATE POLICY service_role_all_sd_contract_violations ON sd_contract_violations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_sd_contract_violations ON sd_contract_violations FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A18: sd_data_contracts (0 rows)
-- Current: authenticated INSERT, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sd_data_contracts_insert" ON sd_data_contracts;
DROP POLICY IF EXISTS "sd_data_contracts_select" ON sd_data_contracts;
CREATE POLICY service_role_all_sd_data_contracts ON sd_data_contracts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_sd_data_contracts ON sd_data_contracts FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A19: sd_exec_file_operations (0 rows)
-- Current: service_role ALL, authenticated INSERT, authenticated SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_insert_sd_exec_file_operations" ON sd_exec_file_operations;
DROP POLICY IF EXISTS "authenticated_read_sd_exec_file_operations" ON sd_exec_file_operations;
CREATE POLICY authenticated_select_sd_exec_file_operations ON sd_exec_file_operations FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A20: sd_proposals (0 rows)
-- Current: service_role ALL, authenticated SELECT, authenticated UPDATE
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sd_proposals_update_lifecycle" ON sd_proposals;

-- ---------------------------------------------------------------------------
-- A21: sd_session_activity (0 rows)
-- Current: anon ALL (wide open!)
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all for anon" ON sd_session_activity;
CREATE POLICY service_role_all_sd_session_activity ON sd_session_activity FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_sd_session_activity ON sd_session_activity FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A22: sd_stream_completions (0 rows)
-- Current: public ALL (wide open!)
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Stream completions are accessible by all" ON sd_stream_completions;
CREATE POLICY service_role_all_sd_stream_completions ON sd_stream_completions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_sd_stream_completions ON sd_stream_completions FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A23: sd_ux_contracts (0 rows)
-- Current: authenticated INSERT, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sd_ux_contracts_insert" ON sd_ux_contracts;
DROP POLICY IF EXISTS "sd_ux_contracts_select" ON sd_ux_contracts;
CREATE POLICY service_role_all_sd_ux_contracts ON sd_ux_contracts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_sd_ux_contracts ON sd_ux_contracts FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A24: sdip_groups (0 rows)
-- Current: public DELETE, public INSERT, public SELECT, public UPDATE (wide open!)
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "groups_delete_policy" ON sdip_groups;
DROP POLICY IF EXISTS "groups_insert_policy" ON sdip_groups;
DROP POLICY IF EXISTS "groups_select_policy" ON sdip_groups;
DROP POLICY IF EXISTS "groups_update_policy" ON sdip_groups;
CREATE POLICY service_role_all_sdip_groups ON sdip_groups FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_sdip_groups ON sdip_groups FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A25: sdip_submissions (0 rows)
-- Current: public DELETE, public INSERT, public SELECT, public UPDATE (wide open!)
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sdip_delete_policy" ON sdip_submissions;
DROP POLICY IF EXISTS "sdip_insert_policy" ON sdip_submissions;
DROP POLICY IF EXISTS "sdip_select_policy" ON sdip_submissions;
DROP POLICY IF EXISTS "sdip_update_policy" ON sdip_submissions;
CREATE POLICY service_role_all_sdip_submissions ON sdip_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_sdip_submissions ON sdip_submissions FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A26: sensemaking_knowledge_base (0 rows)
-- Current: public ALL (wide open!)
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all" ON sensemaking_knowledge_base;
CREATE POLICY service_role_all_sensemaking_knowledge_base ON sensemaking_knowledge_base FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_sensemaking_knowledge_base ON sensemaking_knowledge_base FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A27: stage_data_contracts (0 rows)
-- Current: public ALL, authenticated SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "modify_stage_data_contracts_policy" ON stage_data_contracts;
DROP POLICY IF EXISTS "select_stage_data_contracts_policy" ON stage_data_contracts;
CREATE POLICY service_role_all_stage_data_contracts ON stage_data_contracts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_stage_data_contracts ON stage_data_contracts FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A28: story_test_mappings (0 rows)
-- Current: public DELETE (qual=false), public INSERT, public SELECT, public UPDATE (qual=false)
-- Note: DELETE and UPDATE already blocked via qual=false, but policy exists on wrong role
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "No deletes from story_test_mappings" ON story_test_mappings;
DROP POLICY IF EXISTS "Allow inserts to story_test_mappings" ON story_test_mappings;
DROP POLICY IF EXISTS "Anyone can read story_test_mappings" ON story_test_mappings;
DROP POLICY IF EXISTS "No updates to story_test_mappings" ON story_test_mappings;
CREATE POLICY service_role_all_story_test_mappings ON story_test_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_story_test_mappings ON story_test_mappings FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A29: tool_usage_ledger (0 rows)
-- Current: service_role ALL, authenticated DELETE (qual blocks), authenticated SELECT, authenticated UPDATE (qual blocks)
-- Target: service_role ALL + authenticated SELECT (remove the no-op block policies)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "ledger_no_delete" ON tool_usage_ledger;
DROP POLICY IF EXISTS "ledger_no_update" ON tool_usage_ledger;

-- ---------------------------------------------------------------------------
-- A30: uat_cases (0 rows)
-- Current: public ALL, public DELETE/INSERT/UPDATE (anon wide open!), public SELECT x3
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "uat_cases_service_all" ON uat_cases;
DROP POLICY IF EXISTS "Anon users can delete uat_cases" ON uat_cases;
DROP POLICY IF EXISTS "Anon users can create uat_cases" ON uat_cases;
DROP POLICY IF EXISTS "Anon users can view all uat_cases" ON uat_cases;
DROP POLICY IF EXISTS "uat_cases_auth_read" ON uat_cases;
DROP POLICY IF EXISTS "uat_cases_chairman_read" ON uat_cases;
DROP POLICY IF EXISTS "Anon users can update uat_cases" ON uat_cases;
CREATE POLICY service_role_all_uat_cases ON uat_cases FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_uat_cases ON uat_cases FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A31: uat_credentials (0 rows)
-- Current: public ALL (wide open!)
-- Target: service_role ALL only (sensitive credentials - no read access for authenticated)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can manage credentials" ON uat_credentials;
CREATE POLICY service_role_all_uat_credentials ON uat_credentials FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- A32: uat_debt_registry (0 rows)
-- Current: public ALL
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service role full access on uat_debt_registry" ON uat_debt_registry;
CREATE POLICY service_role_all_uat_debt_registry ON uat_debt_registry FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_uat_debt_registry ON uat_debt_registry FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A33: uat_defects (0 rows)
-- Current: public ALL, public INSERT (anon), public SELECT x3
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "uat_defects_service_all" ON uat_defects;
DROP POLICY IF EXISTS "Anon users can create uat_defects" ON uat_defects;
DROP POLICY IF EXISTS "Anon users can view all uat_defects" ON uat_defects;
DROP POLICY IF EXISTS "uat_defects_auth_read" ON uat_defects;
DROP POLICY IF EXISTS "uat_defects_chairman_read" ON uat_defects;
CREATE POLICY service_role_all_uat_defects ON uat_defects FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_uat_defects ON uat_defects FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A34: uat_results (0 rows)
-- Current: public ALL, public INSERT (anon), public SELECT x3
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "uat_results_service_all" ON uat_results;
DROP POLICY IF EXISTS "Anon users can create uat_results" ON uat_results;
DROP POLICY IF EXISTS "Anon users can view all uat_results" ON uat_results;
DROP POLICY IF EXISTS "uat_results_auth_read" ON uat_results;
DROP POLICY IF EXISTS "uat_results_chairman_read" ON uat_results;
CREATE POLICY service_role_all_uat_results ON uat_results FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_uat_results ON uat_results FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- A35: uat_test_users (0 rows)
-- Current: public ALL (wide open!)
-- Target: service_role ALL only (sensitive test user data)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can manage test users" ON uat_test_users;
CREATE POLICY service_role_all_uat_test_users ON uat_test_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- SECTION B: Zero-row audit/log tables -> Append-only or SERVICE-ONLY
-- Pattern: service_role ALL + authenticated SELECT (no client-side writes to audit tables)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- B1: audit_triangulation_log (0 rows)
-- Current: public INSERT, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_triangulation_log_insert" ON audit_triangulation_log;
DROP POLICY IF EXISTS "audit_triangulation_log_select" ON audit_triangulation_log;
CREATE POLICY service_role_all_audit_triangulation_log ON audit_triangulation_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_audit_triangulation_log ON audit_triangulation_log FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- B2: nursery_evaluation_log (0 rows)
-- Current: service_role ALL, authenticated INSERT, authenticated SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_insert_nursery_evaluation_log" ON nursery_evaluation_log;

-- ---------------------------------------------------------------------------
-- B3: runtime_audits (0 rows)
-- Current: public INSERT, public SELECT
-- Target: service_role ALL + authenticated SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "runtime_audits_insert" ON runtime_audits;
DROP POLICY IF EXISTS "runtime_audits_select" ON runtime_audits;
CREATE POLICY service_role_all_runtime_audits ON runtime_audits FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_select_runtime_audits ON runtime_audits FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- B4: enhancement_proposal_audit (0 rows)
-- Already correct: service_role ALL + authenticated SELECT
-- No changes needed (verified during audit)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- B5: eva_event_log (0 rows)
-- Already has: service_role ALL + authenticated SELECT
-- No changes needed
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- B6: eva_saga_log (0 rows)
-- Already SERVICE-ONLY: service_role ALL only
-- No changes needed
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- B7: eva_trace_log (0 rows)
-- Already SERVICE-ONLY: service_role ALL only
-- No changes needed
-- ---------------------------------------------------------------------------

COMMIT;

-- =============================================================================
-- ROLLBACK SECTION
-- To undo this migration, execute the following SQL manually.
-- NOTE: This recreates the ORIGINAL overly-permissive policies.
-- =============================================================================
/*
-- ROLLBACK:

BEGIN;

-- A1: debate_circuit_breaker
DROP POLICY IF EXISTS service_role_all_debate_circuit_breaker ON debate_circuit_breaker;
DROP POLICY IF EXISTS authenticated_select_debate_circuit_breaker ON debate_circuit_breaker;
CREATE POLICY "Allow service role full access to circuit breaker" ON debate_circuit_breaker FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow read access to circuit breaker" ON debate_circuit_breaker FOR SELECT TO public USING (true);

-- A2: ehg_design_decisions
DROP POLICY IF EXISTS service_role_all_ehg_design_decisions ON ehg_design_decisions;
DROP POLICY IF EXISTS authenticated_select_ehg_design_decisions ON ehg_design_decisions;
CREATE POLICY "Allow authenticated insert to design decisions" ON ehg_design_decisions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow read access to design decisions" ON ehg_design_decisions FOR SELECT TO public USING (true);

-- A3: github_operations
DROP POLICY IF EXISTS service_role_all_github_operations ON github_operations;
DROP POLICY IF EXISTS authenticated_select_github_operations ON github_operations;
CREATE POLICY "Allow insert GitHub operations" ON github_operations FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow read access to GitHub operations" ON github_operations FOR SELECT TO public USING (true);

-- A4: leo_prioritization_config
DROP POLICY IF EXISTS service_role_all_leo_prioritization_config ON leo_prioritization_config;
DROP POLICY IF EXISTS authenticated_select_leo_prioritization_config ON leo_prioritization_config;
CREATE POLICY "Service role full access to leo_prioritization_config" ON leo_prioritization_config FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anon can read active configs" ON leo_prioritization_config FOR SELECT TO public USING (true);

-- A5: leo_proposal_transitions
DROP POLICY IF EXISTS service_role_all_leo_proposal_transitions ON leo_proposal_transitions;
DROP POLICY IF EXISTS authenticated_select_leo_proposal_transitions ON leo_proposal_transitions;
CREATE POLICY "transitions_service_role" ON leo_proposal_transitions FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "transitions_select_all" ON leo_proposal_transitions FOR SELECT TO public USING (true);

-- A6: leo_vetting_outcomes
DROP POLICY IF EXISTS service_role_all_leo_vetting_outcomes ON leo_vetting_outcomes;
DROP POLICY IF EXISTS authenticated_select_leo_vetting_outcomes ON leo_vetting_outcomes;
CREATE POLICY "Allow service role to insert vetting outcomes" ON leo_vetting_outcomes FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow read access to vetting outcomes" ON leo_vetting_outcomes FOR SELECT TO public USING (true);
CREATE POLICY "Allow human decision updates" ON leo_vetting_outcomes FOR UPDATE TO public USING (true) WITH CHECK (true);

-- A7: pipeline_metrics
DROP POLICY IF EXISTS service_role_all_pipeline_metrics ON pipeline_metrics;
DROP POLICY IF EXISTS authenticated_select_pipeline_metrics ON pipeline_metrics;
CREATE POLICY "Service role full access to pipeline_metrics" ON pipeline_metrics FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can read pipeline_metrics" ON pipeline_metrics FOR SELECT TO public USING (true);

-- A8: pr_metrics
DROP POLICY IF EXISTS service_role_all_pr_metrics ON pr_metrics;
DROP POLICY IF EXISTS authenticated_select_pr_metrics ON pr_metrics;
CREATE POLICY "Enable insert for authenticated users" ON pr_metrics FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Enable read access for all users" ON pr_metrics FOR SELECT TO public USING (true);
CREATE POLICY "Enable update for authenticated users" ON pr_metrics FOR UPDATE TO public USING (true) WITH CHECK (true);

-- A9: proposal_debate_rounds
DROP POLICY IF EXISTS service_role_all_proposal_debate_rounds ON proposal_debate_rounds;
DROP POLICY IF EXISTS authenticated_select_proposal_debate_rounds ON proposal_debate_rounds;
CREATE POLICY "proposal_debate_rounds_service_all" ON proposal_debate_rounds FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "proposal_debate_rounds_read" ON proposal_debate_rounds FOR SELECT TO public USING (true);

-- A10: proposal_debates
DROP POLICY IF EXISTS service_role_all_proposal_debates ON proposal_debates;
DROP POLICY IF EXISTS authenticated_select_proposal_debates ON proposal_debates;
CREATE POLICY "proposal_debates_service_all" ON proposal_debates FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "proposal_debates_read" ON proposal_debates FOR SELECT TO public USING (true);

-- A11: rca_learning_records
DROP POLICY IF EXISTS authenticated_select_rca_learning_records ON rca_learning_records;
CREATE POLICY "public_insert_rca_learning_records" ON rca_learning_records FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "public_select_rca_learning_records" ON rca_learning_records FOR SELECT TO public USING (true);

-- A12: recursion_events
DROP POLICY IF EXISTS service_role_all_recursion_events ON recursion_events;
DROP POLICY IF EXISTS authenticated_select_recursion_events ON recursion_events;
CREATE POLICY "insert_recursion_events_policy" ON recursion_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "select_recursion_events_policy" ON recursion_events FOR SELECT TO authenticated USING (true);

-- A13: remediation_manifests
DROP POLICY IF EXISTS authenticated_select_remediation_manifests ON remediation_manifests;
CREATE POLICY "public_insert_remediation_manifests" ON remediation_manifests FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "public_select_remediation_manifests" ON remediation_manifests FOR SELECT TO public USING (true);
CREATE POLICY "public_update_remediation_manifests" ON remediation_manifests FOR UPDATE TO public USING (true) WITH CHECK (true);

-- A14: sd_burn_rate_snapshots
DROP POLICY IF EXISTS service_role_all_sd_burn_rate_snapshots ON sd_burn_rate_snapshots;
DROP POLICY IF EXISTS authenticated_select_sd_burn_rate_snapshots ON sd_burn_rate_snapshots;
CREATE POLICY "Allow all for anon" ON sd_burn_rate_snapshots FOR ALL TO anon USING (true) WITH CHECK (true);

-- A15: sd_conflict_matrix
DROP POLICY IF EXISTS service_role_all_sd_conflict_matrix ON sd_conflict_matrix;
DROP POLICY IF EXISTS authenticated_select_sd_conflict_matrix ON sd_conflict_matrix;
CREATE POLICY "Allow all for anon" ON sd_conflict_matrix FOR ALL TO anon USING (true) WITH CHECK (true);

-- A16: sd_contract_exceptions
DROP POLICY IF EXISTS service_role_all_sd_contract_exceptions ON sd_contract_exceptions;
DROP POLICY IF EXISTS authenticated_select_sd_contract_exceptions ON sd_contract_exceptions;
CREATE POLICY "sd_contract_exceptions_insert" ON sd_contract_exceptions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sd_contract_exceptions_select" ON sd_contract_exceptions FOR SELECT TO public USING (true);

-- A17: sd_contract_violations
DROP POLICY IF EXISTS service_role_all_sd_contract_violations ON sd_contract_violations;
DROP POLICY IF EXISTS authenticated_select_sd_contract_violations ON sd_contract_violations;
CREATE POLICY "sd_contract_violations_insert" ON sd_contract_violations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sd_contract_violations_select" ON sd_contract_violations FOR SELECT TO public USING (true);

-- A18: sd_data_contracts
DROP POLICY IF EXISTS service_role_all_sd_data_contracts ON sd_data_contracts;
DROP POLICY IF EXISTS authenticated_select_sd_data_contracts ON sd_data_contracts;
CREATE POLICY "sd_data_contracts_insert" ON sd_data_contracts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sd_data_contracts_select" ON sd_data_contracts FOR SELECT TO public USING (true);

-- A19: sd_exec_file_operations
DROP POLICY IF EXISTS authenticated_select_sd_exec_file_operations ON sd_exec_file_operations;
CREATE POLICY "authenticated_insert_sd_exec_file_operations" ON sd_exec_file_operations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_read_sd_exec_file_operations" ON sd_exec_file_operations FOR SELECT TO authenticated USING (true);

-- A20: sd_proposals
CREATE POLICY "sd_proposals_update_lifecycle" ON sd_proposals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- A21: sd_session_activity
DROP POLICY IF EXISTS service_role_all_sd_session_activity ON sd_session_activity;
DROP POLICY IF EXISTS authenticated_select_sd_session_activity ON sd_session_activity;
CREATE POLICY "Allow all for anon" ON sd_session_activity FOR ALL TO anon USING (true) WITH CHECK (true);

-- A22: sd_stream_completions
DROP POLICY IF EXISTS service_role_all_sd_stream_completions ON sd_stream_completions;
DROP POLICY IF EXISTS authenticated_select_sd_stream_completions ON sd_stream_completions;
CREATE POLICY "Stream completions are accessible by all" ON sd_stream_completions FOR ALL TO public USING (true) WITH CHECK (true);

-- A23: sd_ux_contracts
DROP POLICY IF EXISTS service_role_all_sd_ux_contracts ON sd_ux_contracts;
DROP POLICY IF EXISTS authenticated_select_sd_ux_contracts ON sd_ux_contracts;
CREATE POLICY "sd_ux_contracts_insert" ON sd_ux_contracts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sd_ux_contracts_select" ON sd_ux_contracts FOR SELECT TO public USING (true);

-- A24: sdip_groups
DROP POLICY IF EXISTS service_role_all_sdip_groups ON sdip_groups;
DROP POLICY IF EXISTS authenticated_select_sdip_groups ON sdip_groups;
CREATE POLICY "groups_delete_policy" ON sdip_groups FOR DELETE TO public USING (true);
CREATE POLICY "groups_insert_policy" ON sdip_groups FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "groups_select_policy" ON sdip_groups FOR SELECT TO public USING (true);
CREATE POLICY "groups_update_policy" ON sdip_groups FOR UPDATE TO public USING (true) WITH CHECK (true);

-- A25: sdip_submissions
DROP POLICY IF EXISTS service_role_all_sdip_submissions ON sdip_submissions;
DROP POLICY IF EXISTS authenticated_select_sdip_submissions ON sdip_submissions;
CREATE POLICY "sdip_delete_policy" ON sdip_submissions FOR DELETE TO public USING (true);
CREATE POLICY "sdip_insert_policy" ON sdip_submissions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "sdip_select_policy" ON sdip_submissions FOR SELECT TO public USING (true);
CREATE POLICY "sdip_update_policy" ON sdip_submissions FOR UPDATE TO public USING (true) WITH CHECK (true);

-- A26: sensemaking_knowledge_base
DROP POLICY IF EXISTS service_role_all_sensemaking_knowledge_base ON sensemaking_knowledge_base;
DROP POLICY IF EXISTS authenticated_select_sensemaking_knowledge_base ON sensemaking_knowledge_base;
CREATE POLICY "service_role_all" ON sensemaking_knowledge_base FOR ALL TO public USING (true) WITH CHECK (true);

-- A27: stage_data_contracts
DROP POLICY IF EXISTS service_role_all_stage_data_contracts ON stage_data_contracts;
DROP POLICY IF EXISTS authenticated_select_stage_data_contracts ON stage_data_contracts;
CREATE POLICY "modify_stage_data_contracts_policy" ON stage_data_contracts FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "select_stage_data_contracts_policy" ON stage_data_contracts FOR SELECT TO authenticated USING (true);

-- A28: story_test_mappings
DROP POLICY IF EXISTS service_role_all_story_test_mappings ON story_test_mappings;
DROP POLICY IF EXISTS authenticated_select_story_test_mappings ON story_test_mappings;
CREATE POLICY "No deletes from story_test_mappings" ON story_test_mappings FOR DELETE TO public USING (false);
CREATE POLICY "Allow inserts to story_test_mappings" ON story_test_mappings FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can read story_test_mappings" ON story_test_mappings FOR SELECT TO public USING (true);
CREATE POLICY "No updates to story_test_mappings" ON story_test_mappings FOR UPDATE TO public USING (false);

-- A29: tool_usage_ledger
CREATE POLICY "ledger_no_delete" ON tool_usage_ledger FOR DELETE TO authenticated USING (false);
CREATE POLICY "ledger_no_update" ON tool_usage_ledger FOR UPDATE TO authenticated USING (false);

-- A30: uat_cases
DROP POLICY IF EXISTS service_role_all_uat_cases ON uat_cases;
DROP POLICY IF EXISTS authenticated_select_uat_cases ON uat_cases;
CREATE POLICY "uat_cases_service_all" ON uat_cases FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anon users can delete uat_cases" ON uat_cases FOR DELETE TO public USING (true);
CREATE POLICY "Anon users can create uat_cases" ON uat_cases FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anon users can view all uat_cases" ON uat_cases FOR SELECT TO public USING (true);
CREATE POLICY "uat_cases_auth_read" ON uat_cases FOR SELECT TO public USING (true);
CREATE POLICY "uat_cases_chairman_read" ON uat_cases FOR SELECT TO public USING (true);
CREATE POLICY "Anon users can update uat_cases" ON uat_cases FOR UPDATE TO public USING (true) WITH CHECK (true);

-- A31: uat_credentials
DROP POLICY IF EXISTS service_role_all_uat_credentials ON uat_credentials;
CREATE POLICY "Service role can manage credentials" ON uat_credentials FOR ALL TO public USING (true) WITH CHECK (true);

-- A32: uat_debt_registry
DROP POLICY IF EXISTS service_role_all_uat_debt_registry ON uat_debt_registry;
DROP POLICY IF EXISTS authenticated_select_uat_debt_registry ON uat_debt_registry;
CREATE POLICY "Allow service role full access on uat_debt_registry" ON uat_debt_registry FOR ALL TO public USING (true) WITH CHECK (true);

-- A33: uat_defects
DROP POLICY IF EXISTS service_role_all_uat_defects ON uat_defects;
DROP POLICY IF EXISTS authenticated_select_uat_defects ON uat_defects;
CREATE POLICY "uat_defects_service_all" ON uat_defects FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anon users can create uat_defects" ON uat_defects FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anon users can view all uat_defects" ON uat_defects FOR SELECT TO public USING (true);
CREATE POLICY "uat_defects_auth_read" ON uat_defects FOR SELECT TO public USING (true);
CREATE POLICY "uat_defects_chairman_read" ON uat_defects FOR SELECT TO public USING (true);

-- A34: uat_results
DROP POLICY IF EXISTS service_role_all_uat_results ON uat_results;
DROP POLICY IF EXISTS authenticated_select_uat_results ON uat_results;
CREATE POLICY "uat_results_service_all" ON uat_results FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anon users can create uat_results" ON uat_results FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anon users can view all uat_results" ON uat_results FOR SELECT TO public USING (true);
CREATE POLICY "uat_results_auth_read" ON uat_results FOR SELECT TO public USING (true);
CREATE POLICY "uat_results_chairman_read" ON uat_results FOR SELECT TO public USING (true);

-- A35: uat_test_users
DROP POLICY IF EXISTS service_role_all_uat_test_users ON uat_test_users;
CREATE POLICY "Service role can manage test users" ON uat_test_users FOR ALL TO public USING (true) WITH CHECK (true);

-- B1: audit_triangulation_log
DROP POLICY IF EXISTS service_role_all_audit_triangulation_log ON audit_triangulation_log;
DROP POLICY IF EXISTS authenticated_select_audit_triangulation_log ON audit_triangulation_log;
CREATE POLICY "audit_triangulation_log_insert" ON audit_triangulation_log FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "audit_triangulation_log_select" ON audit_triangulation_log FOR SELECT TO public USING (true);

-- B2: nursery_evaluation_log
CREATE POLICY "authenticated_insert_nursery_evaluation_log" ON nursery_evaluation_log FOR INSERT TO authenticated WITH CHECK (true);

-- B3: runtime_audits
DROP POLICY IF EXISTS service_role_all_runtime_audits ON runtime_audits;
DROP POLICY IF EXISTS authenticated_select_runtime_audits ON runtime_audits;
CREATE POLICY "runtime_audits_insert" ON runtime_audits FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "runtime_audits_select" ON runtime_audits FOR SELECT TO public USING (true);

COMMIT;
*/
