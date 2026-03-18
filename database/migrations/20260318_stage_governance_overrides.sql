-- Migration: 20260318_stage_governance_overrides.sql
-- SD: SD-LEO-FEAT-PER-STAGE-AUTO-PROCEED-001
-- Purpose: Add stage governance override columns to chairman_dashboard_config
--
-- stage_overrides JSONB structure:
-- {
--   "5":  {"auto_proceed": false, "set_by": "chairman", "set_at": "2026-03-18T00:00:00Z"},
--   "10": {"auto_proceed": true,  "set_by": "chairman", "set_at": "2026-03-18T00:00:00Z"}
-- }
--
-- hard_gate_stages: Array of stage numbers that always require manual approval
-- Default: ARRAY[20] (stage 20 = compliance gate)

-- 1. Add stage_overrides JSONB column (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chairman_dashboard_config'
      AND column_name = 'stage_overrides'
  ) THEN
    ALTER TABLE public.chairman_dashboard_config
      ADD COLUMN stage_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added column: stage_overrides';
  ELSE
    RAISE NOTICE 'Column stage_overrides already exists - skipping';
  END IF;
END $$;

-- 2. Add hard_gate_stages INTEGER[] column (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chairman_dashboard_config'
      AND column_name = 'hard_gate_stages'
  ) THEN
    ALTER TABLE public.chairman_dashboard_config
      ADD COLUMN hard_gate_stages INTEGER[] NOT NULL DEFAULT ARRAY[20];
    RAISE NOTICE 'Added column: hard_gate_stages';
  ELSE
    RAISE NOTICE 'Column hard_gate_stages already exists - skipping';
  END IF;
END $$;

-- 3. Create GIN index on stage_overrides (idempotent)
CREATE INDEX IF NOT EXISTS idx_chairman_dashboard_config_stage_overrides
  ON public.chairman_dashboard_config USING GIN (stage_overrides);

-- 4. Add column comments for documentation
COMMENT ON COLUMN public.chairman_dashboard_config.stage_overrides IS
  'Per-stage auto-proceed overrides. Keys are stage numbers (as strings), values are {auto_proceed, set_by, set_at} objects.';

COMMENT ON COLUMN public.chairman_dashboard_config.hard_gate_stages IS
  'Array of stage numbers that always require manual chairman approval regardless of auto-proceed settings. Default: [20] (compliance gate).';

-- Rollback SQL (for reference):
-- ALTER TABLE public.chairman_dashboard_config DROP COLUMN IF EXISTS hard_gate_stages;
-- ALTER TABLE public.chairman_dashboard_config DROP COLUMN IF EXISTS stage_overrides;
-- DROP INDEX IF EXISTS idx_chairman_dashboard_config_stage_overrides;
