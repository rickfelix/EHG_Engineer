-- Migration: EVA Security Lockdown (R2)
-- SD Reference: SD-EVA-R2-FIX-SECURITY-001
-- Audit Finding: DB NEW-002 CRITICAL (permissive write policies), DB NEW-003 HIGH (RLS disabled)
-- Generated: 2026-02-15
--
-- Purpose: Lock down ALL remaining eva_* tables with overly permissive write policies
-- - Replace public/anon role write policies with service_role-only
-- - Replace authenticated USING(TRUE) write policies with service_role-only
-- - Fix anti-pattern: public role + auth.role() check -> proper role grants
-- - Enable RLS on tables missing it (eva_config, eva_event_ledger, eva_events_dlq)
-- - Clean up duplicate policies
--
-- Tables NOT touched (already fixed in 20260214_eva_rls_tightening.sql):
--   eva_ventures, eva_events (except duplicate cleanup), eva_decisions, eva_audit_log
--
-- Tables NOT touched (already properly secured):
--   eva_artifact_dependencies, eva_automation_executions, eva_automation_rules,
--   eva_circuit_breaker, eva_circuit_state_transitions, eva_idea_categories,
--   eva_orchestration_events, eva_stage_gate_results, eva_sync_state,
--   eva_todoist_intake, eva_trace_log, eva_weekly_review_templates,
--   eva_youtube_intake, eva_saga_log, governance.eva_authority_levels

BEGIN;

-- ============================================================================
-- 1. eva_actions - Replace public role write policies with service_role
-- ============================================================================

-- Drop overly permissive public-role write policies
DROP POLICY IF EXISTS eva_actions_company_insert ON eva_actions;
DROP POLICY IF EXISTS eva_actions_company_update ON eva_actions;
DROP POLICY IF EXISTS eva_actions_company_delete ON eva_actions;

-- Service role has full write access
CREATE POLICY eva_actions_service_role_write
ON eva_actions
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

-- Keep existing SELECT policy: eva_actions_company_access (company-scoped, public role)
-- This is acceptable for read-only access

-- ============================================================================
-- 2. eva_agent_communications - Replace authenticated USING(TRUE) writes
-- ============================================================================

-- Drop overly permissive write policies
DROP POLICY IF EXISTS "Allow insert for authenticated" ON eva_agent_communications;
DROP POLICY IF EXISTS "Allow update for authenticated" ON eva_agent_communications;
DROP POLICY IF EXISTS eva_agent_communications_delete ON eva_agent_communications;

-- Service role has full write access
CREATE POLICY eva_agent_comms_service_role_write
ON eva_agent_communications
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

-- Keep existing SELECT policy: eva_comms_company_access (company-scoped via session)

-- ============================================================================
-- 3. eva_orchestration_sessions - Replace public role write policies
-- ============================================================================

-- Drop overly permissive public-role write policies
DROP POLICY IF EXISTS eva_sessions_company_insert ON eva_orchestration_sessions;
DROP POLICY IF EXISTS eva_sessions_company_update ON eva_orchestration_sessions;
DROP POLICY IF EXISTS eva_orchestration_sessions_company_delete ON eva_orchestration_sessions;

-- Service role has full write access
CREATE POLICY eva_orch_sessions_service_role_write
ON eva_orchestration_sessions
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

-- Keep existing SELECT policy: eva_sessions_company_access (company-scoped)

-- ============================================================================
-- 4. eva_event_log - Fix anti-pattern: public + auth.role() check
-- ============================================================================

-- Drop anti-pattern policies (public role checking auth.role())
DROP POLICY IF EXISTS "Service role full access on eva_event_log" ON eva_event_log;
DROP POLICY IF EXISTS "Authenticated users can read eva_event_log" ON eva_event_log;

-- Proper role-based policies
CREATE POLICY eva_event_log_service_role_all
ON eva_event_log
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

CREATE POLICY eva_event_log_authenticated_select
ON eva_event_log
FOR SELECT
TO authenticated
USING (TRUE);

-- ============================================================================
-- 5. eva_scheduler_heartbeat - Fix anti-pattern: public + auth.role() check
-- ============================================================================

DROP POLICY IF EXISTS service_role_esh ON eva_scheduler_heartbeat;
DROP POLICY IF EXISTS authenticated_read_esh ON eva_scheduler_heartbeat;

CREATE POLICY eva_scheduler_heartbeat_service_role_all
ON eva_scheduler_heartbeat
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

CREATE POLICY eva_scheduler_heartbeat_authenticated_select
ON eva_scheduler_heartbeat
FOR SELECT
TO authenticated
USING (TRUE);

-- ============================================================================
-- 6. eva_scheduler_metrics - Fix anti-pattern: public + auth.role() check
-- ============================================================================

DROP POLICY IF EXISTS service_role_esm ON eva_scheduler_metrics;
DROP POLICY IF EXISTS authenticated_read_esm ON eva_scheduler_metrics;

CREATE POLICY eva_scheduler_metrics_service_role_all
ON eva_scheduler_metrics
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

CREATE POLICY eva_scheduler_metrics_authenticated_select
ON eva_scheduler_metrics
FOR SELECT
TO authenticated
USING (TRUE);

-- ============================================================================
-- 7. eva_scheduler_queue - Fix anti-pattern: public + auth.role() check
-- ============================================================================

DROP POLICY IF EXISTS service_role_esq ON eva_scheduler_queue;
DROP POLICY IF EXISTS authenticated_read_esq ON eva_scheduler_queue;

CREATE POLICY eva_scheduler_queue_service_role_all
ON eva_scheduler_queue
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

CREATE POLICY eva_scheduler_queue_authenticated_select
ON eva_scheduler_queue
FOR SELECT
TO authenticated
USING (TRUE);

-- ============================================================================
-- 8. evaluation_profiles - Replace wide-open public ALL
-- ============================================================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS evaluation_profiles_write_service ON evaluation_profiles;
DROP POLICY IF EXISTS evaluation_profiles_read_all ON evaluation_profiles;

-- Service role has full write access
CREATE POLICY evaluation_profiles_service_role_all
ON evaluation_profiles
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

-- Authenticated users can read (reference data)
CREATE POLICY evaluation_profiles_authenticated_select
ON evaluation_profiles
FOR SELECT
TO authenticated
USING (TRUE);

-- ============================================================================
-- 9. evaluation_profile_outcomes - Replace wide-open public ALL
-- ============================================================================

DROP POLICY IF EXISTS epo_write_service ON evaluation_profile_outcomes;
DROP POLICY IF EXISTS epo_read_all ON evaluation_profile_outcomes;

CREATE POLICY eval_profile_outcomes_service_role_all
ON evaluation_profile_outcomes
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

CREATE POLICY eval_profile_outcomes_authenticated_select
ON evaluation_profile_outcomes
FOR SELECT
TO authenticated
USING (TRUE);

-- ============================================================================
-- 10. Enable RLS on tables missing it
-- ============================================================================

-- eva_config: internal configuration, service_role only
ALTER TABLE eva_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY eva_config_service_role_all
ON eva_config
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

CREATE POLICY eva_config_authenticated_select
ON eva_config
FOR SELECT
TO authenticated
USING (TRUE);

-- eva_event_ledger: event sourcing table, service_role only writes
ALTER TABLE eva_event_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY eva_event_ledger_service_role_all
ON eva_event_ledger
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

CREATE POLICY eva_event_ledger_authenticated_select
ON eva_event_ledger
FOR SELECT
TO authenticated
USING (TRUE);

-- eva_events_dlq: dead letter queue, service_role only
ALTER TABLE eva_events_dlq ENABLE ROW LEVEL SECURITY;

CREATE POLICY eva_events_dlq_service_role_all
ON eva_events_dlq
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

CREATE POLICY eva_events_dlq_authenticated_select
ON eva_events_dlq
FOR SELECT
TO authenticated
USING (TRUE);

-- ============================================================================
-- 11. Cleanup: Remove duplicate policy on eva_events
-- ============================================================================

-- eva_events has both eva_events_service_role_all AND service_role_all_eva_events
-- Keep eva_events_service_role_all (from R1 migration), drop the duplicate
DROP POLICY IF EXISTS service_role_all_eva_events ON eva_events;

COMMIT;

-- ============================================================================
-- ROLLBACK (manual execution if needed)
-- ============================================================================
-- To rollback, re-create the original policies. This is destructive and should
-- only be used in emergency. The original policies were:
--
-- eva_actions: public role INSERT/UPDATE/DELETE with company_id subquery
-- eva_agent_communications: authenticated INSERT/UPDATE/DELETE with USING(TRUE)
-- eva_orchestration_sessions: public role INSERT/UPDATE/DELETE with company_id subquery
-- eva_event_log: public ALL with auth.role() = 'service_role' check
-- eva_scheduler_*: public ALL with auth.role() = 'service_role' check
-- evaluation_profiles: public ALL with USING(TRUE)
-- evaluation_profile_outcomes: public ALL with USING(TRUE)
-- eva_config, eva_event_ledger, eva_events_dlq: no RLS
