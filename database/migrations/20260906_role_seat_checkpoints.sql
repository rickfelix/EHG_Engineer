-- @chairman-gated: applied by the chairman after sign-off (Tier 3: schema; fleet role-seat memory)
-- SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A (CAPA W6 durability, ratification 49656c8c) — FR-1.
--
-- Every role seat (adam/solomon/coordinator/michael) keeps its ENTIRE operational memory in an
-- untracked local markdown file with no database fallback -- the Adam seat lost checkpoints 1
-- through 27 on 2026-09-02 to a single untracked-file removal. This table mirrors each fixed
-- role seat's newest file content, deduped by content hash, with a freshness stamp updated on
-- every mirror tick regardless of whether the content changed (three rounds of PLAN-phase
-- adversarial TESTING review, evidence 79b61564/3fb39af9/732f0d3f/6a201736, converged on this
-- design after finding and closing: a bad session_id-vs-8-char-suffix join, a write/read-side
-- discriminator mismatch, a torn-read risk, and a liveness-gate that would have left an
-- unstaffed seat like Michael permanently unmirrored).
--
-- POSTURE: pg_default_acl grants anon/authenticated full DML on every new relation in this
-- database (re-measured live by prior migrations this week, e.g. 20260906_michael_tables.sql).
-- This table holds full, unredacted role-seat memory -- RLS is service-role-only for BOTH read
-- and write, matching that precedent and 20260905_close_role_flag_secdef_execute_exposure.sql.
--
-- seat_name is a fixed, small CHECK-constrained enum (the CAPA plan's own named role set), never
-- a free-text column and never derived from live claude_sessions membership -- keeping the write
-- side and the read side (scripts/seat-checkpoint-staleness-check.mjs) aligned on one denominator.
-- content_hash carries NO unique constraint (a legitimate revert to prior content is real).
-- session_id is nullable provenance only (the live session that produced a row, if resolvable at
-- write time) -- never part of the freshness query, which reads last_verified_at exclusively.
--
-- CHECKs are INLINE in CREATE TABLE (the DDL tier applies this file twice to prove idempotence).
-- No BEGIN/COMMIT here: scripts/apply-migration.js wraps the transaction itself.
--
-- Rollback: 20260906_role_seat_checkpoints_DOWN.sql (drops the table).

CREATE TABLE IF NOT EXISTS public.role_seat_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_name TEXT NOT NULL CHECK (seat_name IN ('adam', 'solomon', 'coordinator', 'michael')),
  session_id TEXT NULL,
  file_suffix TEXT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS role_seat_checkpoints_seat_name_created_at_idx
  ON public.role_seat_checkpoints (seat_name, created_at DESC);

COMMENT ON TABLE public.role_seat_checkpoints IS 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A FR-1: durable DB mirror of each fixed role seat''s newest session-state file, deduped by content_hash, freshness-stamped via last_verified_at on every tick.';
COMMENT ON COLUMN public.role_seat_checkpoints.seat_name IS 'Fixed 4-value enum, never derived from claude_sessions liveness -- the same denominator the read-side staleness check uses.';
COMMENT ON COLUMN public.role_seat_checkpoints.session_id IS 'Provenance only, nullable -- the live claude_sessions.session_id that produced this row, if resolvable at write time. Never used in the freshness query.';
COMMENT ON COLUMN public.role_seat_checkpoints.last_verified_at IS 'Updated on EVERY mirror tick regardless of whether content_hash changed. This is the ONLY column the daily staleness check reads.';

ALTER TABLE public.role_seat_checkpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_seat_checkpoints_service_role ON public.role_seat_checkpoints;
CREATE POLICY role_seat_checkpoints_service_role ON public.role_seat_checkpoints FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.role_seat_checkpoints FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.role_seat_checkpoints TO service_role;
