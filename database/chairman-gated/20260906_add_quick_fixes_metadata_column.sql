-- SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E (Child E) FR-5 — a home for QF-side claim provenance.
-- Target DB: EHG_Engineer
--
-- @approved-by: <PENDING -- apply via the chairman's 3-factor ceremony>
--   approval on record. See database/chairman-gated/README.md: the approver header must match
--   `git config user.email` at apply time and is checked against the chairman-approval record.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- WHY THIS SITS HERE, NOT IN database/migrations/. quick_fixes has NO metadata JSONB column
-- today (verified against the live 50-column row, 2026-09-06). The precedent file
-- (20260728_add_quick_fix_runtime_observation.sql) shows an ADD COLUMN IF NOT EXISTS this shape
-- classifies TIER-1 on its own, but this repository's auto-executor
-- (BaseExecutor._checkAndExecutePendingMigrations, autoExecute defaulting true) scans
-- database/migrations, database/manual-updates and supabase/migrations unconditionally. Child E's
-- PLAN phase deliberately scoped "actually applying this migration to production is OUT OF SCOPE
-- for this child" (validation-agent 787c567b) — placing an additive-but-genuinely-optional column
-- in an auto-scanned path would apply it the moment the pipeline next runs pending-migration
-- detection, regardless of tier, which is the opposite of the deferral this SD chose. This
-- directory exists precisely so a worker cannot place gated-by-choice DDL in an auto-applied path
-- (see database/chairman-gated/README.md).
--
-- WHAT GOES IN IT. lib/fleet/qf-metadata-merge.mjs (Child E) appends ONE claim_history-shaped
-- entry per successful QF claim, mirroring strategic_directives_v2.metadata.claim_history's
-- established shape:
--   { "claim_history": [ { "session_id": "<uuid>", "claimed_at": "<ISO8601>",
--       "identity_source": "env"|"pointer_fallback",
--       "pick_reason": { "score": <number>|"UNSCORED", "components": {...}, "comparatorVersion": <string>|null } } ] }
-- No FIFO cap is enforced by this column or its writer today (unlike the SD side's cap of 20) —
-- there is no observed uncapped-growth risk yet since the column does not exist in production.
--
-- SAFE TO SHIP THE CODE PATH REGARDLESS OF APPLY TIMING: lib/fleet/qf-metadata-merge.mjs catches
-- Postgres 42703 (undefined_column) specifically and returns {merged:false, reason:'column_absent'}
-- without throwing — every caller (lib/fleet/claim-stamp.cjs's stampClaim, auto-routed here for a
-- QF-shaped ref) treats that as a fail-soft no-op, so the claim itself always still succeeds
-- whether or not this migration has been applied.
--
-- Nullable, no default, no backfill, no constraint change: provably additive, so existing rows and
-- every current reader/writer of quick_fixes are unaffected whenever this is eventually applied.

ALTER TABLE quick_fixes ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN quick_fixes.metadata IS
  'SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E (Child E). Additive JSONB provenance column, written only by lib/fleet/qf-metadata-merge.mjs (mergeQfMetadataKeys), a CAS-guarded append onto metadata.claim_history mirroring strategic_directives_v2''s established shape. NULL means "no claim has been stamped since this column existed", never "not applicable".';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (companion DOWN file: 20260906_add_quick_fixes_metadata_column_DOWN.sql)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE quick_fixes DROP COLUMN IF EXISTS metadata;
-- Safe: the column is additive-only and no other migration or writer depends on its presence
-- (every reader/writer degrades fail-soft on its absence by construction).
