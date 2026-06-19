-- ============================================================================
-- SD-LEO-INFRA-UUID-CAST-GUARD-SD-COMPLETION-001
-- Guard the unguarded ::UUID casts in the SD-completion AFTER triggers so that
-- malformed metadata yields NULL instead of raising 22P02 and ABORTING the whole
-- SD-completion UPDATE.
--
-- Two trigger functions cast a metadata text field to UUID without a format guard:
--   - record_mttr_on_sd_completion : (NEW.metadata->>'proposal_id')::UUID
--       (the `IS NOT NULL` check does NOT stop 22P02 on a non-null-but-malformed value)
--   - fn_emit_sd_completed_event   : (NEW.metadata->>'venture_id')::UUID
--
-- Additive / behavior-preserving: CREATE OR REPLACE only. Signatures, SECURITY
-- DEFINER, and search_path are unchanged. The ONLY behavior change is that a
-- malformed id now resolves to NULL (→ the existing IS NULL / no-row paths skip
-- gracefully) instead of throwing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- safe_uuid: format-guarded cast. Returns NULL for any non-canonical-UUID input.
-- A STRICT canonical-UUID regex is used (NOT the loose ^[0-9a-fA-F-]{36}$ form
-- seen elsewhere, which a 36-char dash/hex string could satisfy yet still fail
-- ::uuid): every string that matches this pattern casts cleanly, so NULL is
-- returned ONLY when the cast would otherwise throw. IMMUTABLE + pure (no schema
-- objects), search_path pinned to pg_catalog (built-in regex/cast only).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.safe_uuid(p_text text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $safe_uuid$
BEGIN
  IF p_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN p_text::uuid;
  END IF;
  RETURN NULL;
END;
$safe_uuid$;

COMMENT ON FUNCTION public.safe_uuid(text) IS 'Format-guarded text->uuid cast: returns NULL on any non-canonical-UUID input instead of raising 22P02. SD-LEO-INFRA-UUID-CAST-GUARD-SD-COMPLETION-001.';

-- ----------------------------------------------------------------------------
-- FR-1: record_mttr_on_sd_completion — guard proposal_id cast.
-- Reproduced verbatim from the live definition; ONLY the cast line changed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_mttr_on_sd_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal_created_at TIMESTAMPTZ;
  v_proposal_id UUID;
  v_mttr_hours NUMERIC;
BEGIN
  -- Only track when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Check if SD has proposal origin
    IF NEW.metadata->>'proposal_id' IS NOT NULL THEN
      -- Guarded cast: a malformed proposal_id yields NULL (→ no-row skip) rather than 22P02.
      v_proposal_id := public.safe_uuid(NEW.metadata->>'proposal_id');

      -- Get proposal creation time
      SELECT created_at INTO v_proposal_created_at
      FROM leo_proposals
      WHERE id = v_proposal_id;

      IF v_proposal_created_at IS NOT NULL THEN
        -- Calculate MTTR in hours
        v_mttr_hours := EXTRACT(EPOCH FROM (NOW() - v_proposal_created_at)) / 3600;

        -- Record metric
        INSERT INTO pipeline_metrics (metric_name, metric_value, labels)
        VALUES (
          'mttr_hours',
          v_mttr_hours,
          jsonb_build_object(
            'sd_id', NEW.id,
            'proposal_id', v_proposal_id,
            'source', 'sd_completion'
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- FR-2: fn_emit_sd_completed_event — guard venture_id cast.
-- Reproduced verbatim from the live definition; ONLY the cast line changed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_emit_sd_completed_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
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

  -- Extract venture_id from metadata (only lifecycle-bridge SDs have this).
  -- Guarded cast: a malformed venture_id yields NULL (→ the IS NULL skip below)
  -- rather than raising 22P02 and aborting the SD completion.
  v_venture_id := public.safe_uuid(NEW.metadata->>'venture_id');

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
$function$;

-- ----------------------------------------------------------------------------
-- Self-verification: both functions resolve the guarded helper, and the helper
-- behaves (garbage -> NULL, valid -> uuid). Fails the migration loudly otherwise.
-- ----------------------------------------------------------------------------
DO $verify$
BEGIN
  IF public.safe_uuid('not-a-uuid') IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY FAILED: safe_uuid did not NULL a malformed value';
  END IF;
  IF public.safe_uuid(repeat('-', 36)) IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY FAILED: safe_uuid accepted a 36-dash string';
  END IF;
  IF public.safe_uuid('00000000-0000-0000-0000-000000000000') IS DISTINCT FROM '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'VERIFY FAILED: safe_uuid did not pass through a valid UUID';
  END IF;
  RAISE NOTICE 'VERIFY OK: safe_uuid guard + both SD-completion triggers re-created';
END $verify$;
