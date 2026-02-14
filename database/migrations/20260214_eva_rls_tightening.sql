-- Migration: EVA RLS Policy Tightening
-- SD Reference: SD-EVA-FIX-DB-SCHEMA-001
-- Audit Finding: HIGH-001 - Permissive USING(TRUE) RLS policies
-- Generated: 2026-02-14
--
-- Purpose: Replace overly permissive admin policies with role-based access control
-- - Drop USING(TRUE) admin policies on EVA core tables
-- - Implement user-scoped SELECT policies (ventures owned by user)
-- - Restrict INSERT/UPDATE/DELETE to service_role only
-- - Keep public reference data policies unchanged (content_types, screen_layouts, evaluation_profiles)

-- ============================================================================
-- EVA Ventures Table
-- ============================================================================

-- Drop overly permissive policy
DROP POLICY IF EXISTS eva_ventures_admin_access ON eva_ventures;

-- User can view their own ventures (via ventures.created_by)
CREATE POLICY eva_ventures_select_own
ON eva_ventures
FOR SELECT
TO authenticated
USING (
  venture_id IN (
    SELECT id FROM ventures WHERE created_by = auth.uid()
  )
);

-- Service role has full access
CREATE POLICY eva_ventures_service_role_all
ON eva_ventures
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

-- ============================================================================
-- EVA Events Table
-- ============================================================================

-- Drop overly permissive policy
DROP POLICY IF EXISTS eva_events_admin_access ON eva_events;

-- User can view events for their ventures (via eva_ventures → ventures.created_by)
CREATE POLICY eva_events_select_user_ventures
ON eva_events
FOR SELECT
TO authenticated
USING (
  eva_venture_id IN (
    SELECT ev.id FROM eva_ventures ev
    JOIN ventures v ON ev.venture_id = v.id
    WHERE v.created_by = auth.uid()
  )
);

-- Service role has full access
CREATE POLICY eva_events_service_role_all
ON eva_events
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

-- ============================================================================
-- EVA Decisions Table
-- ============================================================================

-- Drop overly permissive policy
DROP POLICY IF EXISTS eva_decisions_admin_access ON eva_decisions;

-- User can view decisions for their ventures (via eva_ventures → ventures.created_by)
CREATE POLICY eva_decisions_select_user_ventures
ON eva_decisions
FOR SELECT
TO authenticated
USING (
  eva_venture_id IN (
    SELECT ev.id FROM eva_ventures ev
    JOIN ventures v ON ev.venture_id = v.id
    WHERE v.created_by = auth.uid()
  )
);

-- Service role can insert/update/delete
CREATE POLICY eva_decisions_service_role_write
ON eva_decisions
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

-- ============================================================================
-- EVA Audit Log Table
-- ============================================================================

-- Drop overly permissive policy
DROP POLICY IF EXISTS eva_audit_log_admin_access ON eva_audit_log;

-- User can view audit logs for their ventures (via eva_ventures → ventures.created_by)
CREATE POLICY eva_audit_log_select_user_ventures
ON eva_audit_log
FOR SELECT
TO authenticated
USING (
  eva_venture_id IN (
    SELECT ev.id FROM eva_ventures ev
    JOIN ventures v ON ev.venture_id = v.id
    WHERE v.created_by = auth.uid()
  )
);

-- Service role can insert audit entries
CREATE POLICY eva_audit_log_service_role_insert
ON eva_audit_log
FOR INSERT
TO service_role
WITH CHECK (TRUE);

-- Service role can view all audit logs
CREATE POLICY eva_audit_log_service_role_select
ON eva_audit_log
FOR SELECT
TO service_role
USING (TRUE);

-- ============================================================================
-- Content Management Tables (No Changes)
-- ============================================================================
-- The following policies use USING(TRUE) but are acceptable as public reference data:
-- - content_types_select_all (read-only reference)
-- - screen_layouts_select_all (read-only reference)
-- - evaluation_profiles_read_all (read-only reference)
-- These remain unchanged as they represent public metadata.
