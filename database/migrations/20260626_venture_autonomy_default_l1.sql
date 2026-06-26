-- ============================================================================
-- Set the new-venture autonomy DEFAULT from L2 -> L1
-- SD-LEO-INFRA-AUTONOMY-DEFAULT-L1-001  (chairman-decided)
-- ============================================================================
-- RATIONALE:
--   The chairman decided new ventures should default to autonomy level L1.
--   This SUPERSEDES the deferred FR-5 "L2 -> L0 revert" — the default moves to
--   L1 (one step below the prior L2), not back to L0.
--
--   Mirrors 20260601_venture_build_autonomy_default_l2.sql (which set BOTH
--   defaults to L2). As verified there against live schema dedlbzhpgkmetvhbkyzq:
--     * eva_ventures and ventures are SEPARATE base tables (NOT a view).
--     * checkAutonomy() reads eva_ventures.autonomy_level (enum eva_autonomy_level).
--     * sync_ventures_to_eva_ventures_insert() OMITS autonomy_level, so the
--       eva_ventures COLUMN DEFAULT is what applies for trigger-synced rows ->
--       the default MUST be set on eva_ventures (read side) AND ventures (write).
--
--   NO code change: the reserved-gates backstop and the gate matrix already
--   handle L1 correctly. NO setter change: set_venture_autonomy_level() is
--   level-agnostic (single-step over L0..L4) and is unaffected.
--
-- NON-RETROACTIVE: only the DEFAULT changes. Existing rows are NOT updated.
--   venture-1 is already L1. No backfill.
-- Rollback notes at bottom.
-- ============================================================================
-- @approved-by: codestreetlabs@gmail.com

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. DEFAULT change on the gate-READ table (eva_ventures: enum eva_autonomy_level)
-- ---------------------------------------------------------------------------
ALTER TABLE public.eva_ventures
  ALTER COLUMN autonomy_level SET DEFAULT 'L1'::eva_autonomy_level;

-- ---------------------------------------------------------------------------
-- 2. DEFAULT change on the source/write table (ventures: text, CHECK L0..L4)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ventures
  ALTER COLUMN autonomy_level SET DEFAULT 'L1';

-- NOTE: NO UPDATE statements. Existing rows are unchanged by design
-- (column-default changes are non-retroactive).

COMMIT;

-- ============================================================================
-- ROLLBACK (manual, if ever needed) — restores the prior L2 default:
--   ALTER TABLE public.eva_ventures ALTER COLUMN autonomy_level SET DEFAULT 'L2'::eva_autonomy_level;
--   ALTER TABLE public.ventures     ALTER COLUMN autonomy_level SET DEFAULT 'L2';
-- ============================================================================
