-- QF-20260807-451: the quality_score rewrite must be AUDITABLE, not silent
--
-- auto_validate_retrospective_quality ends with `NEW.quality_score := score` — it discards
-- whatever value arrived and stores its own rubric total. Reported and reproduced as 85 -> 90.
-- Nothing recorded that a substitution happened, so a consumer reading quality_score got a
-- number with no way to learn it had replaced a different one. The gate reads exactly that
-- number (scripts/modules/handoff/executors/plan-to-lead/gates/retrospective-quality.js:156
-- gates on quality_score >= 60), which is why an untraceable score is a gate-integrity issue
-- and not a cosmetic one.
--
-- THE WINNER DOES NOT CHANGE. Coordinator ruling 2026-08-08: the trigger score IS canonical —
-- it is the designed objective rubric, and a generator's self-score must not own a gate
-- predicate. This migration therefore changes NO score and NO pass/fail outcome. It only makes
-- the substitution visible in the record the function already writes.
--
-- SCOPE OF THE AUDIT RECORD, stated here so a reader cannot over-trust the field:
-- `score_at_entry` is the value THIS function sees when it runs. That is NOT necessarily what
-- the generator submitted. validate_protocol_improvements_trigger fires on the same BEFORE
-- event and can subtract 10 first (PostgreSQL fires same-kind triggers in alphabetical order by
-- TRIGGER name, and validate_protocol_improvements_trigger sorts before
-- validate_retrospective_quality_trigger). So the honest name is score_at_entry, never
-- submitted_score — a field name is a claim, and that is a claim this function cannot support.
-- INFERRED from documented PostgreSQL ordering semantics, not measured: no seat can read live
-- trigger order (no exec_sql RPC). Labelled as inference deliberately.
--
-- BLAST RADIUS OF APPENDING TO quality_issues — measured before writing, not assumed:
--   * tests/integration/retro-protocol-improvements-clear.test.js counts issues but FILTERS on
--     type === 'missing_protocol_improvements'; this entry uses a different type -> unaffected.
--   * scripts/modules/sd-quality-validation.js:264 exposes existing_quality_issues as a COUNT,
--     but inside `details` (reporting only, next to the other _count fields). pass/fail comes
--     from result.passed, never from that count -> no decision changes.
--   * the plan-to-lead retrospective gate reads quality_score only, never quality_issues.
--   * every quality_issues consumer in lib/ targets eva_vision_documents /
--     eva_architecture_plans — a DIFFERENT TABLE.
--
-- Semantic diff vs 20260808_qf251_retro_quality_vacuous_predicate.sql is ONE added record. The
-- whole function body is restated because CREATE OR REPLACE FUNCTION has no partial form.
--
-- ⚠ FULL-BODY DDL HAZARD: this is the 7th migration to replace this function. Two files that
-- each carry the whole body merge CLEANLY in git and then MUTUALLY REVERT on apply — last
-- applied wins, silently. This file is transcribed from 20260808_qf251 (the LATEST full
-- CREATE OR REPLACE) precisely so both live incumbents ride forward: the QF-251 ANCHORED
-- VACUOUS PREDICATE and the [0-9]+ SPECIFICITY REGEX. Transcribing from 20260529 or earlier
-- would silently revert one or both — that hazard already cost one fold-forward PR.
--
-- @chairman-gated
-- Same ruling as QF-251 (Adam, 2026-08-08): CREATE OR REPLACE FUNCTION is NOT in the
-- delegated-apply lane, and this function IS the gate instrument, which invokes
-- proposer-is-not-approver on top. Path is the chairman ceremony: @approved-by header,
-- 3-factor apply from the coordinator seat. THE APPLY IS NOT THE AUTHOR'S.
--
-- The marker is why check-migration-readiness reports EXPECTED_PENDING rather than
-- DRIFT_DETECTED for this file (CHAIRMAN-GATED-EXEMPT-001). It is a statement of fact about a
-- ruling, not a way to quiet a red check: the live body genuinely differs from this file, and
-- it is SUPPOSED to until the ceremony runs. Remove it and the divergence must go red again.
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
  -- QF-20260807-451: value on entry, captured before anything overwrites it.
  score_at_entry INTEGER;
BEGIN
  -- QF-20260807-451: capture FIRST, before any branch can return or overwrite. Must sit
  -- above the should_recalculate fork so the early-return path leaves it defined too.
  score_at_entry := NEW.quality_score;

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
     -- FOLD-FORWARD (QF-20260807-251, caught at the apply safeguard): this line was transcribed
     -- from 20260523 as `\d+`, which POSIX ERE does not honour, so the +10 specificity bonus
     -- never fired. QF-20260529-565 already fixed it LIVE to [0-9]+ — and applying this
     -- full-body replace with the dead form would have silently reverted that fix, last-applied-
     -- wins. Carrying the live incumbent forward is fidelity to the approval, not new scope.
     ~ '[0-9]+ (lines?|files?|tests?|hours?|minutes?|LOC|components?)' THEN
    score := score + 10;
  END IF;

  score := LEAST(score, 100);
  score := GREATEST(score, 0);

  -- QF-20260807-451: record the substitution BEFORE it happens, while both numbers exist.
  -- Appended to `issues` (not written directly to NEW.quality_issues) because the very next
  -- statement assigns issues -> NEW.quality_issues; writing NEW.quality_issues here would be
  -- overwritten one line later. severity 'info' — this is an audit trail, not a defect.
  IF score_at_entry IS NOT NULL AND score_at_entry IS DISTINCT FROM score THEN
    issues := issues || jsonb_build_object(
      'type', 'quality_score_recomputed',
      'severity', 'info',
      'score_at_entry', score_at_entry,
      'recomputed_score', score,
      'message', format(
        'quality_score recomputed by the rubric: %s -> %s. The rubric score is canonical; the entry value may itself have been adjusted by an earlier BEFORE trigger.',
        score_at_entry, score)
    );
  END IF;

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
