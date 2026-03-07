-- ============================================================================
-- Activate Stage Execution Worker: Schema Alignment
-- ============================================================================
-- SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-017
-- Purpose: Fix the eva_ventures schema gap so the Stage Execution Worker
--          can discover and process ventures. Three changes:
--   1. Add current_lifecycle_stage column to eva_ventures
--   2. AFTER INSERT trigger on ventures → auto-create eva_ventures row
--   3. AFTER UPDATE trigger on ventures → sync current_lifecycle_stage
--   4. Backfill existing ventures into eva_ventures
--
-- Zero changes to stage-execution-worker.js (584 lines) — triggers make
-- existing queries work.
-- ============================================================================

-- ============================================================================
-- STEP 1: Add current_lifecycle_stage column to eva_ventures
-- ============================================================================
ALTER TABLE eva_ventures
  ADD COLUMN IF NOT EXISTS current_lifecycle_stage INTEGER DEFAULT 1
  CHECK (current_lifecycle_stage BETWEEN 1 AND 25);

-- Partial index for the worker's polling query:
-- SELECT * FROM eva_ventures WHERE status='active' AND orchestrator_state='idle'
CREATE INDEX IF NOT EXISTS idx_eva_ventures_worker_poll
  ON eva_ventures (current_lifecycle_stage)
  WHERE status = 'active' AND orchestrator_state = 'idle';

-- ============================================================================
-- STEP 2: AFTER INSERT trigger — auto-create eva_ventures row
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_ventures_to_eva_ventures_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO eva_ventures (
    venture_id,
    name,
    status,
    current_lifecycle_stage,
    orchestrator_state,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    COALESCE(NEW.name, 'Unnamed Venture'),
    COALESCE(NEW.status, 'active'),
    COALESCE(NEW.current_lifecycle_stage, 1),
    'idle',
    NOW(),
    NOW()
  )
  ON CONFLICT (venture_id) DO UPDATE SET
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    current_lifecycle_stage = EXCLUDED.current_lifecycle_stage,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ventures_insert_sync_eva ON ventures;
CREATE TRIGGER trg_ventures_insert_sync_eva
  AFTER INSERT ON ventures
  FOR EACH ROW
  EXECUTE FUNCTION sync_ventures_to_eva_ventures_insert();

-- ============================================================================
-- STEP 3: AFTER UPDATE trigger — sync current_lifecycle_stage
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_ventures_to_eva_ventures_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when current_lifecycle_stage actually changes
  IF OLD.current_lifecycle_stage IS DISTINCT FROM NEW.current_lifecycle_stage THEN
    UPDATE eva_ventures
      SET current_lifecycle_stage = NEW.current_lifecycle_stage,
          updated_at = NOW()
      WHERE venture_id = NEW.id;
  END IF;

  -- Also sync status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE eva_ventures
      SET status = NEW.status,
          updated_at = NOW()
      WHERE venture_id = NEW.id;
  END IF;

  -- Also sync name changes
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE eva_ventures
      SET name = NEW.name,
          updated_at = NOW()
      WHERE venture_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ventures_update_sync_eva ON ventures;
CREATE TRIGGER trg_ventures_update_sync_eva
  AFTER UPDATE ON ventures
  FOR EACH ROW
  EXECUTE FUNCTION sync_ventures_to_eva_ventures_update();

-- ============================================================================
-- STEP 4: Backfill — create eva_ventures rows for all existing ventures
-- ============================================================================
INSERT INTO eva_ventures (
  venture_id,
  name,
  status,
  current_lifecycle_stage,
  orchestrator_state,
  created_at,
  updated_at
)
SELECT
  v.id,
  COALESCE(v.name, 'Unnamed Venture'),
  COALESCE(v.status, 'active'),
  COALESCE(v.current_lifecycle_stage, 1),
  'idle',
  NOW(),
  NOW()
FROM ventures v
WHERE NOT EXISTS (
  SELECT 1 FROM eva_ventures ev WHERE ev.venture_id = v.id
)
ON CONFLICT (venture_id) DO UPDATE SET
  current_lifecycle_stage = EXCLUDED.current_lifecycle_stage,
  status = EXCLUDED.status,
  name = EXCLUDED.name,
  updated_at = NOW();

-- Also update existing eva_ventures rows that are missing current_lifecycle_stage
UPDATE eva_ventures ev
SET current_lifecycle_stage = v.current_lifecycle_stage,
    updated_at = NOW()
FROM ventures v
WHERE ev.venture_id = v.id
  AND (ev.current_lifecycle_stage IS NULL OR ev.current_lifecycle_stage != v.current_lifecycle_stage);

-- ============================================================================
-- SUMMARY
-- ============================================================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM eva_ventures;
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Stage Execution Worker Activation - Complete';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Added: current_lifecycle_stage column to eva_ventures';
  RAISE NOTICE 'Added: idx_eva_ventures_worker_poll partial index';
  RAISE NOTICE 'Added: trg_ventures_insert_sync_eva trigger';
  RAISE NOTICE 'Added: trg_ventures_update_sync_eva trigger';
  RAISE NOTICE 'Backfilled: % eva_ventures rows', v_count;
  RAISE NOTICE '';
END $$;
