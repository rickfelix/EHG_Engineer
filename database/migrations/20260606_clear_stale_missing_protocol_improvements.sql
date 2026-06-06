-- @approved-by: codestreetlabs@gmail.com
-- SD-FDBK-ENH-RETROSPECTIVES-AUTO-VALIDATE-001
--
-- Make validate_protocol_improvements_for_process_category() symmetric + idempotent.
--
-- Bug (empirically confirmed against the live function):
--   * The function only ADDED a {type:'missing_protocol_improvements'} entry to
--     quality_issues when a PROCESS_IMPROVEMENT retro had no protocol_improvements,
--     and NEVER removed it once protocol_improvements was backfilled.
--   * Because it appended unconditionally, repeated UPDATEs while protocol_improvements
--     stayed empty produced DUPLICATE warnings (and re-applied the -10 score penalty
--     each time).
--   * On a protocol_improvements-only UPDATE, auto_validate_retrospective_quality()
--     early-returns (protocol_improvements is not in its should_recalculate watch list:
--     {what_went_well,key_learnings,action_items,what_needs_improvement}), so it never
--     rebuilt/cleared quality_issues either -> the stale warning persisted forever.
--
-- Fix:
--   * Add the warning ONCE (idempotent) — only when no missing_protocol_improvements
--     entry already exists; the -10 penalty therefore applies only on first add.
--   * CLEAR any missing_protocol_improvements entries whenever the condition no longer
--     holds (protocol_improvements present, or the retro is not PROCESS_IMPROVEMENT).
--     quality_score is intentionally left unchanged on the clear path — this is a
--     cosmetic quality_issues fix per the SD scope (score/status unaffected).
--
-- Note (out of scope): a missing_protocol_improvements warning does not survive a
-- content-change INSERT/UPDATE because auto_validate_retrospective_quality() (which
-- fires last, alphabetically) overwrites quality_issues on should_recalculate=TRUE.
-- Unifying ownership of quality_issues across the two triggers is a separate concern.

CREATE OR REPLACE FUNCTION public.validate_protocol_improvements_for_process_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  has_warning boolean := false;
BEGIN
  -- Is a missing_protocol_improvements warning already present? (array-safe)
  IF jsonb_typeof(COALESCE(NEW.quality_issues, '[]'::jsonb)) = 'array' THEN
    has_warning := EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(NEW.quality_issues, '[]'::jsonb)) e
      WHERE e->>'type' = 'missing_protocol_improvements'
    );
  END IF;

  IF NEW.learning_category = 'PROCESS_IMPROVEMENT'
     AND (NEW.protocol_improvements IS NULL
          OR jsonb_typeof(NEW.protocol_improvements) <> 'array'
          OR jsonb_array_length(NEW.protocol_improvements) = 0) THEN
    -- protocol_improvements missing: warn ONCE (idempotent — no duplicates; the
    -- -10 score penalty applies only on the first add).
    IF NOT has_warning THEN
      NEW.quality_issues = COALESCE(NEW.quality_issues, '[]'::jsonb) ||
        jsonb_build_array(jsonb_build_object(
          'type', 'missing_protocol_improvements',
          'severity', 'warning',
          'message', 'PROCESS_IMPROVEMENT retrospective should include protocol_improvements suggestions',
          'detected_at', now()
        ));

      IF NEW.quality_score IS NOT NULL AND NEW.quality_score > 10 THEN
        NEW.quality_score = NEW.quality_score - 10;
      END IF;
    END IF;
  ELSE
    -- Condition no longer holds (protocol_improvements present, or not a
    -- PROCESS_IMPROVEMENT retro): clear any stale missing_protocol_improvements
    -- warning. quality_score is intentionally left unchanged (cosmetic fix).
    IF has_warning THEN
      NEW.quality_issues = COALESCE((
        SELECT jsonb_agg(e)
        FROM jsonb_array_elements(NEW.quality_issues) e
        WHERE e->>'type' IS DISTINCT FROM 'missing_protocol_improvements'
      ), '[]'::jsonb);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── One-time cleanup of existing stale rows ────────────────────────────────────
-- Removes the missing_protocol_improvements warning from retrospectives that carry
-- it despite having protocol_improvements present (or not being PROCESS_IMPROVEMENT).
-- Count-guarded: aborts if the affected set is implausibly large; asserts 0 remain.
-- The UPDATE touches only quality_issues, so auto_validate_retrospective_quality()
-- early-returns (no score recompute) and quality_score is preserved.
DO $cleanup$
DECLARE
  pre_count  integer;
  post_count integer;
BEGIN
  SELECT count(*) INTO pre_count
  FROM retrospectives r
  WHERE jsonb_typeof(COALESCE(r.quality_issues, '[]'::jsonb)) = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.quality_issues) e
                WHERE e->>'type' = 'missing_protocol_improvements')
    AND ( r.learning_category IS DISTINCT FROM 'PROCESS_IMPROVEMENT'
          OR (r.protocol_improvements IS NOT NULL
              AND jsonb_typeof(r.protocol_improvements) = 'array'
              AND jsonb_array_length(r.protocol_improvements) > 0) );

  IF pre_count > 100 THEN
    RAISE EXCEPTION 'Cleanup aborted: % stale rows exceed the sanity cap of 100 (expected a handful). Investigate before bulk-updating.', pre_count;
  END IF;

  UPDATE retrospectives r
  SET quality_issues = COALESCE((
        SELECT jsonb_agg(e)
        FROM jsonb_array_elements(r.quality_issues) e
        WHERE e->>'type' IS DISTINCT FROM 'missing_protocol_improvements'
      ), '[]'::jsonb)
  WHERE jsonb_typeof(COALESCE(r.quality_issues, '[]'::jsonb)) = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.quality_issues) e
                WHERE e->>'type' = 'missing_protocol_improvements')
    AND ( r.learning_category IS DISTINCT FROM 'PROCESS_IMPROVEMENT'
          OR (r.protocol_improvements IS NOT NULL
              AND jsonb_typeof(r.protocol_improvements) = 'array'
              AND jsonb_array_length(r.protocol_improvements) > 0) );

  SELECT count(*) INTO post_count
  FROM retrospectives r
  WHERE jsonb_typeof(COALESCE(r.quality_issues, '[]'::jsonb)) = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.quality_issues) e
                WHERE e->>'type' = 'missing_protocol_improvements')
    AND ( r.learning_category IS DISTINCT FROM 'PROCESS_IMPROVEMENT'
          OR (r.protocol_improvements IS NOT NULL
              AND jsonb_typeof(r.protocol_improvements) = 'array'
              AND jsonb_array_length(r.protocol_improvements) > 0) );

  IF post_count <> 0 THEN
    RAISE EXCEPTION 'Cleanup incomplete: % stale rows remain (expected 0).', post_count;
  END IF;

  RAISE NOTICE 'SD-FDBK-ENH-RETROSPECTIVES-AUTO-VALIDATE-001: cleared stale missing_protocol_improvements warning from % row(s); 0 remain.', pre_count;
END
$cleanup$;
