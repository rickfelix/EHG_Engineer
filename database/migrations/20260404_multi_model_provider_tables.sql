-- Migration: Multi-Model Board Deliberation Provider Tables
-- SD: SD-LEO-INFRA-MULTI-MODEL-BOARD-001
-- Adds provider_seat_assignments (audit trail) and provider_rotation_state (scheduler)

-- Provider seat assignments: records which provider/model was assigned to each seat per session
CREATE TABLE IF NOT EXISTS provider_seat_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  seat_code TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'google', 'openai')),
  model_id TEXT NOT NULL,
  round_number INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_seat_assignments_session ON provider_seat_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_provider_seat_assignments_created ON provider_seat_assignments(created_at);

COMMENT ON TABLE provider_seat_assignments IS 'Audit trail of provider/model assignments per board seat per deliberation session';

-- Provider rotation state: tracks Latin-square rotation position
CREATE TABLE IF NOT EXISTS provider_rotation_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rotation_index INT NOT NULL DEFAULT 0,
  last_rotation JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial rotation state
INSERT INTO provider_rotation_state (id, rotation_index, last_rotation)
VALUES (1, 0, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE provider_rotation_state IS 'Single-row table tracking current position in Latin-square provider rotation';

-- Add metadata column to debate_arguments if not exists (for provider_used tracking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'debate_arguments' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE debate_arguments ADD COLUMN metadata JSONB DEFAULT NULL;
    COMMENT ON COLUMN debate_arguments.metadata IS 'Extensible metadata including provider_used and model_id for multi-model tracking';
  END IF;
END $$;
