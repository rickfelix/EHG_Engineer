-- SD-LEO-INFRA-NORMALIZE-HANDOFF-RETROSPECTIVE-001
-- Normalize handoff retrospective type-column semantics.
--
-- Problem: the 3 handoff retro writers (plan-to-exec / lead-to-plan /
-- exec-to-plan/retrospective.js) hardcode retro_type='SD_COMPLETION' and store
-- the real phase in retrospective_type, so ~3,683 handoff retros pollute the
-- retro_type='SD_COMPLETION' namespace. The SD-completion gate
-- (retro-filters.js getFilteredRetrospective) must then compensate downstream
-- with a brittle retrospective_type filter. Separately, the live
-- retrospective_type CHECK omitted EXEC_TO_PLAN, so the exec-to-plan writer was
-- silently rejected and zero EXEC_TO_PLAN retros ever persisted.
--
-- Fix:
--   FR-1: add 'HANDOFF' to retrospectives_retro_type_check (preserves the 9
--         live values + the = ANY(ARRAY[..]) form; NULL stays implicitly allowed).
--   FR-3: add 'EXEC_TO_PLAN' to retrospectives_retrospective_type_check so the
--         exec-to-plan handoff retro can persist.
--   FR-2: backfill existing handoff retros out of the SD_COMPLETION namespace.
--
-- Verified via prod BEGIN..ROLLBACK dry-run (database-agent): the ADD CONSTRAINT
-- validates against all 7,469 existing rows and the backfill reclassifies ~3,683
-- rows (LEAD_TO_PLAN 2013 + PLAN_TO_EXEC 1670 + EXEC_TO_PLAN 0); the completion
-- gate SELECT still returns genuine SD_COMPLETION retros afterward.

BEGIN;

-- FR-1: HANDOFF becomes a first-class retro_type.
ALTER TABLE retrospectives DROP CONSTRAINT IF EXISTS retrospectives_retro_type_check;
ALTER TABLE retrospectives ADD CONSTRAINT retrospectives_retro_type_check
  CHECK (retro_type = ANY (ARRAY[
    'SPRINT', 'SD_COMPLETION', 'INCIDENT', 'MILESTONE', 'WEEKLY', 'MONTHLY',
    'ARCHITECTURE_DECISION', 'RELEASE', 'AUDIT', 'HANDOFF'
  ]));

-- FR-3: permit EXEC_TO_PLAN on retrospective_type (repairs the dead exec-to-plan writer).
ALTER TABLE retrospectives DROP CONSTRAINT IF EXISTS retrospectives_retrospective_type_check;
ALTER TABLE retrospectives ADD CONSTRAINT retrospectives_retrospective_type_check
  CHECK (retrospective_type = ANY (ARRAY[
    'LEAD_TO_PLAN', 'PLAN_TO_EXEC', 'EXEC_TO_PLAN', 'SD_COMPLETION'
  ]));

-- FR-2: reclassify existing handoff-time retros so they no longer occupy the
-- SD_COMPLETION namespace. Genuine completion retros (retrospective_type NULL or
-- SD_COMPLETION) are excluded by the WHERE clause and remain unchanged.
UPDATE retrospectives
   SET retro_type = 'HANDOFF'
 WHERE retro_type = 'SD_COMPLETION'
   AND retrospective_type IN ('LEAD_TO_PLAN', 'PLAN_TO_EXEC', 'EXEC_TO_PLAN');

COMMIT;
