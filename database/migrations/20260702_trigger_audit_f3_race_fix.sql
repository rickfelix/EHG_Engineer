-- @approved-by: codestreetlabs@gmail.com
-- SD-FDBK-INFRA-TRIGGER-AUDIT-MEDIUM-001 / FR-1 + FR-2
--
-- TRIGGER-AUDIT finding F-3 (from completed SD-LEO-INFRA-TRIGGER-ESTATE-AUDIT-001):
-- assign_sequence_rank() and fn_sync_sd_to_baseline() both compute SELECT MAX(sequence_rank)+1
-- with no locking. Neither strategic_directives_v2.sequence_rank nor
-- sd_baseline_items(baseline_id,sequence_rank) has a unique constraint, so the race is silent
-- duplicate-rank data (confirmed live: rank 1 appears 69x across 4800 SDs) rather than a
-- creation-crash -- but under this repo's multi-worker autonomous fleet, concurrent SD
-- creation is routine, not an edge case, so the drift keeps growing.
--
-- Fix: serialize each MAX+1 critical section with a transaction-scoped advisory lock
-- (pg_advisory_xact_lock -- auto-releases at commit/rollback, no cleanup code needed).
-- fn_sync_sd_to_baseline additionally wraps its sd_baseline_items INSERT in a
-- BEGIN...EXCEPTION...END sub-block so a future/transient failure there can never abort the
-- parent strategic_directives_v2 INSERT. DATABASE sub-agent reviewed this approach and
-- confirmed: no deadlock risk (consistent lock ordering across all SD-creation transactions,
-- no other trigger touches these advisory keys), and the lock MUST be acquired before/outside
-- the EXCEPTION sub-block (advisory locks are not released on subtransaction rollback).
--
-- Explicitly OUT OF SCOPE (see metadata.lead_scope_lock_decision on the SD row):
--   - Deduping the existing thousands of duplicate ranks (needs its own migration + a
--     downstream-consumer audit for anything assuming rank uniqueness)
--   - sd_baseline_items cleanup-on-cancel/delete (a separate, larger lifecycle change)
--   - F-6 (PK-mutating twin-column sync triggers) -- has its own unresolved prerequisite

CREATE OR REPLACE FUNCTION public.assign_sequence_rank()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
      BEGIN
        IF NEW.sequence_rank IS NULL THEN
          PERFORM pg_advisory_xact_lock(hashtext('strategic_directives_v2_sequence_rank'));
          SELECT COALESCE(MAX(sequence_rank), 0) + 1
          INTO NEW.sequence_rank
          FROM strategic_directives_v2;
        END IF;
        RETURN NEW;
      END;
      $function$
;

CREATE OR REPLACE FUNCTION public.fn_sync_sd_to_baseline()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_active_baseline_id UUID;
  v_baseline_item_exists BOOLEAN;
  v_track TEXT;
  v_next_rank INTEGER;
BEGIN
  SELECT id INTO v_active_baseline_id
  FROM sd_execution_baselines
  WHERE is_active = true
  LIMIT 1;
  IF v_active_baseline_id IS NULL THEN
    RAISE NOTICE 'fn_sync_sd_to_baseline: No active baseline found. SD % not auto-synced.', NEW.sd_key;
    RETURN NEW;
  END IF;
  v_track := CASE
    WHEN LOWER(NEW.category) IN ('infrastructure', 'platform') THEN 'A'
    WHEN LOWER(NEW.category) IN ('quality', 'testing', 'qa') THEN 'C'
    ELSE 'B'  -- Default to Features track
  END;
  IF TG_OP = 'INSERT' THEN
    -- LOAD-BEARING: sd_id MUST be NEW.sd_key (the v_sd_next_candidates JOIN key).
    SELECT EXISTS(
      SELECT 1 FROM sd_baseline_items
      WHERE baseline_id = v_active_baseline_id
        AND sd_id = NEW.sd_key
    ) INTO v_baseline_item_exists;
    IF NOT v_baseline_item_exists THEN
      -- Serialize the read-compute-write MAX+1 critical section per baseline (not globally --
      -- concurrent SD creation against DIFFERENT baselines should not block each other). Lock
      -- is acquired BEFORE/outside the exception-handling sub-block below (a lock taken inside
      -- a subtransaction is not released on subtransaction rollback).
      PERFORM pg_advisory_xact_lock(hashtext('sd_baseline_items_seq_' || v_active_baseline_id::text));
      SELECT COALESCE(MAX(sequence_rank) + 1, 1)
      INTO v_next_rank
      FROM sd_baseline_items
      WHERE baseline_id = v_active_baseline_id;

      -- Best-effort side-effect: a failure here must never abort SD creation itself. The
      -- EXCEPTION clause creates an implicit savepoint -- on error it rolls back to that
      -- savepoint and continues, leaving the outer strategic_directives_v2 INSERT intact.
      BEGIN
        INSERT INTO sd_baseline_items (
          baseline_id,
          sd_id,
          sequence_rank,
          track,
          is_ready,
          created_at
        ) VALUES (
          v_active_baseline_id,
          NEW.sd_key,
          v_next_rank,
          v_track,
          false,  -- New SDs are not ready by default
          NOW()
        );
        RAISE NOTICE 'fn_sync_sd_to_baseline: Added SD % to baseline % (Track %)', NEW.sd_key, v_active_baseline_id, v_track;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'fn_sync_sd_to_baseline: baseline-item insert failed for SD % (non-fatal, SD creation proceeds): %', NEW.sd_key, SQLERRM;
      END;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'completed' THEN
        UPDATE sd_baseline_items
        SET
          is_ready = true,
          notes = COALESCE(notes, '') || E'\nCompleted: ' || NOW()::text
        WHERE baseline_id = v_active_baseline_id
          AND sd_id = NEW.sd_key;
        RAISE NOTICE 'fn_sync_sd_to_baseline: Marked SD % as completed in baseline', NEW.sd_key;
      ELSIF OLD.status = 'completed' AND NEW.status IN ('active', 'planning', 'in_progress') THEN
        UPDATE sd_baseline_items
        SET
          is_ready = true,
          notes = COALESCE(notes, '') || E'\nReactivated: ' || NOW()::text
        WHERE baseline_id = v_active_baseline_id
          AND sd_id = NEW.sd_key;
        RAISE NOTICE 'fn_sync_sd_to_baseline: Reactivated SD % in baseline', NEW.sd_key;
      ELSIF NEW.status IN ('active', 'in_progress') THEN
        UPDATE sd_baseline_items
        SET is_ready = true
        WHERE baseline_id = v_active_baseline_id
          AND sd_id = NEW.sd_key;
      END IF;
    END IF;
    IF OLD.category IS DISTINCT FROM NEW.category THEN
      UPDATE sd_baseline_items
      SET track = v_track
      WHERE baseline_id = v_active_baseline_id
        AND sd_id = NEW.sd_key;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$
;
