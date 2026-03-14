-- Codebase Health Scoring Tables
-- SD: SD-LEO-INFRA-DEAD-CODE-SCANNER-001
-- Creates storage for health measurements and configurable thresholds

-- Table 1: Health snapshots (periodic measurements)
CREATE TABLE IF NOT EXISTS codebase_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension TEXT NOT NULL,
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  trend_direction TEXT CHECK (trend_direction IN ('improving', 'stable', 'declining', 'new')),
  findings JSONB DEFAULT '[]'::jsonb,
  finding_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  target_application TEXT NOT NULL DEFAULT 'EHG_Engineer',
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table 2: Health config (DB-tunable thresholds per dimension)
CREATE TABLE IF NOT EXISTS codebase_health_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  threshold_warning NUMERIC(5,2) NOT NULL DEFAULT 70,
  threshold_critical NUMERIC(5,2) NOT NULL DEFAULT 50,
  min_occurrences INTEGER NOT NULL DEFAULT 2,
  max_sds_per_cycle INTEGER NOT NULL DEFAULT 2,
  allowlist JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_health_snapshots_dimension ON codebase_health_snapshots(dimension);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_scanned_at ON codebase_health_snapshots(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_dimension_scanned ON codebase_health_snapshots(dimension, scanned_at DESC);

-- RLS Policies
ALTER TABLE codebase_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE codebase_health_config ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "service_role_all_snapshots" ON codebase_health_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_config" ON codebase_health_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read
CREATE POLICY "authenticated_read_snapshots" ON codebase_health_snapshots
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_config" ON codebase_health_config
  FOR SELECT TO authenticated USING (true);

-- Seed default config for dead_code dimension
INSERT INTO codebase_health_config (dimension, enabled, threshold_warning, threshold_critical, min_occurrences, max_sds_per_cycle)
VALUES ('dead_code', true, 70, 50, 2, 2)
ON CONFLICT (dimension) DO NOTHING;
