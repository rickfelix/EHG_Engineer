-- Migration: Create chairman_dashboard_config table with stage_overrides column
-- SD: SD-LEO-FEAT-PER-STAGE-AUTO-PROCEED-001
-- US: US-001 - Per-stage auto-proceed overrides
-- Date: 2026-03-18
-- Idempotent: Yes (uses IF NOT EXISTS)
--
-- Purpose: Stores chairman dashboard configuration including per-stage
-- auto-proceed overrides. The stage_overrides JSONB column allows the
-- chairman to configure auto-proceed behavior per evaluation stage.
--
-- stage_overrides structure:
-- {
--   "stage_7": {
--     "auto_proceed": false,
--     "reason": "Manual review required",
--     "set_by": "chairman",
--     "set_at": "2026-03-17T..."
--   }
-- }

-- Step 1: Create the table if it does not exist
CREATE TABLE IF NOT EXISTS chairman_dashboard_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  config_key TEXT NOT NULL DEFAULT 'default',
  stage_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  global_auto_proceed BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  CONSTRAINT uq_chairman_dashboard_config_company_key UNIQUE (company_id, config_key)
);

-- Step 2: Add stage_overrides column if table already existed without it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chairman_dashboard_config'
      AND column_name = 'stage_overrides'
  ) THEN
    ALTER TABLE chairman_dashboard_config
      ADD COLUMN stage_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END
$$;

-- Step 3: Add comments for documentation
COMMENT ON TABLE chairman_dashboard_config IS 'Chairman dashboard configuration including per-stage auto-proceed overrides (SD-LEO-FEAT-PER-STAGE-AUTO-PROCEED-001)';
COMMENT ON COLUMN chairman_dashboard_config.stage_overrides IS 'Per-stage auto-proceed override settings. Keys are stage identifiers (e.g. "stage_7"), values are objects with auto_proceed, reason, set_by, set_at fields.';
COMMENT ON COLUMN chairman_dashboard_config.global_auto_proceed IS 'Global auto-proceed toggle. Individual stage_overrides take precedence over this setting.';
COMMENT ON COLUMN chairman_dashboard_config.config_key IS 'Configuration profile key. "default" is the primary configuration.';
COMMENT ON COLUMN chairman_dashboard_config.company_id IS 'Company this configuration belongs to.';

-- Step 4: Create GIN index on stage_overrides for efficient JSONB querying
CREATE INDEX IF NOT EXISTS idx_chairman_dashboard_config_stage_overrides
  ON chairman_dashboard_config USING GIN (stage_overrides);

-- Step 5: Create updated_at trigger
CREATE OR REPLACE FUNCTION update_chairman_dashboard_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chairman_dashboard_config_updated_at ON chairman_dashboard_config;
CREATE TRIGGER trg_chairman_dashboard_config_updated_at
  BEFORE UPDATE ON chairman_dashboard_config
  FOR EACH ROW
  EXECUTE FUNCTION update_chairman_dashboard_config_updated_at();

-- Step 6: Enable RLS (following chairman table patterns)
ALTER TABLE chairman_dashboard_config ENABLE ROW LEVEL SECURITY;

-- Step 7: Drop existing RLS policies for idempotency
DROP POLICY IF EXISTS select_chairman_dashboard_config_policy ON chairman_dashboard_config;
DROP POLICY IF EXISTS insert_chairman_dashboard_config_policy ON chairman_dashboard_config;
DROP POLICY IF EXISTS update_chairman_dashboard_config_policy ON chairman_dashboard_config;
DROP POLICY IF EXISTS delete_chairman_dashboard_config_policy ON chairman_dashboard_config;

-- Step 8: Create RLS policies - authenticated users can read
CREATE POLICY select_chairman_dashboard_config_policy
  ON chairman_dashboard_config FOR SELECT
  TO authenticated
  USING (true);

-- Step 9: Create RLS policies - service_role can insert
CREATE POLICY insert_chairman_dashboard_config_policy
  ON chairman_dashboard_config FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Step 10: Create RLS policies - service_role can update
CREATE POLICY update_chairman_dashboard_config_policy
  ON chairman_dashboard_config FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Step 11: Create RLS policies - service_role can delete
CREATE POLICY delete_chairman_dashboard_config_policy
  ON chairman_dashboard_config FOR DELETE
  TO service_role
  USING (true);

-- Rollback SQL (for reference only, not executed):
-- DROP TRIGGER IF EXISTS trg_chairman_dashboard_config_updated_at ON chairman_dashboard_config;
-- DROP FUNCTION IF EXISTS update_chairman_dashboard_config_updated_at();
-- DROP TABLE IF EXISTS chairman_dashboard_config;
