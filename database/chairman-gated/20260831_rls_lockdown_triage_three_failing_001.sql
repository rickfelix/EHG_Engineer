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
-- the tables below are referenced by frontend/browser client code -- every known consumer is
-- backend service-role automation (lib/venture-deploy/preview.js, lib/eva/stage-templates/...),
-- which BYPASSES RLS regardless of this change. Enabling RLS with no additional policies
-- therefore denies anon/authenticated entirely while leaving every known legitimate consumer
-- unaffected -- the same reasoning the coordination_receipts precedent used.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- CORRECTION (SD-LEO-FIX-SECURITY-LINTER-SENTINEL-001, 2026-09-02) -- two tables removed
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- This file originally included north_star and scope_completion_chain in the blanket
-- enable+revoke below. That was a regression against database/chairman-gated/
-- 20260825_enable_rls_chronic_red_guard_zero_consumer_tables.sql (SD-LEO-INFRA-CHRONIC-RED-GUARD-001,
-- authored six days earlier, also unapplied at the time this file was authored), which had already
-- independently verified and EXPLICITLY EXCLUDED both tables for documented, measured reasons: (1)
-- north_star has a real, live anon-key browser consumer (ehg repo's src/hooks/useNorthStar.ts +
-- src/components/eva-chat/intents/northStarIntent.ts) that this file's own repo-wide grep claim
-- above did not catch; (2) scope_completion_chain is UNIONed by the security_invoker=on view
-- public.writer_consumer_asymmetry_witnesses, which GRANTs SELECT to both anon and authenticated --
-- a bare enable-with-no-policy on either table would have silently broken a real consumer the
-- instant this file was applied via its own pending chairman ceremony. Both tables are being handled
-- correctly elsewhere instead: north_star gets a real, verified SELECT policy (scoped to its actual
-- query filter) plus this same REVOKE, and scope_completion_chain reuses the RLS-enable + permissive
-- read policy already staged (also unapplied) in database/migrations/20260616_security_hygiene_
-- rls_searchpath.sql, paired with the matching REVOKE -- both landed in
-- database/chairman-gated/20260902_security_linter_sentinel_north_star_and_chain.sql. Neither of
-- those replacement statements duplicates this file's blanket, no-policy shape for these two tables.
-- This file's remaining 10 tables were independently re-verified (repeating, not merely trusting, the
-- zero-consumer census) and are unaffected by this correction.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- SCOPE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ENABLE ROW LEVEL SECURITY (no policies added -- default-deny for anon/authenticated;
-- service_role bypasses RLS unconditionally) + REVOKE the write-capable grants from
-- anon/authenticated (mirrors 20260731_coordination_receipts_rls_posture.sql exactly).
--
-- Tables: claim_rejects, coverage_matrix, coverage_matrix_rotation_runs, door_routing_ledger,
-- selection_postures, sourcing_chairman_queue, v_hc_flag_enabled, v_id, v_s22_flag_enabled,
-- venture_preview_instances. (north_star and scope_completion_chain removed -- see CORRECTION above.)
--
-- POST-APPLY VERIFICATION: re-run `node scripts/sentinels/audit-security-linter.mjs --strict`
-- -- rls_disabled_in_public should drop by 10 (the remaining 2 close via the paired migration
-- named above); sensitive_columns_exposed should drop to 0 (claim_rejects is in this file's set).

ALTER TABLE public.claim_rejects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_matrix_rotation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.door_routing_ledger ENABLE ROW LEVEL SECURITY;
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
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.selection_postures FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sourcing_chairman_queue FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.v_hc_flag_enabled FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.v_id FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.v_s22_flag_enabled FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.venture_preview_instances FROM anon, authenticated;
