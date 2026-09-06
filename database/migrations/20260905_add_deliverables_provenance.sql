-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- @chairman-gated: this session's --prod-deploy attempt (fresh token, matching
--   @approved-by precedent) was denied by the permission classifier because this
--   migration restates a SECURITY DEFINER function body -- an autonomous worker
--   session cannot self-apply it. Dry-run validated
--   (node scripts/apply-migration.js database/migrations/20260905_add_deliverables_provenance.sql
--   prints [MIGRATION_APPLY_DRY_RUN] cleanly, 4 declared objects, 37 statements) and
--   code-reviewed by an adversarial TESTING sub-agent pass; staged not applied pending
--   an operator running the 2-command apply ceremony
--   (node scripts/apply-migration.js --issue-token, then --prod-deploy with the token).
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
--
-- TESTING finding F-10 (EXEC-TO-PLAN pass): apply via the default (single-transaction) path
-- ONLY -- `scripts/apply-migration.js ... --split-statements` shreds the dollar-quoted
-- function bodies below into fragments and will corrupt this file's own SQL. The normal
-- `apply-migration.js` invocation (no --split-statements) already runs the whole file as one
-- statement batch and is safe; this note exists only to keep a future --split-statements
-- retry off the table.

ALTER TABLE sd_scope_deliverables
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- SECURITY finding SEC-G6: without this backfill, ~24.6k already-completed rows keep
-- completed_at NULL. The very next unrelated UPDATE to any one of them (e.g. a later
-- completion_notes edit) would hit the new BEFORE trigger's NULL guard and retroactively
-- stamp completed_at=NOW() -- mislabeling a months-old completion as a fresh, post-cutover,
-- producer-less completion. Backfilling with the best available prior timestamp keeps every
-- pre-existing completion correctly dated before the cutover, so it stays exempt.
UPDATE sd_scope_deliverables
SET completed_at = COALESCE(verified_at, updated_at, created_at)
WHERE completion_status IN ('completed', 'done')
  AND completed_at IS NULL;

-- TESTING finding F-2/F-3 (EXEC-TO-PLAN pass): completed_at has no DEFAULT, so a bare hand-typed
-- `UPDATE ... SET completion_status = 'completed'` (no producer, no completed_at) left BOTH fields
-- unset -- isUnprovenancedPostCutover's `completed_at IS NULL` short-circuit then treated it as
-- exempt (pre-migration), silently defeating the exact threat model this SD exists to close. This
-- trigger makes completed_at unconditional: ANY write that lands completion_status in
-- ('completed','done') gets completed_at stamped if not already set, by every path -- sanctioned
-- producer or raw hand-typed UPDATE alike -- so the gate classifier's completed_at-based cutover
-- test can never again be starved of the one field it depends on. The NULL guard is what makes
-- this idempotent across repeated no-op updates: a genuine completion is stamped once, never bumped.
CREATE OR REPLACE FUNCTION public.set_deliverable_completed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.completion_status IN ('completed', 'done') AND NEW.completed_at IS NULL THEN
    NEW.completed_at := NOW();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_deliverable_completed_at ON sd_scope_deliverables;
CREATE TRIGGER trg_set_deliverable_completed_at
  BEFORE INSERT OR UPDATE ON sd_scope_deliverables
  FOR EACH ROW
  EXECUTE FUNCTION public.set_deliverable_completed_at();

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

-- secdef-execute-revoke-lint: this CREATE OR REPLACE does not touch pg_proc.proacl (grants
-- are independent of the function body/definition and persist across a replace) -- live ACL
-- is already {postgres=X/postgres,service_role=X/postgres}, i.e. PUBLIC/anon/authenticated
-- already have no EXECUTE grant. Restated explicitly anyway (idempotent no-op) so the
-- migration is self-documenting and the lint's diff-based check, which cannot see live
-- catalog state, has no ambiguity to flag.
REVOKE EXECUTE ON FUNCTION public.complete_deliverables_on_subagent_pass() FROM PUBLIC, anon, authenticated;
