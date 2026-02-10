-- Chairman Override Tracking
-- Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-H
-- Tracks chairman overrides to system-recommended scores

CREATE TABLE IF NOT EXISTS chairman_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL,
  component TEXT NOT NULL,
  system_score NUMERIC(6,2) NOT NULL,
  override_score NUMERIC(6,2) NOT NULL,
  reason TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('positive', 'negative', 'neutral', 'pending')),
  outcome_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_chairman_overrides_venture ON chairman_overrides(venture_id);
CREATE INDEX IF NOT EXISTS idx_chairman_overrides_component ON chairman_overrides(component);
CREATE INDEX IF NOT EXISTS idx_chairman_overrides_created ON chairman_overrides(created_at DESC);

-- Enable RLS
ALTER TABLE chairman_overrides ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "service_role_full_access_chairman_overrides" ON chairman_overrides;
CREATE POLICY "service_role_full_access_chairman_overrides"
  ON chairman_overrides
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_chairman_overrides_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_chairman_overrides_timestamp ON chairman_overrides;
CREATE TRIGGER trg_update_chairman_overrides_timestamp
  BEFORE UPDATE ON chairman_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_chairman_overrides_timestamp();
