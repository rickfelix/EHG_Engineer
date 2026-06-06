-- Re-grant EXECUTE on get_gate_decision_status to authenticated + anon.
-- Root cause: a later CREATE OR REPLACE in
--   ehg/supabase/migrations/20260427_001_add_approval_type_to_chairman_decisions.sql
-- recreated the function, dropping the EXECUTE grants that
--   database/migrations/20260420_fix_get_gate_decision_status_remove_insert.sql
-- had established. Live proacl was {postgres=X/postgres,service_role=X/postgres},
-- so the `authenticated` role hit `42501 permission denied for function
-- get_gate_decision_status` from the EHG hook usePendingGateDecision.ts
-- (supabase.rpc) on the venture detail page.
--
-- Fix: idempotent GRANT EXECUTE. Function body and SECURITY DEFINER setting
-- are intentionally LEFT UNCHANGED — this migration only restores the grant.
-- Signature is unambiguous: exactly one public.get_gate_decision_status(uuid, integer).
--
-- @approved-by: codestreetlabs@gmail.com

GRANT EXECUTE ON FUNCTION public.get_gate_decision_status(uuid, integer) TO authenticated, anon;
