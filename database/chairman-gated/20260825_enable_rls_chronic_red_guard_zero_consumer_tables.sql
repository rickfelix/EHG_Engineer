-- @chairman-gated
--
-- THERE IS DELIBERATELY NO `-- @approved-by:` LINE IN THIS FILE.
--   Empirically verified against scripts/lib/migration-tier-classifier.mjs AND
--   lib/migration/adam-delegated-apply.js (not assumed): a bare `ALTER TABLE ... ENABLE ROW
--   LEVEL SECURITY` statement classifies TIER-1 by the raw classifier, but
--   adam-delegated-apply.js's own documented GAP A explicitly EXCLUDES any enable_rls:*/
--   create_policy token from the AI-delegatable subset -- "data-access-policy changes the
--   chairman reserved", regardless of raw tier. This file is therefore chairman-gated by
--   explicit repo governance, not merely by the raw classifier.
--   The chairman adds the `@approved-by` line and runs:
--       node scripts/apply-migration.js database/chairman-gated/20260825_enable_rls_chronic_red_guard_zero_consumer_tables.sql --prod-deploy
--   APPLY IS NOT MINE.
--
-- =============================================================================
-- Enable RLS on the ZERO-live-consumer subset of the sentinel's rls_disabled_in_public
-- findings (SD-LEO-INFRA-CHRONIC-RED-GUARD-001, FR-2)
-- =============================================================================
-- Consumer verification (per FR-2/TR-4's requirement -- documented, not assumed): a teammate
-- session ("rls-dep-census") ran a full code-search census across both EHG_Engineer and ehg
-- repos for every one of the 12 live rls_disabled_in_public tables, tracing each function's
-- injected supabase/db client back to its construction site. Independently spot-checked 3 of
-- its claims (coverage_matrix, selection_postures, door_routing_ledger) against live source
-- before trusting the rest. Full result: 10 of the 12 tables have EITHER zero live application
-- consumers at all, or consumers that exclusively use a service-role client (which BYPASSES RLS
-- entirely per Postgres role semantics -- ENABLE ROW LEVEL SECURITY with no policy denies only
-- anon/authenticated, never service_role). The 10 tables below are that verified-safe subset.
--
-- EXCLUDED from this migration, on purpose:
--   * north_star -- HAS a real, live anon-key browser consumer (ehg repo's
--     src/hooks/useNorthStar.ts + src/components/eva-chat/intents/northStarIntent.ts, the
--     survivability-cockpit tiles + EVA chat). A bare RLS-enable with no policy would silently
--     deny-all that consumer (useNorthStar.ts's own error handling swallows the denial and
--     renders a bare "UNSET" with no surfaced error -- the exact failure-invisible-to-both-sides
--     shape this SD's guard-hardening work exists to avoid reproducing elsewhere). Needs a real,
--     verified POLICY scoped to its actual query filter (status='chairman_ratified'), which is
--     out of this migration's zero-consumer scope -- tracked as FR-2's named follow-up-SD item.
--   * venture_artifacts_storm_quarantine_20260704 -- its sibling table
--     venture_artifacts_storm_quarantine_20260610 is already sentinel-EXEMPTED (a retired
--     quarantine snapshot, not a live-access table); this one gets the matching EXEMPTION via
--     FR-2b's data-manifest migration, not RLS remediation -- enabling RLS on a table nobody
--     ever queries again would be a no-op exemption dressed up as a fix.
--
-- Per-table consumer evidence (file:line citations from the rls-dep-census teammate, spot-check
-- confirmed for 3 of these 10):
--   claim_rejects                       -- zero app-code consumer at all; written only by the
--                                            Postgres trigger claim_eligibility_observe()
--                                            (database/migrations/20260704_claim_eligibility_observe_trigger.sql)
--   coverage_matrix                     -- lib/governance/coverage-matrix.js, service-role only
--                                            (scripts/coverage-matrix-regenerate.mjs explicit
--                                            SUPABASE_SERVICE_ROLE_KEY)
--   coverage_matrix_rotation_runs       -- lib/governance/coverage-matrix-referent-audit.js,
--                                            same service-role entrypoint
--   door_routing_ledger                 -- zero real query call sites; two code comments name it
--                                            an explicit "dead-table pattern"
--   scope_completion_chain              -- scripts/modules/handoff/executors/lead-final-approval/
--                                            gates/*.js, LEAD-FINAL-APPROVAL Node CLI gates,
--                                            service-role only
--   selection_postures                  -- lib/eva/stage-zero/profile-service.js, injected
--                                            deps.supabase from backend EVA Stage-0 modules
--   sourcing_chairman_queue             -- lib/sourcing-engine/escalator.js, injected
--                                            deps.supabase; table currently dormant (not yet
--                                            applied) per its own fail-soft 42P01/PGRST205 coding
--   v_hc_flag_enabled                   -- zero code consumers anywhere in either repo
--   v_s22_flag_enabled                  -- zero code consumers (a same-named PL/pgSQL local
--                                            variable in fn_advance_venture_stage is an unrelated
--                                            name collision, not a table reference)
--   venture_preview_instances           -- lib/venture-deploy/preview.js +
--                                            scripts/venture-preview-reaper.mjs, explicit
--                                            createSupabaseServiceClient
--
-- No CREATE POLICY statements are added here. Bare RLS-enable is sufficient and safe for this
-- subset specifically BECAUSE no policy is needed to preserve service-role access (bypasses RLS
-- unconditionally) and no anon/authenticated consumer exists to preserve. A future genuine
-- anon/authenticated consumer of any of these tables would need its own migration adding an
-- explicit policy -- this migration does not foreclose that.
-- =============================================================================

ALTER TABLE public.claim_rejects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_matrix_rotation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.door_routing_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_completion_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selection_postures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_chairman_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_hc_flag_enabled ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_s22_flag_enabled ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venture_preview_instances ENABLE ROW LEVEL SECURITY;
