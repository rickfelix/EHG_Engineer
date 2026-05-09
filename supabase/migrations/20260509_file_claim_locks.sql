-- ============================================================================
-- Migration: file_claim_locks (per-file claim layer for parallel-worker coordination)
-- SD: SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001
-- Phase: PLAN-validated, EXEC-applied
-- Author: EXEC agent
-- ============================================================================
-- PURPOSE:
--   Add a per-file claim layer alongside the existing per-SD claim
--   (strategic_directives_v2.claiming_session_id). When a worker session
--   takes a write lock on path/to/file.tsx, peer worker sessions attempting
--   Write to that same path get a clear blocker via the PreToolUse hook
--   (scripts/hooks/pre-tool-enforce.cjs ENFORCEMENT 14).
--
-- DESIGN:
--   * UNIQUE(file_path) — at most one holder per path at any time
--   * holder_session_id FK to claude_sessions.id ON DELETE CASCADE
--     -> orphan rows impossible after parent claude_sessions deletion
--   * Service-role-only RLS (no user-level access)
--   * Idempotent: every CREATE uses IF NOT EXISTS
--
-- AUTO-RELEASE PATHS (FR-5):
--   (a) .husky/post-commit hook DELETEs rows for files in HEAD commit
--   (b) scripts/stale-session-sweep.cjs DELETEs rows older than 10min heartbeat
--   (c) 4 sibling release sites co-clear holder_session_id alongside their
--       existing strategic_directives_v2.claiming_session_id clear:
--         - scripts/handoff.js cleanup
--         - scripts/sd-start.js --force-reclaim
--         - scripts/stale-session-sweep.cjs
--         - lib/claim-validity-gate.js orphaned-claim auto-release
--
-- ROLLBACK PLAN (manual):
--   BEGIN;
--     DROP TABLE IF EXISTS public.file_claim_locks CASCADE;
--   COMMIT;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.file_claim_locks (
  id                  uuid         NOT NULL DEFAULT gen_random_uuid(),
  file_path           text         NOT NULL,
  holder_session_id   uuid         NOT NULL,
  sd_id               varchar(50)  NULL,
  branch              text         NULL,
  claimed_at          timestamptz  NOT NULL DEFAULT now(),
  heartbeat_at        timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT file_claim_locks_pkey PRIMARY KEY (id),
  CONSTRAINT file_claim_locks_path_unique UNIQUE (file_path),
  CONSTRAINT file_claim_locks_holder_fk FOREIGN KEY (holder_session_id)
    REFERENCES public.claude_sessions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_file_claim_locks_holder
  ON public.file_claim_locks (holder_session_id);

CREATE INDEX IF NOT EXISTS idx_file_claim_locks_heartbeat
  ON public.file_claim_locks (heartbeat_at);

CREATE INDEX IF NOT EXISTS idx_file_claim_locks_sd
  ON public.file_claim_locks (sd_id);

ALTER TABLE public.file_claim_locks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'file_claim_locks'
      AND policyname = 'service_role_all_file_claim_locks'
  ) THEN
    CREATE POLICY service_role_all_file_claim_locks
      ON public.file_claim_locks
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.file_claim_locks IS
  'Per-file claim layer (SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001). One holder per file_path enforced by UNIQUE constraint. Auto-released on git commit, stale heartbeat (>10min), or via 4 sibling release sites that also clear strategic_directives_v2.claiming_session_id.';

COMMIT;
