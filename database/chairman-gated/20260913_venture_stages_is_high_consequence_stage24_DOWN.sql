-- DOWN for 20260913_venture_stages_is_high_consequence_stage24.sql
-- SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F (C4.2). CHAIRMAN-GATED — stage only, never self-apply.
--
-- Reverts stage 24's is_high_consequence back to false (its pre-migration value). Legitimate if
-- the UP migration turns out to have been wrong about stage 24 needing high-consequence
-- treatment — it is not a neutral undo, and running it re-introduces the exact inconsistency
-- (a kill gate flagged not-high-consequence) the UP migration exists to fix.
--
-- Scoped to the exact post-UP state (true) so a re-run after further drift is a documented
-- no-op rather than a surprise overwrite.

UPDATE public.venture_stages
SET is_high_consequence = false
WHERE stage_number = 24
  AND is_high_consequence = true;
