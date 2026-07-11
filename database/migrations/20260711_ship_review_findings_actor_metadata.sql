-- SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 (FR-2)
-- Add ship_review_findings.metadata (nullable jsonb) so P2's witness-evaluation
-- rung (evaluateP2Witness(), lib/ship/merge-witness-ladder.mjs) can move off a
-- permanently not_evaluable actor-separation state.
--
-- requires-chairman-apply
--
-- WHY: retro b119bba1 (SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001) item #2 flagged
-- that ship_review_findings has no actor attribution, so evaluateP2Witness()
-- can never evaluate reviewer/author separation -- only pass/fail on verdict.
-- evaluateEnforcementDecision() already BLOCKS (never silently passes) when P2
-- is not_evaluable, so this is additive: existing behavior is unaffected until a
-- writer starts populating metadata, and even then only rows WITH the new keys
-- become evaluable. Per this SD's own migration_plan (metadata field on the SD
-- row): "Default plan is ZERO DDL... a single generic metadata jsonb column is
-- the fallback if genuinely unavoidable" -- no existing jsonb/generic column on
-- ship_review_findings could be reused (finding_categories is a specific-purpose
-- field, not a generic attribution bag; no natural FK to system_events exists for
-- a zero-DDL correlation), so this single additive column is that fallback.
--
-- Data shape written by future callers (documented, not enforced by a CHECK --
-- keeps the column forward-compatible): reuses the system_events attribution
-- vocabulary --
--   { "actor_type": "human"|"agent"|"system", "actor_role": "<role string>",
--     "agent_id": "<uuid, if actor_type='agent'>" }
--
-- APPLY (chairman-gated, requires_chairman_apply pre-flagged at sourcing):
--   node scripts/apply-migration.js database/migrations/20260711_ship_review_findings_actor_metadata.sql --prod-deploy
--   with the chairman @approved-by stamp per standing policy.
--
-- ROLLBACK:
--   ALTER TABLE public.ship_review_findings DROP COLUMN IF EXISTS metadata;
--
-- @approved-by: codestreetlabs@gmail.com

BEGIN;

ALTER TABLE public.ship_review_findings
  ADD COLUMN IF NOT EXISTS metadata jsonb;

COMMENT ON COLUMN public.ship_review_findings.metadata IS
  'SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 FR-2: optional actor attribution '
  '({actor_type, actor_role, agent_id}, reusing the system_events vocabulary) so '
  'evaluateP2Witness() can evaluate reviewer/author separation instead of '
  'permanently reporting not_evaluable. NULL means no attribution captured for '
  'this row (backward-compatible default -- P2 stays not_evaluable for it).';

COMMIT;
