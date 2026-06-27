-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-A (FR-1)
-- Governance: parent SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001 chairman-blessed (chairman yes 2026-06-27);
-- DATABASE sub-agent reviewed (additive nullable self-FK, no backfill, RLS unaffected).
-- Additive provenance column for the clean-clone seed-and-re-run mechanism:
-- records the source venture a new venture was reseeded from. Nullable, additive,
-- no backfill (existing 13 rows get NULL = provenance unknown, the correct semantic).
-- A nullable additive column is a catalog-only change in Postgres (no table rewrite).
-- RLS unaffected (no column-scoped policies on ventures).

ALTER TABLE public.ventures
  ADD COLUMN IF NOT EXISTS seeded_from_venture_id uuid
  REFERENCES public.ventures(id) ON DELETE SET NULL;

-- Realistic query is reverse-lineage ("what was seeded from X"); partial index keeps it
-- cheap given most rows are NULL.
CREATE INDEX IF NOT EXISTS idx_ventures_seeded_from
  ON public.ventures(seeded_from_venture_id)
  WHERE seeded_from_venture_id IS NOT NULL;

COMMENT ON COLUMN public.ventures.seeded_from_venture_id IS
  'Provenance: source venture this venture was reseeded from (clean-clone mechanism). Nullable, additive, no backfill.';

-- Rollback:
-- DROP INDEX IF EXISTS public.idx_ventures_seeded_from;
-- ALTER TABLE public.ventures DROP COLUMN IF EXISTS seeded_from_venture_id;
