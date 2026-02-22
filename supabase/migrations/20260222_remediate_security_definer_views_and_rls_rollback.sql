-- Rollback: Remediate SECURITY DEFINER Views and Enable RLS on agent_skills
-- SD: SD-MAN-GEN-TITLE-REMEDIATE-SECURITY-001
-- Date: 2026-02-22
--
-- Reverses all changes from the forward migration.

BEGIN;

-- PHASE 3 ROLLBACK: Restore grants to anon and authenticated
GRANT SELECT ON public.agent_skills TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_skills TO authenticated;

-- PHASE 2 ROLLBACK: Remove RLS policy and disable RLS
DROP POLICY IF EXISTS service_role_full_access ON public.agent_skills;
ALTER TABLE public.agent_skills DISABLE ROW LEVEL SECURITY;

-- PHASE 1 ROLLBACK: Revert views to SECURITY DEFINER (remove security_invoker)
ALTER VIEW public.v_active_sessions RESET (security_invoker);
ALTER VIEW public.v_agent_departments RESET (security_invoker);
ALTER VIEW public.v_agent_effective_capabilities RESET (security_invoker);
ALTER VIEW public.v_chairman_escalation_events RESET (security_invoker);
ALTER VIEW public.v_chairman_pending_decisions RESET (security_invoker);
ALTER VIEW public.v_cross_venture_patterns RESET (security_invoker);
ALTER VIEW public.v_department_membership RESET (security_invoker);
ALTER VIEW public.v_eva_accuracy RESET (security_invoker);
ALTER VIEW public.v_flywheel_velocity RESET (security_invoker);
ALTER VIEW public.v_live_sessions RESET (security_invoker);
ALTER VIEW public.v_okr_hierarchy RESET (security_invoker);

COMMIT;
