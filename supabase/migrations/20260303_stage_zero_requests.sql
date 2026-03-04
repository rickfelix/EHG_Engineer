-- Migration: stage_zero_requests
-- SD: SD-LEO-FEAT-EXPLORE-OPPORTUNITIES-STAGE-001
-- Purpose: Work queue table for async Stage 0 execution on the Explore Opportunities page.
-- Status lifecycle: pending → claimed → in_progress → completed | failed
-- Date: 2026-03-03

-- ============================================================
-- STATUS ENUM
-- ============================================================
CREATE TYPE stage_zero_status AS ENUM (
  'pending',
  'claimed',
  'in_progress',
  'completed',
  'failed'
);

-- ============================================================
-- TABLE: stage_zero_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS stage_zero_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who submitted and when
  requested_by         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- What is being analysed
  -- At least one of blueprint_id or venture_id must be supplied (CHECK enforces this)
  blueprint_id         UUID REFERENCES opportunity_blueprints(id) ON DELETE SET NULL,
  venture_id           UUID REFERENCES ventures(id) ON DELETE SET NULL,

  -- Context free-form input from the Chairman (prompt / brief)
  prompt               TEXT,

  -- Lifecycle
  status               stage_zero_status NOT NULL DEFAULT 'pending',

  -- Which Claude Code CLI session picked it up
  claimed_by_session   TEXT,
  claimed_at           TIMESTAMPTZ,

  -- Processing timestamps
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,

  -- Output stored once processing completes
  result               JSONB,

  -- Error details on failure
  error_message        TEXT,
  error_details        JSONB,

  -- Optional: priority (0 = normal, higher = more urgent)
  priority             SMALLINT NOT NULL DEFAULT 0,

  -- Metadata bag for future extensibility
  metadata             JSONB NOT NULL DEFAULT '{}',

  -- Constraint: request must target something
  CONSTRAINT must_reference_blueprint_or_venture
    CHECK (blueprint_id IS NOT NULL OR venture_id IS NOT NULL)
);

COMMENT ON TABLE stage_zero_requests IS
  'Work queue for async Stage 0 opportunity analysis. UI inserts pending rows; Claude Code CLI claims and processes them.';

COMMENT ON COLUMN stage_zero_requests.requested_by IS
  'The authenticated Supabase user who created this request.';

COMMENT ON COLUMN stage_zero_requests.claimed_by_session IS
  'Identifier of the Claude Code CLI session that claimed this request (prevents double-processing).';

COMMENT ON COLUMN stage_zero_requests.result IS
  'Structured output once Stage 0 analysis completes. Schema is defined by the CLI processor.';

-- ============================================================
-- INDEXES
-- ============================================================

-- Primary work-queue index: CLI polls pending items ordered by priority + age
CREATE INDEX idx_stage_zero_requests_pending
  ON stage_zero_requests (priority DESC, created_at ASC)
  WHERE status = 'pending';

-- Per-user listing (UI reads own requests)
CREATE INDEX idx_stage_zero_requests_requested_by
  ON stage_zero_requests (requested_by, created_at DESC);

-- Blueprint-level lookup (show all requests for a given blueprint)
CREATE INDEX idx_stage_zero_requests_blueprint_id
  ON stage_zero_requests (blueprint_id)
  WHERE blueprint_id IS NOT NULL;

-- Venture-level lookup
CREATE INDEX idx_stage_zero_requests_venture_id
  ON stage_zero_requests (venture_id)
  WHERE venture_id IS NOT NULL;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_stage_zero_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stage_zero_requests_updated_at
  BEFORE UPDATE ON stage_zero_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_stage_zero_requests_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE stage_zero_requests ENABLE ROW LEVEL SECURITY;

-- Policy 1: Authenticated users can INSERT their own requests
CREATE POLICY insert_own_stage_zero_requests
  ON stage_zero_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requested_by);

-- Policy 2: Authenticated users can SELECT only their own requests
CREATE POLICY select_own_stage_zero_requests
  ON stage_zero_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = requested_by);

-- Policy 3: Service role can do everything (CLI updates status)
-- The service_role bypasses RLS by default in Supabase, so no explicit policy is
-- needed. This comment is intentional documentation that the CLI MUST use the
-- SERVICE_ROLE_KEY (not ANON_KEY) when updating status, claimed_by_session, result,
-- error_message, etc.

-- Policy 4: Authenticated users can UPDATE priority/prompt on their OWN pending rows
-- (allows cancellation or reprioritisation before the CLI claims it)
CREATE POLICY update_own_pending_stage_zero_requests
  ON stage_zero_requests
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = requested_by AND status = 'pending')
  WITH CHECK (auth.uid() = requested_by);

-- ============================================================
-- ROLLBACK (run manually if migration needs reverting)
-- ============================================================
-- DROP TRIGGER IF EXISTS trg_stage_zero_requests_updated_at ON stage_zero_requests;
-- DROP FUNCTION IF EXISTS update_stage_zero_requests_updated_at();
-- DROP TABLE IF EXISTS stage_zero_requests;
-- DROP TYPE IF EXISTS stage_zero_status;
