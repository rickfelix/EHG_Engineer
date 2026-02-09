-- Migration: Telemetry Thresholds Configuration Table
-- SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001B
-- Purpose: Store configurable thresholds for auto-SD creation from telemetry anomalies
-- Date: 2026-02-09

-- =====================================================
-- Table: telemetry_thresholds
-- =====================================================
-- This table stores configurable thresholds that control when telemetry anomalies
-- trigger automatic SD creation. Thresholds can be set globally or per dimension
-- (phase, gate, subagent, etc.).

CREATE TABLE IF NOT EXISTS telemetry_thresholds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Dimension identification
    dimension_type text NOT NULL,
    dimension_key text, -- NULL means default for that dimension_type

    -- Anomaly detection thresholds
    threshold_ratio numeric NOT NULL DEFAULT 3.0, -- How many times baseline = anomaly (e.g., 3.0 = 3x baseline)
    min_samples integer NOT NULL DEFAULT 3, -- Minimum samples required before anomaly detection
    baseline_window_days integer NOT NULL DEFAULT 7, -- Days to look back for baseline calculation
    lookback_window_days integer NOT NULL DEFAULT 1, -- Days to look for recent anomalies

    -- Rate limiting (prevent SD spam)
    max_per_run integer NOT NULL DEFAULT 3, -- Max SDs created in single telemetry analysis run
    max_per_day integer NOT NULL DEFAULT 10, -- Max SDs created per day (all runs combined)
    cooldown_hours integer NOT NULL DEFAULT 24, -- Hours before same dimension can trigger again

    -- Feature flag
    enable_auto_create boolean NOT NULL DEFAULT true, -- Master switch for auto-SD creation

    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- =====================================================
-- Constraints
-- =====================================================

-- Enforce valid dimension_type values
ALTER TABLE telemetry_thresholds
ADD CONSTRAINT IF NOT EXISTS telemetry_thresholds_dimension_type_check
CHECK (dimension_type IN ('global', 'phase', 'gate', 'subagent', 'handoff'));

-- =====================================================
-- Indexes
-- =====================================================

-- Unique index ensures only one default per dimension_type (NULL dimension_key)
-- and one specific threshold per (dimension_type, dimension_key) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_thresholds_unique_dimension
ON telemetry_thresholds (dimension_type, COALESCE(dimension_key, '__global__'));

-- Index for lookups by dimension
CREATE INDEX IF NOT EXISTS idx_telemetry_thresholds_dimension
ON telemetry_thresholds(dimension_type, dimension_key);

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE telemetry_thresholds IS
'Configurable thresholds for telemetry-based anomaly detection and auto-SD creation.
Each row defines thresholds for a specific dimension (phase, gate, subagent) or a global default.
dimension_key=NULL means "default for this dimension_type".';

COMMENT ON COLUMN telemetry_thresholds.dimension_type IS
'Type of dimension this threshold applies to: global, phase, gate, subagent, or handoff';

COMMENT ON COLUMN telemetry_thresholds.dimension_key IS
'Specific dimension value (e.g., "LEAD", "EXEC_CODE_QUALITY") or NULL for default';

COMMENT ON COLUMN telemetry_thresholds.threshold_ratio IS
'Multiplier over baseline that triggers anomaly (e.g., 3.0 = execution took 3x longer than baseline)';

COMMENT ON COLUMN telemetry_thresholds.min_samples IS
'Minimum number of historical samples required before anomaly detection activates';

COMMENT ON COLUMN telemetry_thresholds.baseline_window_days IS
'Number of days to look back when calculating baseline metrics';

COMMENT ON COLUMN telemetry_thresholds.lookback_window_days IS
'Number of days to look back when checking for recent anomalies (cooldown check)';

COMMENT ON COLUMN telemetry_thresholds.max_per_run IS
'Maximum number of SDs that can be auto-created in a single telemetry analysis run';

COMMENT ON COLUMN telemetry_thresholds.max_per_day IS
'Maximum number of SDs that can be auto-created per day across all runs';

COMMENT ON COLUMN telemetry_thresholds.cooldown_hours IS
'Hours that must pass before the same dimension can trigger another auto-SD';

COMMENT ON COLUMN telemetry_thresholds.enable_auto_create IS
'Master switch to enable/disable auto-SD creation for this threshold';

-- =====================================================
-- Default Configuration
-- =====================================================

-- Insert global default thresholds
INSERT INTO telemetry_thresholds (
    dimension_type,
    dimension_key,
    threshold_ratio,
    min_samples,
    baseline_window_days,
    lookback_window_days,
    max_per_run,
    max_per_day,
    cooldown_hours,
    enable_auto_create
) VALUES (
    'global',
    NULL, -- NULL = applies to all dimensions if no specific override
    3.0, -- 3x baseline = anomaly
    3, -- Need at least 3 historical samples
    7, -- Look back 7 days for baseline
    1, -- Check last 1 day for recent anomalies
    3, -- Max 3 SDs per analysis run
    10, -- Max 10 SDs per day
    24, -- 24-hour cooldown per dimension
    true -- Auto-SD creation enabled by default
)
ON CONFLICT (dimension_type, COALESCE(dimension_key, '__global__'))
DO NOTHING;

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

ALTER TABLE telemetry_thresholds ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for server-side operations)
DROP POLICY IF EXISTS service_role_all_telemetry_thresholds ON telemetry_thresholds;
CREATE POLICY service_role_all_telemetry_thresholds
ON telemetry_thresholds
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can read thresholds (for dashboard display)
DROP POLICY IF EXISTS authenticated_read_telemetry_thresholds ON telemetry_thresholds;
CREATE POLICY authenticated_read_telemetry_thresholds
ON telemetry_thresholds
FOR SELECT
TO authenticated
USING (true);

-- =====================================================
-- Update Trigger
-- =====================================================

CREATE OR REPLACE FUNCTION update_telemetry_thresholds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS telemetry_thresholds_updated_at ON telemetry_thresholds;
CREATE TRIGGER telemetry_thresholds_updated_at
BEFORE UPDATE ON telemetry_thresholds
FOR EACH ROW
EXECUTE FUNCTION update_telemetry_thresholds_updated_at();

-- =====================================================
-- Verification Query
-- =====================================================

DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*) INTO v_count FROM telemetry_thresholds WHERE dimension_type = 'global' AND dimension_key IS NULL;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'Migration verification failed: Global default threshold not inserted';
    END IF;

    RAISE NOTICE 'Migration successful: telemetry_thresholds table created with % rows', v_count;
END $$;
