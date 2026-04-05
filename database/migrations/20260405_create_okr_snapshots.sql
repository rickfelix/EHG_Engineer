-- Migration: Create okr_snapshots table
-- Date: 2026-04-05
-- Purpose: Track point-in-time snapshots of OKR key result progress

CREATE TABLE IF NOT EXISTS okr_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key_result_id UUID NOT NULL REFERENCES key_results(id),
  snapshot_date DATE NOT NULL,
  current_value NUMERIC,
  target_value NUMERIC,
  confidence NUMERIC(3,2),
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(key_result_id, snapshot_date)
);

COMMENT ON TABLE okr_snapshots IS 'Point-in-time snapshots of key result progress for trend tracking';
COMMENT ON COLUMN okr_snapshots.confidence IS 'Confidence score 0.00-1.00 that the key result will be achieved';

CREATE INDEX IF NOT EXISTS idx_okr_snapshots_kr_date ON okr_snapshots(key_result_id, snapshot_date DESC);

-- RLS: Service role has full access; authenticated users read-only
ALTER TABLE okr_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON okr_snapshots
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read" ON okr_snapshots
  FOR SELECT USING (auth.role() = 'authenticated');

-- Rollback SQL (for reference):
-- DROP POLICY IF EXISTS "Authenticated users can read" ON okr_snapshots;
-- DROP POLICY IF EXISTS "Service role full access" ON okr_snapshots;
-- DROP INDEX IF EXISTS idx_okr_snapshots_kr_date;
-- DROP TABLE IF EXISTS okr_snapshots;
