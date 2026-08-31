-- @approved-by: <pending -- apply via the chairman's 3-factor ceremony>
-- =============================================================================
-- Enable RLS on 12 tables flagged by security-linter-sentinel.yml (rls_disabled_in_public
-- + sensitive_columns_exposed) -- SD-LEO-FIX-TRIAGE-THREE-FAILING-001, leg (a)
-- =============================================================================
-- STAGED, NOT APPLIED. This is a security-posture change (RLS enable + grant revoke),
-- which under this repo's own precedent (database/migrations/20260731_coordination_receipts_
-- rls_posture.sql) requires chairman approval, not a worker's unilateral judgment. Lives
-- under database/chairman-gated/ so the handoff pipeline's auto-apply (which scans
-- database/migrations/, database/manual-updates/, supabase/migrations/) never picks it up --
-- see database/chairman-gated/README.md for the exact 2-step apply ceremony.
--
-- requires-chairman-apply
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- EVIDENCE (measured live against pg_catalog + information_schema, 2026-08-31)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- security-linter-sentinel.yml (--strict) has failed every weekly/manual run since at least
-- 2026-06-29 (10 consecutive runs checked, all failure) -- it is failing on REAL findings, not
-- a broken script. As of this SD:
--   rls_disabled_in_public: 12 tables
--   sensitive_columns_exposed (session_id, no RLS): 1 table (claim_rejects, subset of the 12)
--
-- Confirmed via information_schema.role_table_grants: venture_preview_instances grants BOTH
-- anon and authenticated full SELECT/INSERT/UPDATE/DELETE/TRUNCATE with RLS disabled -- a live,
-- unauthenticated read/write/delete surface via PostgREST today.
--
-- Confirmed via repo-wide grep (no matches in src/ or any client-facing directory) that none of
-- the 12 tables below are referenced by frontend/browser client code -- every known consumer is
-- backend service-role automation (lib/venture-deploy/preview.js, lib/eva/stage-templates/...),
-- which BYPASSES RLS regardless of this change. Enabling RLS with no additional policies
-- therefore denies anon/authenticated entirely while leaving every known legitimate consumer
-- unaffected -- the same reasoning the coordination_receipts precedent used.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- SCOPE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ENABLE ROW LEVEL SECURITY (no policies added -- default-deny for anon/authenticated;
-- service_role bypasses RLS unconditionally) + REVOKE the write-capable grants from
-- anon/authenticated (mirrors 20260731_coordination_receipts_rls_posture.sql exactly).
--
-- Tables: claim_rejects, coverage_matrix, coverage_matrix_rotation_runs, door_routing_ledger,
-- north_star, scope_completion_chain, selection_postures, sourcing_chairman_queue,
-- v_hc_flag_enabled, v_id, v_s22_flag_enabled, venture_preview_instances.
--
-- POST-APPLY VERIFICATION: re-run `node scripts/sentinels/audit-security-linter.mjs --strict`
-- -- rls_disabled_in_public and sensitive_columns_exposed should both drop to 0.

ALTER TABLE public.claim_rejects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_matrix_rotation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.door_routing_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.north_star ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_completion_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selection_postures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_chairman_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_hc_flag_enabled ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_id ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_s22_flag_enabled ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venture_preview_instances ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.claim_rejects FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.coverage_matrix FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.coverage_matrix_rotation_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.door_routing_ledger FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.north_star FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.scope_completion_chain FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.selection_postures FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sourcing_chairman_queue FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.v_hc_flag_enabled FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.v_id FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.v_s22_flag_enabled FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.venture_preview_instances FROM anon, authenticated;
