-- Migration 3 (FR-16): gvos_prompt_rubrics v2 — consume _reserved + library_motion → motion_grammar_density=10
-- Arithmetic-locked at 10 (NOT 12). Guarded WHERE prevents silent corruption.

BEGIN;

UPDATE gvos_prompt_rubrics
SET weights = (weights - '_reserved_for_motion_grammar_density' - 'library_motion')
              || jsonb_build_object('motion_grammar_density', 10)
WHERE id = '469f63fb-543f-43af-8509-7575ae2340ec'
  AND version = 2
  AND created_by = 'sd:SD-LEO-FEAT-CHILD-PER-WIREFRAME-001'
  AND weights ? '_reserved_for_motion_grammar_density'
  AND weights ? 'library_motion';

-- Fail-loud guard: zero rows updated means the row already migrated OR predicate drifted
DO $$
DECLARE
  total_weight INTEGER;
  row_present  INTEGER;
  has_motion   BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO row_present FROM gvos_prompt_rubrics
    WHERE id = '469f63fb-543f-43af-8509-7575ae2340ec' AND version = 2;
  IF row_present = 0 THEN
    RAISE EXCEPTION 'FR-16: rubric v2 row 469f63fb not found';
  END IF;

  SELECT (weights ? 'motion_grammar_density') INTO has_motion
    FROM gvos_prompt_rubrics
    WHERE id = '469f63fb-543f-43af-8509-7575ae2340ec' AND version = 2;
  IF NOT has_motion THEN
    RAISE EXCEPTION 'FR-16: motion_grammar_density not present after UPDATE (predicate drift?)';
  END IF;

  SELECT SUM((value)::int) INTO total_weight
    FROM gvos_prompt_rubrics, jsonb_each_text(weights)
    WHERE id = '469f63fb-543f-43af-8509-7575ae2340ec' AND version = 2;
  IF total_weight != 100 THEN
    RAISE EXCEPTION 'FR-16: rubric v2 weight total = %, expected 100', total_weight;
  END IF;
END $$;

COMMIT;