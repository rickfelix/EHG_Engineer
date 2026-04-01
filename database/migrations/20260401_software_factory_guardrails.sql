-- Software Factory: Guardrail state table + feedback table extensions
-- SD: SD-LEO-INFRA-SOFTWARE-FACTORY-AUTOMATED-001

-- 1. Create factory_guardrail_state table
CREATE TABLE IF NOT EXISTS factory_guardrail_state (
  venture_id UUID PRIMARY KEY REFERENCES ventures(id),
  corrections_today INTEGER NOT NULL DEFAULT 0,
  kill_switch_active BOOLEAN NOT NULL DEFAULT false,
  last_correction_at TIMESTAMPTZ,
  canary_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_factory_guardrail_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_factory_guardrail_updated ON factory_guardrail_state;
CREATE TRIGGER trg_factory_guardrail_updated
  BEFORE UPDATE ON factory_guardrail_state
  FOR EACH ROW EXECUTE FUNCTION update_factory_guardrail_timestamp();

-- 2. Add Sentry-related columns to feedback table (nullable, non-breaking)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'feedback' AND column_name = 'sentry_issue_id') THEN
    ALTER TABLE feedback ADD COLUMN sentry_issue_id TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'feedback' AND column_name = 'sentry_first_seen') THEN
    ALTER TABLE feedback ADD COLUMN sentry_first_seen TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'feedback' AND column_name = 'auto_correction_status') THEN
    ALTER TABLE feedback ADD COLUMN auto_correction_status TEXT DEFAULT 'pending'
      CHECK (auto_correction_status IN ('pending', 'in_progress', 'resolved', 'failed'));
  END IF;
END $$;

-- 3. Index for efficient polling queries
CREATE INDEX IF NOT EXISTS idx_feedback_sentry_issue ON feedback(sentry_issue_id) WHERE sentry_issue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_auto_correction ON feedback(auto_correction_status) WHERE auto_correction_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_factory_guardrail_venture ON factory_guardrail_state(venture_id);

COMMENT ON TABLE factory_guardrail_state IS 'CRO guardrail state per venture for Software Factory self-healing loop';
COMMENT ON COLUMN feedback.sentry_issue_id IS 'Links feedback row back to Sentry issue for traceability';
COMMENT ON COLUMN feedback.auto_correction_status IS 'Tracks automated correction lifecycle: pending → in_progress → resolved/failed';
