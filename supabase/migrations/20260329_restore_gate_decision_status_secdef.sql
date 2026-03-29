-- ============================================================================
-- Restore SECURITY DEFINER on get_gate_decision_status
-- ============================================================================
-- Problem: The security_definer_audit migration (20260317) changed this
-- function to SECURITY INVOKER. But chairman_decisions has RLS that blocks
-- anon/authenticated reads. The function was intentionally SECURITY DEFINER
-- to bypass RLS and return gate status to the frontend.
--
-- With SECURITY INVOKER, the SELECT returns nothing, the function falls
-- through to its INSERT path, and creates duplicate PENDING decisions
-- that collide on idx_chairman_decisions_unique_pending.
--
-- Fix: Restore SECURITY DEFINER with restricted search_path.
-- ============================================================================

ALTER FUNCTION public.get_gate_decision_status(UUID, INTEGER) SECURITY DEFINER;
ALTER FUNCTION public.get_gate_decision_status(UUID, INTEGER) SET search_path TO 'public';
