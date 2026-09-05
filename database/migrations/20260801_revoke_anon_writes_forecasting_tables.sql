-- requires-chairman-apply
-- @approved-by: codestreetlabs@gmail.com
-- @approval-provenance: chairman SMS "Approved" 2026-08-01 11:16:35Z (packet sent 11:13:36Z), Adam d5080cf3 scribing
-- =============================================================================
-- Migration: revoke anon WRITE grants on the remaining 6 exposed tables
-- Why: PR 6717 closed claude_sessions + session_coordination, but SECURITY
--      (coordinator/Alpha, 2026-08-01) found that was 1 of the population, not
--      the population. Root cause: 20260123_fix_overly_permissive_rls dropped
--      the AUTHENTICATED policy 17x and the ANON twin ZERO times — an INVERTED
--      remediation that removed the weaker grantee everywhere and left the
--      UNAUTHENTICATED one standing. Adam re-verified WITH THE ANON KEY
--      (attacker-eye, writes filtered to a nonexistent id — non-destructive):
--      anon holds an open write grant on these 6, and on three it can both READ
--      and DELETE the execution-baseline / forecasting substrate.
-- Exposed set (anon DELETE grant open, confirmed live 2026-08-01):
--   sd_execution_actuals    -- WORST: DELETE + UPDATE open, 41 real rows readable
--   sd_baseline_items       -- DELETE open, 32,064 real rows readable
--   sd_execution_baselines  -- DELETE open, 9 real rows readable
--   model_usage_log         -- DELETE open, anon reads 0 (RLS blocks reads; latent)
--   sd_conflict_matrix      -- DELETE open, empty
--   sd_session_activity     -- DELETE open, empty
-- Scope: table-level WRITE grant revocation only (INSERT/UPDATE/DELETE/TRUNCATE)
--      — PostgREST needs BOTH a grant AND a policy, so revoking the grant closes
--      the write path regardless of policy shape, touching NO read path. Same
--      minimal shape as PR 6717. Policy-level cleanup rides
--      SD-LEO-INFRA-DEFAULT-ANON-AUTHENTICATED-001.
-- Caveat (honest): a 0-row DELETE returning success proves the GRANT, not that
--      RLS would pass a destructive delete; no destructive delete was run. The
--      revoke closes the capability either way (defense in depth).
-- =============================================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sd_execution_actuals FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sd_baseline_items FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sd_execution_baselines FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.model_usage_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sd_conflict_matrix FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sd_session_activity FROM anon;
