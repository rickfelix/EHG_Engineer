-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G FR-4: deliverables provenance.
--
-- sd_scope_deliverables has no producer/completed_at columns today, so a
-- gate cannot tell a legitimately-completed deliverable from a hand-typed
-- UPDATE. This adds completed_at as the cutover anchor and stamps
-- metadata.producer at the two confirmed-live trigger producers.
--
-- Live definitions confirmed via direct pg_get_functiondef introspection
-- (createDatabaseClient('engineer'), not migration-file grepping -- a prior
-- TESTING round's migration-file-based read of these two functions was
-- wrong twice). Every line below is byte-identical to the live body except
-- the two additions marked FR-4. Both functions' exact confirmed-live
-- SECURITY/search_path clauses are restated inline in this CREATE OR
-- REPLACE -- omitting them would silently revert the search_path hardening
-- shipped in 20260317_security_definer_audit.sql, since CREATE OR REPLACE
-- replaces the whole function definition, not just the body.

ALTER TABLE sd_scope_deliverables
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- fn_auto_close_deliverables_on_sd_completion: SECURITY INVOKER (default),
-- SET search_path TO 'public', 'extensions' confirmed live.
CREATE OR REPLACE FUNCTION public.fn_auto_close_deliverables_on_sd_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Only fire when SD transitions TO completed status
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE sd_scope_deliverables
    SET
      completion_status = 'completed',
      completion_notes = COALESCE(completion_notes, '') ||
        CASE WHEN completion_notes IS NOT NULL AND completion_notes != '' THEN '; ' ELSE '' END ||
        'Auto-completed: parent SD ' || COALESCE(NEW.sd_key, NEW.id::text) || ' reached completed status',
      completed_at = NOW(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_completed_at', NOW()::text,
        'trigger', 'SD_COMPLETION',
        'previous_status', completion_status,
        'producer', 'sd_completion_trigger'
      ),
      updated_at = NOW()
    WHERE sd_id = NEW.id
      AND completion_status NOT IN ('completed', 'skipped');

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count > 0 THEN
      RAISE NOTICE 'Auto-closed % deliverables for SD % (%)', v_updated_count, NEW.sd_key, NEW.id;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non-blocking: log warning but don't prevent SD completion
  RAISE WARNING 'fn_auto_close_deliverables_on_sd_completion failed for SD %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

-- complete_deliverables_on_subagent_pass: SECURITY DEFINER,
-- SET search_path TO 'public' confirmed live -- both restated inline.
CREATE OR REPLACE FUNCTION public.complete_deliverables_on_subagent_pass()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count INTEGER;
  deliverable_types TEXT[];
  dtype TEXT;
BEGIN
  IF NEW.verdict != 'PASS' THEN
    RETURN NEW;
  END IF;
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  SELECT ARRAY_AGG(deliverable_type ORDER BY priority DESC)
  INTO deliverable_types
  FROM sd_subagent_deliverable_mapping
  WHERE sub_agent_code = NEW.sub_agent_code;
  IF deliverable_types IS NULL OR array_length(deliverable_types, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  FOREACH dtype IN ARRAY deliverable_types
  LOOP
    UPDATE sd_scope_deliverables
    SET
      completion_status = 'completed',
      verified_by = NEW.sub_agent_code,
      verified_at = NOW(),
      completion_evidence = format('Sub-agent %s verdict: PASS (confidence: %s%%)',
                                   NEW.sub_agent_code, NEW.confidence),
      completion_notes = format('Auto-completed by sub-agent trigger. Result ID: %s',
                               NEW.id),
      completed_at = NOW(),
      updated_at = NOW(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_completed', true,
        'auto_completed_at', NOW(),
        'trigger', 'complete_deliverables_on_subagent_pass',
        'sub_agent_code', NEW.sub_agent_code,
        'sub_agent_result_id', NEW.id,
        'confidence', NEW.confidence,
        'producer', 'subagent_pass_trigger'
      )
    WHERE sd_id = NEW.sd_id
    AND deliverable_type = dtype
    AND completion_status != 'completed';
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count > 0 THEN
      RAISE NOTICE 'Sub-agent % PASS: Completed % % deliverables for SD %',
        NEW.sub_agent_code, updated_count, dtype, NEW.sd_id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;
