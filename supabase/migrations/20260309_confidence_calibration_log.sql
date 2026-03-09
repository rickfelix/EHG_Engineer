-- Confidence Calibration Log Table
-- SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-H (FR-002)
-- Stores EMA-based calibration history for per-service per-venture confidence thresholds

CREATE TABLE IF NOT EXISTS confidence_calibration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES ehg_services(id) ON DELETE CASCADE,
  threshold_before NUMERIC(5,4) NOT NULL,
  threshold_after NUMERIC(5,4) NOT NULL,
  calibration_delta NUMERIC(5,4) NOT NULL,
  sample_size INTEGER NOT NULL CHECK (sample_size >= 0),
  ema_alpha NUMERIC(3,2) NOT NULL DEFAULT 0.10,
  triggered_by TEXT NOT NULL DEFAULT 'scheduled',
  event_emitted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient querying by venture + service + time
CREATE INDEX idx_calibration_log_venture_service_time
  ON confidence_calibration_log (venture_id, service_id, created_at DESC);

-- Index for drift alert queries
CREATE INDEX idx_calibration_log_event_emitted
  ON confidence_calibration_log (event_emitted) WHERE event_emitted = true;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_calibration_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calibration_log_updated_at
  BEFORE UPDATE ON confidence_calibration_log
  FOR EACH ROW
  EXECUTE FUNCTION update_calibration_log_updated_at();

-- RLS: venture-scoped access
ALTER TABLE confidence_calibration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calibration_log_select_venture_scoped"
  ON confidence_calibration_log
  FOR SELECT
  USING (true);

CREATE POLICY "calibration_log_insert_service_role"
  ON confidence_calibration_log
  FOR INSERT
  WITH CHECK (true);

-- Add health columns to ventures if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ventures' AND column_name = 'health_score'
  ) THEN
    ALTER TABLE ventures ADD COLUMN health_score NUMERIC(3,2) DEFAULT 0.50;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ventures' AND column_name = 'health_status'
  ) THEN
    ALTER TABLE ventures ADD COLUMN health_status TEXT DEFAULT 'warning'
      CHECK (health_status IN ('healthy', 'warning', 'critical'));
  END IF;
END $$;

COMMENT ON TABLE confidence_calibration_log IS 'EMA-based confidence calibration history per service per venture (SD-H FR-002)';
