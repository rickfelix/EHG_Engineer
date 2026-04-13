-- Migration: Create stitch_generation_metrics table
-- SD: SD-STITCH-GENERATION-OBSERVABILITY-AND-ORCH-001-B
-- Purpose: Persist per-screen Stitch generation telemetry for observability

CREATE TABLE IF NOT EXISTS stitch_generation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id),
  screen_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  prompt_char_count INTEGER,
  prompt_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'fired', 'confirmed')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER,
  error_category TEXT,
  error_message TEXT,
  sdk_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for per-venture chronological queries
CREATE INDEX IF NOT EXISTS idx_stitch_gen_metrics_venture_created
  ON stitch_generation_metrics (venture_id, created_at DESC);

-- Index for status-based aggregation
CREATE INDEX IF NOT EXISTS idx_stitch_gen_metrics_status
  ON stitch_generation_metrics (status, created_at DESC);

-- Enable RLS
ALTER TABLE stitch_generation_metrics ENABLE ROW LEVEL SECURITY;

-- service_role: full read/write (used by stitch-client.js)
CREATE POLICY "service_role_all" ON stitch_generation_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- chairman: read-only (used by dashboard/Friday meeting)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chairman') THEN
    EXECUTE 'CREATE POLICY "chairman_select" ON stitch_generation_metrics FOR SELECT TO chairman USING (true)';
  END IF;
END $$;

-- Deny anon and authenticated (no policy = no access with RLS enabled)
