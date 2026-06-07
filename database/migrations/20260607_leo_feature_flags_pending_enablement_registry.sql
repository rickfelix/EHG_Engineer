-- ============================================================================
-- 20260607_leo_feature_flags_pending_enablement_registry.sql
-- ----------------------------------------------------------------------------
-- SD: SD-LEO-INFRA-POLICY-GATED-AUTO-001A
-- UUID: 508f56a9-4ab4-4f36-95d1-32388cf781bd
-- Phase: EXEC (database-agent design + apply output)
--
-- @approved-by: codestreetlabs@gmail.com
--
-- Purpose:
--   Extend the EXISTING public.leo_feature_flags table (NOT a parallel table)
--   with 5 additive, nullable columns so that every default-OFF rollout can
--   self-register as a "Pending-Enablement Registry" entry. This lets the
--   exec-email aged-pending surfacer find flags that shipped default-OFF and
--   have never been enabled / reviewed, without inventing a second table.
--
--   New columns:
--     gates_what          text         -- what the flag guards
--     enablement_criteria text         -- what must be true to enable it
--     rolled_out_at       timestamptz  -- when the default-OFF rollout shipped
--     last_reviewed_at    timestamptz  -- last operator review of this pending flag
--     target              text         -- target app/scope (e.g. 'EHG_Engineer')
--
-- Status-semantics note (lifecycle_state):
--   lifecycle_state is the ENUM type `feature_flag_lifecycle_state` whose ONLY
--   allowed values are: draft, enabled, disabled, expired, archived.
--   There is NO pending / retired / deprecated value, and there is NO CHECK
--   constraint adding extra values. Therefore "pending enablement" is NOT a
--   first-class lifecycle_state; it must be DERIVED:
--
--     pending  := is_enabled = false
--                 AND rolled_out_at IS NOT NULL
--                 AND lifecycle_state IN ('draft','disabled')  -- not retired
--
--   ("retired"/"end-of-life" maps to lifecycle_state IN ('expired','archived');
--    those should NOT be surfaced as pending-enablement work.)
--   The surfacer derives "aged pending" by comparing now() against
--   rolled_out_at / last_reviewed_at. No enum change is required (and none is
--   made here) — keeping this migration purely additive and reversible.
--
-- Risk / lock rationale:
--   * ADD COLUMN ... IF NOT EXISTS with literal NULL default on PostgreSQL 11+
--     is a metadata-only operation: brief AccessExclusiveLock, no row rewrite,
--     no full-table scan (PG verified 17.x in production). 6 existing rows are
--     untouched; all new columns read back NULL on existing rows.
--   * Additive + nullable ONLY. No existing column is altered or dropped; no
--     existing row data is modified.
--   * IF NOT EXISTS makes each ADD COLUMN idempotent / re-runnable.
--
-- Down / rollback (additive-only, fully reversible — see also footer):
--   BEGIN;
--     ALTER TABLE public.leo_feature_flags DROP COLUMN IF EXISTS target;
--     ALTER TABLE public.leo_feature_flags DROP COLUMN IF EXISTS last_reviewed_at;
--     ALTER TABLE public.leo_feature_flags DROP COLUMN IF EXISTS rolled_out_at;
--     ALTER TABLE public.leo_feature_flags DROP COLUMN IF EXISTS enablement_criteria;
--     ALTER TABLE public.leo_feature_flags DROP COLUMN IF EXISTS gates_what;
--   COMMIT;
-- ============================================================================

BEGIN;

-- 1) gates_what — free-text description of what behaviour/path the flag guards.
ALTER TABLE public.leo_feature_flags
  ADD COLUMN IF NOT EXISTS gates_what TEXT DEFAULT NULL;

COMMENT ON COLUMN public.leo_feature_flags.gates_what IS
  'Pending-Enablement Registry: human-readable description of WHAT this flag '
  'guards (the behaviour/code path that is OFF while is_enabled=false). '
  'Populated by default-OFF rollouts that self-register. '
  'See SD-LEO-INFRA-POLICY-GATED-AUTO-001A.';

-- 2) enablement_criteria — what must be true before an operator flips it ON.
ALTER TABLE public.leo_feature_flags
  ADD COLUMN IF NOT EXISTS enablement_criteria TEXT DEFAULT NULL;

COMMENT ON COLUMN public.leo_feature_flags.enablement_criteria IS
  'Pending-Enablement Registry: the conditions that must hold before this '
  'default-OFF flag is enabled (e.g. "consumer migration deployed; 24h soak '
  'with no errors"). Read by the exec-email aged-pending surfacer. '
  'See SD-LEO-INFRA-POLICY-GATED-AUTO-001A.';

-- 3) rolled_out_at — when the default-OFF rollout shipped. Presence of this
--    value (with is_enabled=false) is the primary "this is a pending flag" signal.
ALTER TABLE public.leo_feature_flags
  ADD COLUMN IF NOT EXISTS rolled_out_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.leo_feature_flags.rolled_out_at IS
  'Pending-Enablement Registry: timestamp when the default-OFF rollout that '
  'introduced this flag shipped. NULL = not a self-registered pending rollout. '
  'pending := is_enabled=false AND rolled_out_at IS NOT NULL AND lifecycle_state '
  'IN (draft,disabled). Aged-pending = now() - rolled_out_at exceeds threshold. '
  'See SD-LEO-INFRA-POLICY-GATED-AUTO-001A.';

-- 4) last_reviewed_at — last operator review of this pending flag (drives "aged").
ALTER TABLE public.leo_feature_flags
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.leo_feature_flags.last_reviewed_at IS
  'Pending-Enablement Registry: timestamp of the last operator review of this '
  'pending flag. NULL = never reviewed since rollout. The aged-pending surfacer '
  'uses COALESCE(last_reviewed_at, rolled_out_at) as the staleness anchor. '
  'See SD-LEO-INFRA-POLICY-GATED-AUTO-001A.';

-- 5) target — target app/scope this flag applies to (e.g. EHG_Engineer / EHG).
ALTER TABLE public.leo_feature_flags
  ADD COLUMN IF NOT EXISTS target TEXT DEFAULT NULL;

COMMENT ON COLUMN public.leo_feature_flags.target IS
  'Pending-Enablement Registry: target application / scope this flag applies to '
  '(e.g. "EHG_Engineer", "EHG"). NULL = unscoped / global. '
  'See SD-LEO-INFRA-POLICY-GATED-AUTO-001A.';

COMMIT;

-- ============================================================================
-- Post-deploy verification (run separately, e.g. in psql or a scripted check):
--
--   SELECT column_name
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name   = 'leo_feature_flags'
--     AND column_name IN ('gates_what','enablement_criteria',
--                         'rolled_out_at','last_reviewed_at','target')
--   ORDER BY column_name;
--   -- expect exactly 5 rows.
-- ============================================================================

-- ============================================================================
-- BEGIN..ROLLBACK rehearsal snippet (proves add + rollback are clean; makes NO
-- permanent change because it ends in ROLLBACK). Run via a raw pg client; do NOT
-- run through apply-migration.js (that path COMMITs):
--
--   BEGIN;
--     ALTER TABLE public.leo_feature_flags ADD COLUMN IF NOT EXISTS gates_what TEXT;
--     ALTER TABLE public.leo_feature_flags ADD COLUMN IF NOT EXISTS enablement_criteria TEXT;
--     ALTER TABLE public.leo_feature_flags ADD COLUMN IF NOT EXISTS rolled_out_at TIMESTAMPTZ;
--     ALTER TABLE public.leo_feature_flags ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;
--     ALTER TABLE public.leo_feature_flags ADD COLUMN IF NOT EXISTS target TEXT;
--     -- inspect:
--     SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--     WHERE table_name='leo_feature_flags'
--       AND column_name IN ('gates_what','enablement_criteria','rolled_out_at','last_reviewed_at','target')
--     ORDER BY column_name;
--   ROLLBACK;   -- everything above is discarded; table returns to prior shape.
-- ============================================================================
