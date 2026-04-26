-- Migration: worker_spawn_requests table for coordinator-driven worker revival
-- SD: SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001 (FR-1)
-- Purpose: DB-queryable revival contract — coordinator INSERTs requests, an
--          external spawn-execution layer (out of scope for this SD) consumes.
--
-- Schema notes (DATABASE sub-agent design review row 06fe1ab3-…):
--   - claude_sessions.session_id is TEXT (not UUID); FKs match.
--   - ON DELETE SET NULL preserves audit history when sessions rotate.
--   - Partial unique index on (callsign) WHERE status='pending' enforces idempotency.
--   - RLS enabled; service_role retains full access (existing operational pattern).

CREATE TABLE IF NOT EXISTS worker_spawn_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_session_id TEXT REFERENCES claude_sessions(session_id) ON DELETE SET NULL,
  requested_callsign TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','fulfilled','expired','cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_by_session_id TEXT REFERENCES claude_sessions(session_id) ON DELETE SET NULL,
  fulfilled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
  payload JSONB DEFAULT '{}'::jsonb
);

-- Idempotency: at most one pending row per callsign at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_wsr_unique_pending_callsign
  ON worker_spawn_requests (requested_callsign)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wsr_status_requested_at
  ON worker_spawn_requests (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_wsr_requested_by_session_id
  ON worker_spawn_requests (requested_by_session_id);

-- RLS: enable defense-in-depth; service_role has full access (matches operational pattern).
ALTER TABLE worker_spawn_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'worker_spawn_requests' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON worker_spawn_requests
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
