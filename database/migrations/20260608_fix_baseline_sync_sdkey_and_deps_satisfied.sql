-- Migration: Fix v_sd_next_candidates root cause
-- SD: SD-LEO-INFRA-FIX-NEXT-CANDIDATES-001
--
-- THREE coupled defects break the worker self_claim queue:
--   1. fn_sync_sd_to_baseline() writes sd_baseline_items.sd_id = NEW.id (UUID),
--      but v_sd_next_candidates JOINs bi.sd_id = sd.sd_key (TEXT). No FK exists,
--      so every trigger-synced row silently fails the JOIN and vanishes from the
--      candidate queue.
--   2. v_sd_next_candidates.deps_satisfied mis-resolves OBJECT-shaped dependency
--      snapshots ({"sd_id":..}/{"sd_key":..}/{"orchestrator":..}) because it ran
--      split_part() over the jsonb TEXT of each element.
--   3. (JS, separate file) scripts/sd-baseline.js had a `|| sd.id` UUID fallback.
--
-- This migration: (A) rewrites the trigger function to write/match sd_key;
-- (B) rewrites the view's deps_satisfied to resolve string/object/null shapes;
-- (C) reversibly reconciles existing resolvable UUID-shaped rows to sd_key
--     (snapshot to backup table, dedup-before-convert). Mass purge of unjoinable
--     test-pollution/orphan rows is DESCOPED (filed as a follow-up SD).
--
-- Reversible: see 20260608_fix_baseline_sync_sdkey_and_deps_satisfied_down.sql
-- No schema changes (function body + view body + data only).

-- ============================================================================
-- (A) TRIGGER FUNCTION: write/match NEW.sd_key instead of NEW.id
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
        COALESCE(
          (SELECT MAX(sequence_rank) + 1 FROM sd_baseline_items WHERE baseline_id = v_active_baseline_id),
          1
        ),
        v_track,
        false,  -- New SDs are not ready by default
        NOW()
      );
      RAISE NOTICE 'fn_sync_sd_to_baseline: Added SD % to baseline % (Track %)', NEW.sd_key, v_active_baseline_id, v_track;
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
$function$;

-- ============================================================================
-- (B) VIEW: multi-shape deps_satisfied resolution
-- ============================================================================
-- deps_satisfied is FALSE only when a dependency element resolves to a REAL,
-- KNOWN strategic directive (by sd_key OR id) that is NOT completed. none/null/
-- empty/prose/unresolvable refs are treated as satisfied (fail-open), preserving
-- the prior COALESCE(count(*)=0, true) intent. Resolves string, object
-- ({sd_key}/{sd_id}/{orchestrator}) and null/empty array shapes.
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
            COALESCE((
              SELECT count(*) = 0
              FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(bi_1.dependencies_snapshot) = 'array'
                          THEN bi_1.dependencies_snapshot
                          ELSE '[]'::jsonb END) AS dep(value)
              CROSS JOIN LATERAL (
                SELECT CASE
                         WHEN jsonb_typeof(dep.value) = 'string'
                           THEN split_part(dep.value #>> '{}', ' '::text, 1)
                         WHEN jsonb_typeof(dep.value) = 'object'
                           THEN COALESCE(dep.value ->> 'sd_key', dep.value ->> 'sd_id', dep.value ->> 'orchestrator')
                         ELSE NULL
                       END AS ref
              ) r
              WHERE r.ref IS NOT NULL
                AND lower(r.ref) <> 'none'
                AND EXISTS (
                  SELECT 1
                  FROM strategic_directives_v2 sd2
                  WHERE (sd2.sd_key = r.ref OR sd2.id::text = r.ref)
                    AND sd2.status::text <> 'completed'::text)
            ), true) AS deps_satisfied
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
-- (C) REVERSIBLE RECONCILIATION of resolvable UUID-shaped rows -> sd_key
-- ============================================================================
-- Atomic + advisory-locked DO block. Snapshots affected rows to a persistent
-- backup table BEFORE any mutation. Dedup-before-convert avoids 23505 on
-- UNIQUE(baseline_id, sd_id). Naturally idempotent: after conversion the
-- resolvable-UUID set is empty, so re-running is a no-op. Bounded to the active
-- baseline and to UUID rows that resolve to a real SD by id. Unjoinable
-- test-pollution / orphan rows are intentionally left untouched.

-- Backup table (persists for migration-down). No constraints -> safe to hold
-- both converted survivors and deleted colliders.
CREATE TABLE IF NOT EXISTS public.sd_baseline_items_recon_backup (
  backup_id         BIGSERIAL PRIMARY KEY,
  recon_action      TEXT NOT NULL,         -- 'converted' | 'deleted'
  resolved_sd_key   TEXT,                  -- the sd_key the UUID resolved to
  backed_up_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  item_id           UUID,                  -- original sd_baseline_items.id
  baseline_id       UUID,
  sd_id             TEXT,                  -- ORIGINAL (UUID) sd_id
  sequence_rank     INTEGER,
  track             TEXT,
  track_name        TEXT,
  dependencies_snapshot JSONB,
  dependency_health_score NUMERIC,
  is_ready          BOOLEAN,
  notes             TEXT,
  estimated_effort_hours NUMERIC,
  created_at        TIMESTAMPTZ
);

DO $recon$
DECLARE
  v_active_baseline_id UUID;
  v_converted INTEGER := 0;
  v_deleted INTEGER := 0;
BEGIN
  -- Serialize against concurrent runs / fleet trigger churn.
  PERFORM pg_advisory_xact_lock(hashtext('sd_baseline_items_recon_SD-LEO-INFRA-FIX-NEXT-CANDIDATES-001'));

  SELECT id INTO v_active_baseline_id
  FROM sd_execution_baselines WHERE is_active = true LIMIT 1;
  IF v_active_baseline_id IS NULL THEN
    RAISE NOTICE 'reconciliation: no active baseline; nothing to do.';
    RETURN;
  END IF;

  -- Resolve each UUID-shaped row to its SD by id (only rows that join to a real SD).
  CREATE TEMP TABLE _resolvable ON COMMIT DROP AS
  SELECT bi.id AS item_id, bi.sd_id AS uuid_sd_id, sd.sd_key AS target_sd_key
  FROM sd_baseline_items bi
  JOIN strategic_directives_v2 sd ON sd.id::text = bi.sd_id
  WHERE bi.baseline_id = v_active_baseline_id
    AND bi.sd_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  -- Classify: collider (a key-shaped row for target_sd_key already exists) -> delete; else convert.
  CREATE TEMP TABLE _classified ON COMMIT DROP AS
  SELECT r.item_id, r.uuid_sd_id, r.target_sd_key,
         EXISTS (
           SELECT 1 FROM sd_baseline_items k
           WHERE k.baseline_id = v_active_baseline_id
             AND k.sd_id = r.target_sd_key
         ) AS is_collider
  FROM _resolvable r;

  -- Snapshot ALL affected rows BEFORE mutation.
  INSERT INTO public.sd_baseline_items_recon_backup
    (recon_action, resolved_sd_key, item_id, baseline_id, sd_id, sequence_rank,
     track, track_name, dependencies_snapshot, dependency_health_score, is_ready,
     notes, estimated_effort_hours, created_at)
  SELECT CASE WHEN c.is_collider THEN 'deleted' ELSE 'converted' END,
         c.target_sd_key, bi.id, bi.baseline_id, bi.sd_id, bi.sequence_rank,
         bi.track, bi.track_name, bi.dependencies_snapshot, bi.dependency_health_score,
         bi.is_ready, bi.notes, bi.estimated_effort_hours, bi.created_at
  FROM _classified c
  JOIN sd_baseline_items bi ON bi.id = c.item_id;

  -- Delete colliders (the key-shaped row already represents the SD).
  DELETE FROM sd_baseline_items bi
  USING _classified c
  WHERE bi.id = c.item_id AND c.is_collider;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Convert survivors UUID -> sd_key.
  UPDATE sd_baseline_items bi
  SET sd_id = c.target_sd_key
  FROM _classified c
  WHERE bi.id = c.item_id AND NOT c.is_collider;
  GET DIAGNOSTICS v_converted = ROW_COUNT;

  RAISE NOTICE 'reconciliation: converted=%, deleted_colliders=% (baseline %)',
    v_converted, v_deleted, v_active_baseline_id;
END
$recon$;
