-- Migration: Remediate SECURITY DEFINER Views and Enable RLS on agent_skills
-- SD: SD-MAN-GEN-TITLE-REMEDIATE-SECURITY-001
-- Date: 2026-02-22
--
-- This migration addresses two security issues:
-- 1. 11 views using SECURITY DEFINER (bypasses RLS) - switch to SECURITY INVOKER
-- 2. agent_skills table missing RLS - enable RLS with service_role-only policy

BEGIN;

-- PHASE 1: Fix SECURITY DEFINER views
-- These views currently bypass RLS because they run as the view creator's role.
-- Setting security_invoker = on makes them respect the calling user's permissions.
ALTER VIEW public.v_active_sessions SET (security_invoker = on);
ALTER VIEW public.v_agent_departments SET (security_invoker = on);
ALTER VIEW public.v_agent_effective_capabilities SET (security_invoker = on);
ALTER VIEW public.v_chairman_escalation_events SET (security_invoker = on);
ALTER VIEW public.v_chairman_pending_decisions SET (security_invoker = on);
ALTER VIEW public.v_cross_venture_patterns SET (security_invoker = on);
ALTER VIEW public.v_department_membership SET (security_invoker = on);
ALTER VIEW public.v_eva_accuracy SET (security_invoker = on);
ALTER VIEW public.v_flywheel_velocity SET (security_invoker = on);
ALTER VIEW public.v_live_sessions SET (security_invoker = on);
ALTER VIEW public.v_okr_hierarchy SET (security_invoker = on);

-- PHASE 2: Enable RLS on agent_skills
-- This table had no RLS policy, meaning any authenticated user could read/write.
ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

-- Create service_role-only access policy
CREATE POLICY service_role_full_access
  ON public.agent_skills
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- PHASE 3: Revoke excess grants
-- Remove direct grants to anon and authenticated roles.
-- Access should only be through service_role via the API.
REVOKE ALL ON public.agent_skills FROM anon;
REVOKE ALL ON public.agent_skills FROM authenticated;

COMMIT;
