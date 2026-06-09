-- DOWN migration (reversal) for:
--   20260608_fix_baseline_sync_sdkey_and_deps_satisfied.sql
-- SD: SD-LEO-INFRA-FIX-NEXT-CANDIDATES-001
--
-- Restores: (A) prior trigger body (writes NEW.id), (B) prior view def (string-
-- only deps_satisfied), (C) reverses the data reconciliation from the backup
-- table sd_baseline_items_recon_backup (re-insert deleted colliders, restore
-- converted rows' sd_id to the original UUID).
--
-- WARNING: reversing the data re-introduces the UUID-shaped rows that the forward
-- migration's trigger fix prevents. Only run this together with the function/view
-- restore below (which is what this file does), so the system is internally
-- consistent with its pre-fix state.

-- ============================================================================
-- (A) RESTORE prior trigger function (writes/matches NEW.id)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_sync_sd_to_baseline()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_active_baseline_id UUID;
  v_baseline_item_exists BOOLEAN;
  v_track TEXT;
BEGIN
  SELECT id INTO v_active_baseline_id
  FROM sd_execution_baselines
  WHERE is_active = true
  LIMIT 1;
  IF v_active_baseline_id IS NULL THEN
    RAISE NOTICE 'fn_sync_sd_to_baseline: No active baseline found. SD % not auto-synced.', NEW.id;
    RETURN NEW;
  END IF;
  v_track := CASE
    WHEN LOWER(NEW.category) IN ('infrastructure', 'platform') THEN 'A'
    WHEN LOWER(NEW.category) IN ('quality', 'testing', 'qa') THEN 'C'
    ELSE 'B'  -- Default to Features track
  END;
  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS(
      SELECT 1 FROM sd_baseline_items
      WHERE baseline_id = v_active_baseline_id
        AND sd_id = NEW.id
    ) INTO v_baseline_item_exists;
    IF NOT v_baseline_item_exists THEN
      INSERT INTO sd_baseline_items (
        baseline_id,
        sd_id,
        sequence_rank,
        track,
        is_ready,
        created_at
      ) VALUES (
        v_active_baseline_id,
        NEW.id,
        COALESCE(
          (SELECT MAX(sequence_rank) + 1 FROM sd_baseline_items WHERE baseline_id = v_active_baseline_id),
          1
        ),
        v_track,
        false,
        NOW()
      );
      RAISE NOTICE 'fn_sync_sd_to_baseline: Added SD % to baseline % (Track %)', NEW.id, v_active_baseline_id, v_track;
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
          AND sd_id = NEW.id;
        RAISE NOTICE 'fn_sync_sd_to_baseline: Marked SD % as completed in baseline', NEW.id;
      ELSIF OLD.status = 'completed' AND NEW.status IN ('active', 'planning', 'in_progress') THEN
        UPDATE sd_baseline_items
        SET
          is_ready = true,
          notes = COALESCE(notes, '') || E'\nReactivated: ' || NOW()::text
        WHERE baseline_id = v_active_baseline_id
          AND sd_id = NEW.id;
        RAISE NOTICE 'fn_sync_sd_to_baseline: Reactivated SD % in baseline', NEW.id;
      ELSIF NEW.status IN ('active', 'in_progress') THEN
        UPDATE sd_baseline_items
        SET is_ready = true
        WHERE baseline_id = v_active_baseline_id
          AND sd_id = NEW.id;
      END IF;
    END IF;
    IF OLD.category IS DISTINCT FROM NEW.category THEN
      UPDATE sd_baseline_items
      SET track = v_track
      WHERE baseline_id = v_active_baseline_id
        AND sd_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- (B) RESTORE prior view definition (string-only split_part deps_satisfied)
-- ============================================================================
CREATE OR REPLACE VIEW public.v_sd_next_candidates AS
 WITH active_baseline AS (
         SELECT sd_execution_baselines.id
           FROM sd_execution_baselines
          WHERE sd_execution_baselines.is_active = true
         LIMIT 1
        ), dependency_status AS (
         SELECT bi_1.sd_id,
            bi_1.sequence_rank,
            bi_1.track,
            bi_1.dependencies_snapshot,
            COALESCE(( SELECT count(*) = 0
                   FROM jsonb_array_elements_text(bi_1.dependencies_snapshot) dep(value)
                  WHERE NOT (EXISTS ( SELECT 1
                           FROM strategic_directives_v2 sd2
                          WHERE sd2.sd_key = split_part(dep.value, ' '::text, 1) AND sd2.status::text = 'completed'::text))), true) AS deps_satisfied
           FROM sd_baseline_items bi_1
          WHERE bi_1.baseline_id = (( SELECT active_baseline.id
                   FROM active_baseline))
        )
 SELECT bi.sd_id,
    sd.title,
    sd.priority,
    sd.status,
    sd.progress_percentage,
    bi.sequence_rank,
    bi.track,
    bi.track_name,
    bi.estimated_effort_hours,
    bi.dependency_health_score,
    ds.deps_satisfied,
    ea.status AS execution_status,
    sd.is_working_on,
        CASE
            WHEN sd.is_working_on = true THEN 1
            WHEN ea.status = 'in_progress'::text THEN 2
            WHEN ds.deps_satisfied AND (sd.status::text = ANY (ARRAY['draft'::character varying::text, 'active'::character varying::text])) THEN 3
            WHEN sd.progress_percentage > 0 AND sd.progress_percentage < 100 THEN 4
            ELSE 5
        END AS readiness_priority
   FROM sd_baseline_items bi
     JOIN strategic_directives_v2 sd ON bi.sd_id = sd.sd_key
     JOIN dependency_status ds ON bi.sd_id = ds.sd_id
     LEFT JOIN sd_execution_actuals ea ON bi.sd_id = ea.sd_id AND ea.baseline_id = (( SELECT active_baseline.id
           FROM active_baseline))
  WHERE bi.baseline_id = (( SELECT active_baseline.id
           FROM active_baseline)) AND (sd.status::text <> ALL (ARRAY['completed'::character varying::text, 'cancelled'::character varying::text, 'deferred'::character varying::text]))
  ORDER BY (
        CASE
            WHEN sd.is_working_on = true THEN 1
            WHEN ea.status = 'in_progress'::text THEN 2
            WHEN ds.deps_satisfied AND (sd.status::text = ANY (ARRAY['draft'::character varying::text, 'active'::character varying::text])) THEN 3
            WHEN sd.progress_percentage > 0 AND sd.progress_percentage < 100 THEN 4
            ELSE 5
        END), bi.sequence_rank;

-- ============================================================================
-- (C) REVERSE the data reconciliation from the backup table
-- ============================================================================
DO $undo$
DECLARE
  v_restored_converted INTEGER := 0;
  v_reinserted INTEGER := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('sd_baseline_items_recon_SD-LEO-INFRA-FIX-NEXT-CANDIDATES-001'));

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'sd_baseline_items_recon_backup') THEN
    RAISE NOTICE 'down: backup table absent; no data to reverse.';
    RETURN;
  END IF;

  -- Restore converted rows' sd_id back to the original UUID (keyed on the PK).
  UPDATE sd_baseline_items bi
  SET sd_id = b.sd_id
  FROM public.sd_baseline_items_recon_backup b
  WHERE b.recon_action = 'converted'
    AND bi.id = b.item_id
    AND bi.sd_id = b.resolved_sd_key;  -- only if still in converted state
  GET DIAGNOSTICS v_restored_converted = ROW_COUNT;

  -- Re-insert deleted colliders with their original identity.
  INSERT INTO sd_baseline_items
    (id, baseline_id, sd_id, sequence_rank, track, track_name,
     dependencies_snapshot, dependency_health_score, is_ready, notes,
     estimated_effort_hours, created_at)
  SELECT b.item_id, b.baseline_id, b.sd_id, b.sequence_rank, b.track, b.track_name,
         b.dependencies_snapshot, b.dependency_health_score, b.is_ready, b.notes,
         b.estimated_effort_hours, b.created_at
  FROM public.sd_baseline_items_recon_backup b
  WHERE b.recon_action = 'deleted'
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_reinserted = ROW_COUNT;

  RAISE NOTICE 'down: restored_converted=%, reinserted_colliders=%', v_restored_converted, v_reinserted;

  -- Leave the backup table in place for audit. To fully clean up after a
  -- confirmed-good rollback, drop it manually:
  --   DROP TABLE public.sd_baseline_items_recon_backup;
END
$undo$;
