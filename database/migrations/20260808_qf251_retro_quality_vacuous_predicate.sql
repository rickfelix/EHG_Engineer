-- QF-20260807-251: retro quality gate — match meaning, not substring
--
-- The "Dismissive statement check for what_needs_improvement" docked 10 points PER ITEM on a
-- bare substring match for '%nothing%' / '%no significant%'. Precision was taxed: an item that
-- states an empty set exactly ("the two vocabularies share NOTHING") scored lower than one that
-- hedged. Severity is gate-integrity, not cosmetics — validateSDCompletionReadiness falls back
-- to the stored quality_score when the AI evaluator is unavailable, so the penalty propagated
-- into completion decisions.
--
-- Semantic diff vs 20260523_fix_retrospective_publish_gate_ordering.sql is ONE predicate. The
-- whole function body is restated because CREATE OR REPLACE FUNCTION has no partial form.
--
-- ⚠ FULL-BODY DDL HAZARD: this is the 6th migration to replace this function. Two files that
-- each carry the whole body merge CLEANLY in git and then MUTUALLY REVERT on apply — last
-- applied wins, silently. If another migration touching
-- public.auto_validate_retrospective_quality is in flight, reconcile them BEFORE applying.
--
-- Live body UNVERIFIED from the authoring seat (no exec_sql RPC there); the apply seat reads
-- the deployed function and diffs it against this file before applying.

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_validate_retrospective_quality()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  validation_result JSONB;
  issues JSONB := '[]'::jsonb;
  score INTEGER := 0;
  generic_phrases TEXT[] := ARRAY[
    'SD completed',
    'no issues',
    'no significant challenges',
    'LEO Protocol followed successfully',
    'went well',
    'completed at 100%',
    'no problems'
  ];
  phrase TEXT;
  item TEXT;
  should_recalculate BOOLEAN := FALSE;
  arr_len INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_recalculate := TRUE;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.what_went_well IS DISTINCT FROM NEW.what_went_well) OR
       (OLD.key_learnings IS DISTINCT FROM NEW.key_learnings) OR
       (OLD.action_items IS DISTINCT FROM NEW.action_items) OR
       (OLD.what_needs_improvement IS DISTINCT FROM NEW.what_needs_improvement) THEN
      should_recalculate := TRUE;
    END IF;
  END IF;

  IF NOT should_recalculate THEN
    -- Score is NOT recomputed (status-only UPDATE, no content change).
    -- NEW.quality_score holds the stored value from the previous INSERT/UPDATE.
    -- FR-2: Still enforce the publish gate against that stored score.
    IF (TG_OP = 'INSERT' AND NEW.status = 'PUBLISHED')
       OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'PUBLISHED' AND NEW.status = 'PUBLISHED') THEN
      IF NEW.quality_score IS NULL OR NEW.quality_score < 70 THEN
        RAISE EXCEPTION 'PUBLISHED retrospectives must have quality_score >= 70 (current: %)', COALESCE(NEW.quality_score, 0)
          USING HINT = 'Improve retrospective completeness to reach 70+ score';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- ==========================================================================
  -- what_went_well scoring
  -- ==========================================================================
  IF NEW.what_went_well IS NOT NULL AND jsonb_typeof(NEW.what_went_well) = 'array' THEN
    arr_len := jsonb_array_length(NEW.what_went_well);
    IF arr_len >= 5 THEN
      score := score + 20;
    ELSIF arr_len < 3 THEN
      issues := issues || jsonb_build_object(
        'field', 'what_went_well',
        'issue', 'Too few items (need at least 5 for full credit, minimum 3)',
        'current_count', arr_len
      );
    ELSE
      score := score + 10;
    END IF;
  ELSE
    -- NULL or not an array
    issues := issues || jsonb_build_object(
      'field', 'what_went_well',
      'issue', 'Too few items (need at least 5 for full credit, minimum 3)',
      'current_count', 0
    );
  END IF;

  -- Generic phrase check for what_went_well
  IF NEW.what_went_well IS NOT NULL AND jsonb_typeof(NEW.what_went_well) = 'array' THEN
    FOR i IN 0..jsonb_array_length(NEW.what_went_well) - 1 LOOP
      item := NEW.what_went_well->>i;
      IF item IS NOT NULL THEN
        FOREACH phrase IN ARRAY generic_phrases LOOP
          IF item ILIKE '%' || phrase || '%' THEN
            score := score - 5;
            issues := issues || jsonb_build_object(
              'field', 'what_went_well',
              'issue', format('Generic statement detected: "%s"', phrase),
              'item', item
            );
            EXIT;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- ==========================================================================
  -- key_learnings scoring
  -- ==========================================================================
  IF NEW.key_learnings IS NOT NULL AND jsonb_typeof(NEW.key_learnings) = 'array' THEN
    arr_len := jsonb_array_length(NEW.key_learnings);
    IF arr_len >= 5 THEN
      score := score + 30;
    ELSIF arr_len >= 3 THEN
      score := score + 20;
    ELSE
      issues := issues || jsonb_build_object(
        'field', 'key_learnings',
        'issue', 'Too few learnings (need at least 5 for full credit, minimum 3)',
        'current_count', arr_len
      );
    END IF;
  ELSE
    -- NULL or not an array
    issues := issues || jsonb_build_object(
      'field', 'key_learnings',
      'issue', 'Too few learnings (need at least 5 for full credit, minimum 3)',
      'current_count', 0
    );
  END IF;

  -- Vague learning check for key_learnings
  IF NEW.key_learnings IS NOT NULL AND jsonb_typeof(NEW.key_learnings) = 'array' THEN
    FOR i IN 0..jsonb_array_length(NEW.key_learnings) - 1 LOOP
      item := NEW.key_learnings->>i;
      IF item IS NOT NULL AND length(item) < 20 THEN
        issues := issues || jsonb_build_object(
          'field', 'key_learnings',
          'issue', 'Learning too vague/short (should be >20 chars with specific details)',
          'item', item
        );
      END IF;
    END LOOP;
  END IF;

  -- ==========================================================================
  -- action_items scoring
  -- ==========================================================================
  IF NEW.action_items IS NOT NULL AND jsonb_typeof(NEW.action_items) = 'array' THEN
    arr_len := jsonb_array_length(NEW.action_items);
    IF arr_len >= 3 THEN
      score := score + 20;
    ELSIF arr_len < 2 THEN
      issues := issues || jsonb_build_object(
        'field', 'action_items',
        'issue', 'Too few action items (need at least 3)',
        'current_count', arr_len
      );
    ELSE
      score := score + 10;
    END IF;
  ELSE
    -- NULL or not an array
    issues := issues || jsonb_build_object(
      'field', 'action_items',
      'issue', 'Too few action items (need at least 3)',
      'current_count', 0
    );
  END IF;

  -- ==========================================================================
  -- what_needs_improvement scoring
  -- ==========================================================================
  IF NEW.what_needs_improvement IS NOT NULL AND jsonb_typeof(NEW.what_needs_improvement) = 'array' THEN
    arr_len := jsonb_array_length(NEW.what_needs_improvement);
    IF arr_len >= 3 THEN
      score := score + 20;
    ELSIF arr_len >= 1 THEN
      score := score + 10;
    ELSE
      issues := issues || jsonb_build_object(
        'field', 'what_needs_improvement',
        'issue', 'No improvement areas identified (every SD has room for improvement)',
        'current_count', 0
      );
    END IF;
  ELSE
    -- NULL or not an array
    issues := issues || jsonb_build_object(
      'field', 'what_needs_improvement',
      'issue', 'No improvement areas identified (every SD has room for improvement)',
      'current_count', 0
    );
  END IF;

  -- Dismissive statement check for what_needs_improvement
  IF NEW.what_needs_improvement IS NOT NULL AND jsonb_typeof(NEW.what_needs_improvement) = 'array' THEN
    FOR i IN 0..jsonb_array_length(NEW.what_needs_improvement) - 1 LOOP
      item := NEW.what_needs_improvement->>i;
      -- QF-20260807-251: was `item ILIKE '%no significant%' OR item ILIKE '%nothing%'` — a
      -- SUBSTRING dock. It penalised the token wherever it appeared, so a finding precise
      -- enough to state an empty set was taxed for saying so: measured firing on five
      -- emphatic findings, including 'shares almost nothing with what was ratified' and
      -- 'changed NOTHING OBSERVABLE'. That is the grep-is-not-a-test class living inside a
      -- scoring gate, and it rewards hedging over precision.
      --
      -- The heuristic MEANT 'this item is empty filler'. So match that: the item must BE a
      -- vacuous phrase, anchored end to end, not merely contain one. The full anchor is what
      -- encodes 'short' — a real finding cannot be entirely equal to 'nothing to report' —
      -- so no separate length test is added; a second condition that can never fail
      -- independently would be a guard measuring nothing.
      --
      -- '%no significant%' is FOLDED IN rather than kept: it carried the identical defect
      -- ('no significant change in latency was observed' is a real finding) and fixing only
      -- the reported token would have left its twin in place.
      --
      -- Deliberate, stated trade: a PADDED vacuous item ('There is nothing that needs
      -- improvement here, all good') no longer docks. Under-docking a hedged retro is far
      -- less harmful than taxing a precise one, because validateSDCompletionReadiness falls
      -- back to this stored score when the AI evaluator is unavailable — so the old
      -- behaviour let a vaguer retro outscore a sharper one in a COMPLETION decision.
      IF item IS NOT NULL AND btrim(lower(item)) ~ '^(n/?a|none|nothing|no comment|nothing to (report|add|note|say|improve)|no (significant|major|notable|other) (issues?|problems?|concerns?|improvements?|areas?|findings?)( to report| identified| found| noted)?)[.!]*$' THEN
        score := score - 10;
        issues := issues || jsonb_build_object(
          'field', 'what_needs_improvement',
          'issue', 'Dismissive statement detected - be constructive about improvements',
          'item', item
        );
      END IF;
    END LOOP;
  END IF;

  -- ==========================================================================
  -- Specificity bonus (references to quantitative data)
  -- ==========================================================================
  IF (NEW.what_went_well::text || NEW.key_learnings::text || NEW.what_needs_improvement::text)
     ~ '\d+ (lines?|files?|tests?|hours?|minutes?|LOC|components?)' THEN
    score := score + 10;
  END IF;

  score := LEAST(score, 100);
  score := GREATEST(score, 0);

  NEW.quality_score := score;
  NEW.quality_issues := issues;
  NEW.quality_validated_at := NOW();
  NEW.quality_validated_by := 'SYSTEM';

  -- FR-2 + SD-FDBK-FIX-FIX-RETROSPECTIVE-TRIGGER-001:
  -- Enforce the publish gate AFTER the score has been computed (above).
  -- This covers the primary bug path: direct PUBLISHED INSERT where the score
  -- was just freshly computed and must be validated before persisting.
  IF (TG_OP = 'INSERT' AND NEW.status = 'PUBLISHED')
     OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'PUBLISHED' AND NEW.status = 'PUBLISHED') THEN
    IF NEW.quality_score IS NULL OR NEW.quality_score < 70 THEN
      RAISE EXCEPTION 'PUBLISHED retrospectives must have quality_score >= 70 (current: %)', COALESCE(NEW.quality_score, 0)
        USING HINT = 'Improve retrospective completeness to reach 70+ score';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
