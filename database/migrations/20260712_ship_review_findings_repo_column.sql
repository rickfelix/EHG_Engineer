-- SD-APEXNICHE-AI-LEO-GEN-WITNESS-LOOKUP-DURABLE-001 (FR-4)
-- Add ship_review_findings.repo (nullable text) so P2's witness-evaluation
-- rung (evaluateP2Witness(), lib/ship/merge-witness-ladder.mjs) can scope
-- its lookup by the exact owner/name repo string instead of the interim
-- branch-only scoping shipped by the parent SD.
--
-- requires-chairman-apply
--
-- WHY: the parent SD (SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001) closed a live
-- cross-repo pr_number collision (apexniche-ai PR#2/#5 colliding with
-- marketlens's rows at the same PR numbers, letting an unrelated repo's
-- passing review witness-pass an unreviewed venture PR) with an URGENT,
-- fail-closed interim fix: scoping the P2 lookup by `branch` instead, since
-- ship_review_findings had no repo column at the time and branch was already
-- 100% populated on every live row. Branch is a weaker discriminant than
-- repo (branch names like `main` can collide across repos too, and SD/QF-
-- derived branch names are usually but not guaranteed unique), so this
-- column is the durable Layer 2: once populated, repo becomes the PRIMARY
-- scope and branch-only matching is restricted to legacy (repo IS NULL) rows
-- only -- see lib/ship/venture-trust-gate.mjs defaultFetchReviewFinding
-- (FR-6) for the exact fail-closed read logic. This is additive and
-- non-blocking: FR-5's writers and FR-6's reader both probe for this
-- column's existence at runtime and degrade to today's exact branch-only
-- behavior when it is absent, so this migration may ship un-applied for an
-- indefinite period (as sibling chairman-gated migrations on this same
-- table already have) without affecting the auto-merge trust gate.
--
-- Data shape written by future callers (documented, not enforced by a CHECK
-- -- keeps the column forward-compatible): 'owner/name', all-lowercase, no
-- '.git' suffix -- matches the shape already used by merge_witness_telemetry
-- and ship_escape_audit (lib/ship/auto-merge.mjs `${repoOwner}/${repoName}`),
-- normalized via the shared normalizeGithubRepo() helper
-- (lib/ship/repo-column-probe.mjs) on every write and read path.
--
-- APPLY (chairman-gated, requires_chairman_apply pre-flagged at sourcing):
--   This migration is committed WITHOUT the @approved-by stamp (deliberate
--   deviation from the 20260711_ship_review_findings_actor_metadata.sql
--   template, which mirrors a migration that was pre-approved at sourcing
--   time). The chairman must add the stamp below before running:
--     node scripts/apply-migration.js database/migrations/20260712_ship_review_findings_repo_column.sql --prod-deploy
--
-- ROLLBACK:
--   ALTER TABLE public.ship_review_findings DROP COLUMN IF EXISTS repo;
--
-- @approved-by: <pending chairman sign-off>

BEGIN;

ALTER TABLE public.ship_review_findings
  ADD COLUMN IF NOT EXISTS repo text;

COMMENT ON COLUMN public.ship_review_findings.repo IS
  'SD-APEXNICHE-AI-LEO-GEN-WITNESS-LOOKUP-DURABLE-001 FR-4: optional repo '
  'scope (''owner/name'', lowercase, no .git suffix) for the P2 witness '
  'lookup (evaluateP2Witness()). NULL means no repo captured for this row '
  '(legacy rows, or rows written before this column was chairman-applied) '
  '-- defaultFetchReviewFinding() falls back to branch-scoped matching '
  'restricted to repo IS NULL rows for those, never widening the match.';

COMMIT;
