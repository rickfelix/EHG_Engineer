-- @approved-by: codestreetlabs@gmail.com
-- Migration: add 'seeded_from_venture' to the venture_briefs.origin_type CHECK constraint
--   (the SIBLING of the venture_origin_type enum drift).
--
-- Root cause: venture_briefs_origin_type_check = CHECK (origin_type = ANY (ARRAY[
--   'competitor_teardown','competitor_clone','blueprint','discovery','manual'])) — missing
--   'seeded_from_venture'. So the Stage-0 brief INSERT for the clean clone (origin_type=
--   'seeded_from_venture') failed -> clone 091f2889 has 0 venture_briefs rows. (The
--   venture_origin_type ENUM was already fixed in 20260627_venture_origin_type_add_seeded_from_venture.sql;
--   this same value is gated by a SECOND object — this CHECK on venture_briefs.)
--
-- Authorization: chairman GO via Adam (Option A: Residual-1 fix + HOLD), recorded on parent
--   metadata.chairman_enum_migration_authorization. SCOPE = add 'seeded_from_venture' as a SUPERSET
--   (existing 5 values preserved + the new one); no existing row violates the superset, so re-ADD is safe.
--   synthetic_pipeline is also absent from this check but is OUT OF SCOPE here (separate follow-up).
--
-- Apply note: DROP + re-ADD a CHECK constraint is transaction-safe (default tx; no --no-tx needed).
--
-- SD: SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-B (brief-constraint sibling-drift unblock)

ALTER TABLE public.venture_briefs DROP CONSTRAINT IF EXISTS venture_briefs_origin_type_check;

ALTER TABLE public.venture_briefs ADD CONSTRAINT venture_briefs_origin_type_check
  CHECK (origin_type = ANY (ARRAY[
    'competitor_teardown'::text,
    'competitor_clone'::text,
    'blueprint'::text,
    'discovery'::text,
    'manual'::text,
    'seeded_from_venture'::text
  ]));
