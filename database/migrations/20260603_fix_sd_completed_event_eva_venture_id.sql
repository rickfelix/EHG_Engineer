-- Migration: Fix fn_emit_sd_completed_event eva_venture_id resolution
-- SD: SD-DATADISTILL-FDBK-ENH-COMPLETION-STATUS-COMPLETED-001
-- Feedback: 4dc95fa5-ab9f-4d63-8690-272d25bc49e7
--
-- BUG: fn_emit_sd_completed_event() (20260213_sd_completed_return_path.sql) writes
--   eva_events.eva_venture_id := NEW.metadata->>'venture_id'  (a ventures.id).
-- But eva_events.eva_venture_id has an FK to eva_ventures(id), which is a DISTINCT
-- id-space (eva_ventures has its own PK `id` plus a `venture_id` -> ventures(id)).
-- So for any venture SD, the trigger inserts a ventures.id into a column that must be
-- an eva_ventures.id. When status flips to 'completed', the AFTER UPDATE trigger's
-- INSERT throws 23503 (eva_events_eva_venture_id_fkey) and — because the trigger runs
-- inside the same txn as the UPDATE — the whole completion rolls back. This blocked
-- LEAD-FINAL-APPROVAL for every DataDistill orchestrator SD (and any venture SD):
-- all gates pass, then the terminal status update fails with SD_UPDATE_FAILED.
-- Evidence: only 1 'sd.completed' event has ever been emitted (trigger ~always failed
-- or skipped). DataDistill DOES have an eva_ventures mirror (id=36a04592...,
-- venture_id=510177ba...), so the correct event id is the mirror PK, not the ventures.id.
--
-- FIX (mirrors the kill_venture FK-guard precedent, 20260528160000, but resolves the
-- mirror PK by the correct column):
--   1. Resolve eva_ventures.id via `WHERE venture_id = v_venture_id` (the mapping).
--   2. Skip the event when no mirror exists (RETURN NEW) so completion never rolls back.
--   3. Insert eva_venture_id = the resolved eva_ventures.id (not the ventures.id).
-- Payload keeps `ventureId` (ventures.id) for backward-compat and adds `evaVentureId`.
-- Strictly more correct + more permissive; no behavior change for the (rare) ventures
-- whose metadata.venture_id already equalled an eva_ventures.id.
--
-- NOTE: preserves the function's existing `SET search_path TO 'public', 'extensions'`
-- hardening (present on the live function; the original 20260213 body predated it but a
-- later security pass added it). Keeping it here ensures a re-run does not silently
-- strip search_path. SECURITY INVOKER (default) is unchanged. Validated + applied via a
-- database-agent prod BEGIN..ROLLBACK dry-run (evidence d15d6c58-2b16-4b4f-ad3f-5ed8021d6dcb).

CREATE OR REPLACE FUNCTION fn_emit_sd_completed_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_venture_id UUID;
  v_eva_venture_id UUID;
  v_parent_sd_key TEXT;
  v_parent_uuid UUID;
  v_idempotency_key TEXT;
BEGIN
  -- Only fire on status transition to 'completed'
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'completed' THEN
    RETURN NEW; -- Already completed, no re-emit
  END IF;

  -- Extract venture_id from metadata (only lifecycle-bridge SDs have this)
  v_venture_id := (NEW.metadata->>'venture_id')::UUID;

  -- If no venture_id, this SD is not part of EVA lifecycle - skip
  IF v_venture_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve the EVA mirror's primary key. eva_events.eva_venture_id FKs to
  -- eva_ventures(id), a distinct id-space; the SD metadata carries a ventures.id.
  SELECT id INTO v_eva_venture_id
  FROM eva_ventures
  WHERE venture_id = v_venture_id;

  -- No EVA mirror for this venture -> skip the return-path event rather than
  -- aborting the SD completion (FK would otherwise roll back the whole UPDATE).
  IF v_eva_venture_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find parent SD key if this is a child
  IF NEW.parent_sd_id IS NOT NULL THEN
    SELECT sd_key INTO v_parent_sd_key
    FROM strategic_directives_v2
    WHERE id = NEW.parent_sd_id;

    v_parent_uuid := NEW.parent_sd_id;
  END IF;

  -- Build idempotency key
  v_idempotency_key := 'sd.completed:' || NEW.sd_key || ':' || NEW.id;

  -- Insert event into eva_events (eva_venture_id = the resolved eva_ventures.id)
  INSERT INTO eva_events (
    eva_venture_id,
    event_type,
    event_data,
    idempotency_key,
    processed,
    retry_count
  ) VALUES (
    v_eva_venture_id,
    'sd.completed',
    jsonb_build_object(
      'sdKey', NEW.sd_key,
      'sdId', NEW.id,
      'ventureId', v_venture_id::TEXT,
      'evaVentureId', v_eva_venture_id::TEXT,
      'parentSdId', v_parent_uuid::TEXT,
      'parentSdKey', v_parent_sd_key,
      'sdType', NEW.sd_type,
      'title', NEW.title,
      'completedAt', NOW()::TEXT,
      'progress', NEW.progress
    ),
    v_idempotency_key,
    FALSE,
    0
  )
  ON CONFLICT (idempotency_key) DO NOTHING; -- Idempotent

  RETURN NEW;
END;
$$;

-- Trigger tr_sd_completed_event already calls this function; CREATE OR REPLACE FUNCTION
-- updates the body in place, so no trigger recreation is required.
