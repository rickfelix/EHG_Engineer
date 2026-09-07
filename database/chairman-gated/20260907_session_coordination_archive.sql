-- ============================ STAGED. NOT APPLIED. ============================
-- CHAIRMAN-GATED: any live-DB write (additive new-table schema included) is denied by the
-- permission classifier at EXEC time regardless of shape. No @approved-by attestation — the
-- builder stages; the chairman applies (matching the standing convention: "the builder
-- stages; the chairman applies").
--
-- SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D — FR-3.
--
-- WHY THIS TABLE EXISTS.
-- session_coordination is an unbounded-growth operational table (WORK_ASSIGNMENT, roll_call,
-- worker_signal, coordinator_reply rows, etc.) with no existing archival path — every row a
-- fleet worker or coordinator has ever written lives in the one live table forever. This
-- migration adds a same-shaped archive table so a FUTURE retention job (not this SD's scope)
-- has somewhere to move old rows to, without losing them or widening the live table's working
-- set indefinitely.
--
-- SCOPE BOUNDARY (explicit, per the PRD): this migration creates the archive table and its
-- access posture ONLY. It does NOT (a) move any existing rows, (b) add a scheduled archival
-- job, or (c) migrate any existing reader of session_coordination to read through the archive.
-- lib/coordination/query-with-archive.cjs (this SD) gives a NEW caller a way to query both
-- tables together; it does not rewire any existing call site. Those are deferred follow-on
-- work, tracked for a future SD rather than bundled here.
--
-- COLUMN SET mirrors public.session_coordination exactly (confirmed live 2026-09-06: id,
-- target_session, target_sd, message_type, subject, body, payload, sender_session,
-- sender_type, created_at, expires_at, read_at, acknowledged_at, correlation_id,
-- delivered_at), plus one addition: archived_at, stamped at move time so a future retention
-- job's own audit trail doesn't have to be reconstructed from created_at.
--
-- id is NOT a fresh gen_random_uuid() default here — an archived row keeps the SAME id it had
-- live, so a correlation_id or a cited row id in an older signal/memory still resolves to the
-- same row after a move.

CREATE TABLE IF NOT EXISTS public.session_coordination_archive (
  id              UUID PRIMARY KEY,
  target_session  TEXT,
  target_sd       TEXT,
  message_type    TEXT,
  subject         TEXT,
  body            TEXT,
  payload         JSONB,
  sender_session  TEXT,
  sender_type     TEXT,
  created_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  correlation_id  TEXT,
  delivered_at    TIMESTAMPTZ,

  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.session_coordination_archive IS
  'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D FR-3: same-shaped archive for public.session_coordination. Moving rows here and scheduling that move are OUT OF SCOPE for this migration -- it only creates somewhere for a future retention job to move rows to. id is preserved (not regenerated) so old citations still resolve.';
COMMENT ON COLUMN public.session_coordination_archive.archived_at IS
  'When this row was moved out of the live table -- distinct from created_at (when the row was originally written).';

-- Mirrors the read patterns this SD's own gauges use against the live table (target_session +
-- recency, and message_type-scoped scans).
CREATE INDEX IF NOT EXISTS session_coordination_archive_target_session_idx
  ON public.session_coordination_archive (target_session, created_at DESC);
CREATE INDEX IF NOT EXISTS session_coordination_archive_message_type_idx
  ON public.session_coordination_archive (message_type, created_at DESC);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ACCESS POSTURE. Same posture as the live table (20260804_session_coordination_revoke_authenticated_writes.sql):
-- session_coordination is fleet/coordinator-internal infrastructure, never end-user-facing, so the
-- archive copy of it carries the identical restriction.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.session_coordination_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_coordination_archive_service_role ON public.session_coordination_archive;
CREATE POLICY session_coordination_archive_service_role ON public.session_coordination_archive
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.session_coordination_archive FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.session_coordination_archive TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- LANDING ASSERTIONS.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
DO $verify$
BEGIN
  IF to_regclass('public.session_coordination_archive') IS NULL THEN
    RAISE EXCEPTION 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D: public.session_coordination_archive did not land';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'session_coordination_archive'
      AND grantee IN ('anon','authenticated','PUBLIC')
  ) THEN
    RAISE EXCEPTION 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D: a non-service grant is present on session_coordination_archive';
  END IF;
END
$verify$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--   DROP TABLE IF EXISTS public.session_coordination_archive;
-- ─────────────────────────────────────────────────────────────────────────────────────────────
