-- Migration: Fix eva_ventures status sync trigger functions
-- Problem: ventures.status uses venture_status_enum (active, paused, completed, cancelled, archived)
--          eva_ventures.status uses check constraint (active, paused, killed, graduated)
--          Sync triggers copy status directly without mapping, causing CHECK constraint violations
--          when a venture is completed, cancelled, or archived.
--
-- Fix: Add status mapping logic to both insert and update sync trigger functions.
-- Mapping:
--   active    -> active     (no change)
--   paused    -> paused     (no change)
--   cancelled -> killed     (venture was terminated)
--   completed -> graduated  (venture succeeded)
--   archived  -> paused     (archived ventures are dormant, closest semantic match)
--
-- Date: 2026-03-15

-- =============================================================================
-- 1. Fix the INSERT sync trigger function
-- =============================================================================
CREATE OR REPLACE FUNCTION public.sync_ventures_to_eva_ventures_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mapped_status TEXT;
BEGIN
  -- Map venture_status_enum values to eva_ventures status values
  v_mapped_status := CASE COALESCE(NEW.status::text, 'active')
    WHEN 'active'    THEN 'active'
    WHEN 'paused'    THEN 'paused'
    WHEN 'cancelled' THEN 'killed'
    WHEN 'completed' THEN 'graduated'
    WHEN 'archived'  THEN 'paused'
    ELSE 'active'  -- safe default for any unexpected value
  END;

  INSERT INTO eva_ventures (
    venture_id, name, status, current_lifecycle_stage,
    orchestrator_state, created_at, updated_at
  ) VALUES (
    NEW.id,
    COALESCE(NEW.name, 'Unnamed Venture'),
    v_mapped_status,
    COALESCE(NEW.current_lifecycle_stage, 1),
    'idle', NOW(), NOW()
  )
  ON CONFLICT (venture_id) DO UPDATE SET
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    current_lifecycle_stage = EXCLUDED.current_lifecycle_stage,
    updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- =============================================================================
-- 2. Fix the UPDATE sync trigger function
-- =============================================================================
CREATE OR REPLACE FUNCTION public.sync_ventures_to_eva_ventures_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mapped_status TEXT;
BEGIN
  IF OLD.current_lifecycle_stage IS DISTINCT FROM NEW.current_lifecycle_stage THEN
    UPDATE eva_ventures
      SET current_lifecycle_stage = NEW.current_lifecycle_stage,
          updated_at = NOW()
      WHERE venture_id = NEW.id;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Map venture_status_enum values to eva_ventures status values
    v_mapped_status := CASE NEW.status::text
      WHEN 'active'    THEN 'active'
      WHEN 'paused'    THEN 'paused'
      WHEN 'cancelled' THEN 'killed'
      WHEN 'completed' THEN 'graduated'
      WHEN 'archived'  THEN 'paused'
      ELSE 'active'  -- safe default for any unexpected value
    END;

    UPDATE eva_ventures
      SET status = v_mapped_status, updated_at = NOW()
      WHERE venture_id = NEW.id;
  END IF;

  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE eva_ventures
      SET name = NEW.name, updated_at = NOW()
      WHERE venture_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- =============================================================================
-- ROLLBACK (if needed):
-- Restore original functions without status mapping:
--
-- CREATE OR REPLACE FUNCTION public.sync_ventures_to_eva_ventures_insert()
--  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
-- BEGIN
--   INSERT INTO eva_ventures (venture_id, name, status, current_lifecycle_stage,
--     orchestrator_state, created_at, updated_at)
--   VALUES (NEW.id, COALESCE(NEW.name, 'Unnamed Venture'),
--     COALESCE(NEW.status, 'active'), COALESCE(NEW.current_lifecycle_stage, 1),
--     'idle', NOW(), NOW())
--   ON CONFLICT (venture_id) DO UPDATE SET
--     name = EXCLUDED.name, status = EXCLUDED.status,
--     current_lifecycle_stage = EXCLUDED.current_lifecycle_stage, updated_at = NOW();
--   RETURN NEW;
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.sync_ventures_to_eva_ventures_update()
--  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
-- BEGIN
--   IF OLD.current_lifecycle_stage IS DISTINCT FROM NEW.current_lifecycle_stage THEN
--     UPDATE eva_ventures SET current_lifecycle_stage = NEW.current_lifecycle_stage,
--       updated_at = NOW() WHERE venture_id = NEW.id;
--   END IF;
--   IF OLD.status IS DISTINCT FROM NEW.status THEN
--     UPDATE eva_ventures SET status = NEW.status, updated_at = NOW()
--       WHERE venture_id = NEW.id;
--   END IF;
--   IF OLD.name IS DISTINCT FROM NEW.name THEN
--     UPDATE eva_ventures SET name = NEW.name, updated_at = NOW()
--       WHERE venture_id = NEW.id;
--   END IF;
--   RETURN NEW;
-- END;
-- $function$;
-- =============================================================================
