-- ============================================================================
-- Chairman Preferences Table & chairman_decisions Extension
-- SD-LEO-INFRA-CHAIRMAN-PREFS-001
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Create chairman_preferences table
-- ============================================================================
CREATE TABLE IF NOT EXISTS chairman_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chairman_id TEXT NOT NULL,
  venture_id TEXT,  -- NULL = global preference
  preference_key TEXT NOT NULL,
  preference_value JSONB NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('number', 'string', 'boolean', 'object', 'array')),
  source TEXT NOT NULL DEFAULT 'chairman_directive',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each key defined at most once per scope
  CONSTRAINT uq_chairman_pref_scope UNIQUE (chairman_id, venture_id, preference_key)
);

-- Indexes for Filter Engine read patterns
CREATE INDEX IF NOT EXISTS idx_chairman_prefs_chairman_venture
  ON chairman_preferences (chairman_id, venture_id);

CREATE INDEX IF NOT EXISTS idx_chairman_prefs_chairman_key
  ON chairman_preferences (chairman_id, preference_key);

-- Enable RLS
ALTER TABLE chairman_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chairman_preferences_select" ON chairman_preferences
  FOR SELECT USING (true);

CREATE POLICY "chairman_preferences_insert" ON chairman_preferences
  FOR INSERT WITH CHECK (true);

CREATE POLICY "chairman_preferences_update" ON chairman_preferences
  FOR UPDATE USING (true);

CREATE POLICY "chairman_preferences_delete" ON chairman_preferences
  FOR DELETE USING (true);

-- ============================================================================
-- 2. Extend chairman_decisions with preference linkage
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chairman_decisions' AND column_name = 'preference_key'
  ) THEN
    ALTER TABLE chairman_decisions ADD COLUMN preference_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chairman_decisions' AND column_name = 'preference_ref_id'
  ) THEN
    ALTER TABLE chairman_decisions ADD COLUMN preference_ref_id UUID
      REFERENCES chairman_preferences(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chairman_decisions' AND column_name = 'preference_snapshot'
  ) THEN
    ALTER TABLE chairman_decisions ADD COLUMN preference_snapshot JSONB;
  END IF;
END $$;

-- ============================================================================
-- 3. Updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_chairman_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chairman_preferences_updated_at ON chairman_preferences;
CREATE TRIGGER trg_chairman_preferences_updated_at
  BEFORE UPDATE ON chairman_preferences
  FOR EACH ROW EXECUTE FUNCTION update_chairman_preferences_updated_at();

COMMIT;
