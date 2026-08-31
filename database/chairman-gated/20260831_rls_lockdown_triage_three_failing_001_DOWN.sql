-- Rollback for 20260831_rls_lockdown_triage_three_failing_001.sql
-- Restores the exact pre-migration grants and disables RLS again (re-opens the exposure;
-- only apply if an undiscovered legitimate anon/authenticated caller surfaces post-apply).

GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.claim_rejects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.coverage_matrix TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.coverage_matrix_rotation_runs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.door_routing_ledger TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.north_star TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.scope_completion_chain TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.selection_postures TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.sourcing_chairman_queue TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.v_hc_flag_enabled TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.v_id TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.v_s22_flag_enabled TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.venture_preview_instances TO anon, authenticated;

ALTER TABLE public.claim_rejects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_matrix DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_matrix_rotation_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.door_routing_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.north_star DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_completion_chain DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.selection_postures DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_chairman_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_hc_flag_enabled DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_id DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_s22_flag_enabled DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.venture_preview_instances DISABLE ROW LEVEL SECURITY;
