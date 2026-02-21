-- Migration: Create missions table (tracked)
-- SD: SD-LEO-INFRA-GOVERNANCE-STACK-QUALITY-001
-- Note: Table already exists in production. This migration documents the schema
-- and uses IF NOT EXISTS for idempotent re-application.

-- ============================================================================
-- Table: missions
-- Purpose: Organizational mission statement management with versioning
-- ============================================================================

CREATE TABLE IF NOT EXISTS missions (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  venture_id    UUID,
  mission_text  TEXT        NOT NULL,
  version       INTEGER     NOT NULL DEFAULT 1,
  status        TEXT        NOT NULL DEFAULT 'draft'::text,
  proposed_by   TEXT,
  approved_by   TEXT,
  reasoning     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT missions_pkey PRIMARY KEY (id),
  CONSTRAINT missions_venture_id_fkey FOREIGN KEY (venture_id) REFERENCES ventures(id),
  CONSTRAINT missions_status_check CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]))
);

-- Enforce at most one active mission per venture
CREATE UNIQUE INDEX IF NOT EXISTS idx_missions_active_per_venture
  ON missions (venture_id) WHERE (status = 'active'::text);

-- Auto-update updated_at timestamp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_missions_updated_at'
  ) THEN
    CREATE TRIGGER set_missions_updated_at
      BEFORE UPDATE ON missions
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

-- RLS: Enable and grant service_role full access
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'missions'
  ) THEN
    CREATE POLICY service_role_all ON missions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
