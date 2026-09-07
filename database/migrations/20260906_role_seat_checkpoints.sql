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
-- session_id is nullable provenance only, reserved for a live-session UUID if a future write path
-- resolves one -- the current mirror-write (lib/fleet/seat-checkpoint-mirror.cjs) always writes
-- NULL here (EXEC-TO-PLAN TESTING evidence, 2026-09-06: never populated by construction, since
-- resolving it would reintroduce the claude_sessions dependency the write side deliberately
-- dropped -- see FR-3). Never part of the freshness query, which reads last_verified_at exclusively.
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
COMMENT ON COLUMN public.role_seat_checkpoints.session_id IS 'Provenance only, nullable -- reserved for a live claude_sessions.session_id if a future write path resolves one. Always NULL in the current mirror-write (it deliberately has no claude_sessions dependency). Never used in the freshness query.';
COMMENT ON COLUMN public.role_seat_checkpoints.last_verified_at IS 'Updated on EVERY mirror tick regardless of whether content_hash changed. This is the ONLY column the daily staleness check reads.';

ALTER TABLE public.role_seat_checkpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_seat_checkpoints_service_role ON public.role_seat_checkpoints;
CREATE POLICY role_seat_checkpoints_service_role ON public.role_seat_checkpoints FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.role_seat_checkpoints FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.role_seat_checkpoints TO service_role;

-- Parity with 20260906_michael_tables.sql's own DO $verify$ block (EXEC-TO-PLAN SECURITY
-- evidence, 2026-09-06): this file is @chairman-gated, i.e. hand-applied with no CI ever
-- measuring it, so the RLS/GRANT posture the header above only ASSERTS IN A COMMENT is now
-- actually asserted at apply time. The REVOKE at line 56 is itself correct and atomic (apply-
-- migration.js wraps the whole file in BEGIN/COMMIT), so this finds no open hole today -- it
-- exists so a FUTURE change to this file (or a future default-ACL surprise from a role other
-- than anon/authenticated/PUBLIC) fails loud instead of silently.
DO $verify$
BEGIN
  IF lower(coalesce(current_setting('plpgsql.check_asserts', true), 'on')) IN ('off', 'false', '0') THEN
    RAISE EXCEPTION 'ROLE-SEAT-CHECKPOINTS: plpgsql.check_asserts is off — the verify block cannot verify anything';
  END IF;
  ASSERT to_regclass('public.role_seat_checkpoints') IS NOT NULL, 'ROLE-SEAT-CHECKPOINTS: table did not land';
  ASSERT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.role_seat_checkpoints'::regclass AND relrowsecurity),
    'ROLE-SEAT-CHECKPOINTS: RLS is NOT enabled';
  ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'role_seat_checkpoints') = 1,
    'ROLE-SEAT-CHECKPOINTS: expected exactly ONE policy';
  ASSERT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.role_seat_checkpoints'::regclass
      AND p.polname = 'role_seat_checkpoints_service_role'
      AND p.polroles = ARRAY['service_role'::regrole::oid]
      AND p.polcmd = '*'
      AND p.polpermissive
  ), 'ROLE-SEAT-CHECKPOINTS: the policy is missing, renamed, or NOT "FOR ALL TO service_role"';
  ASSERT NOT has_table_privilege('anon', 'public.role_seat_checkpoints', 'SELECT'), 'ROLE-SEAT-CHECKPOINTS: anon can SELECT';
  ASSERT NOT has_table_privilege('anon', 'public.role_seat_checkpoints', 'INSERT'), 'ROLE-SEAT-CHECKPOINTS: anon can INSERT';
  ASSERT NOT has_table_privilege('anon', 'public.role_seat_checkpoints', 'UPDATE'), 'ROLE-SEAT-CHECKPOINTS: anon can UPDATE';
  ASSERT NOT has_table_privilege('anon', 'public.role_seat_checkpoints', 'DELETE'), 'ROLE-SEAT-CHECKPOINTS: anon can DELETE';
  ASSERT NOT has_table_privilege('authenticated', 'public.role_seat_checkpoints', 'SELECT'), 'ROLE-SEAT-CHECKPOINTS: authenticated can SELECT';
  ASSERT NOT has_table_privilege('authenticated', 'public.role_seat_checkpoints', 'INSERT'), 'ROLE-SEAT-CHECKPOINTS: authenticated can INSERT';
  ASSERT NOT has_table_privilege('authenticated', 'public.role_seat_checkpoints', 'UPDATE'), 'ROLE-SEAT-CHECKPOINTS: authenticated can UPDATE';
  ASSERT NOT has_table_privilege('authenticated', 'public.role_seat_checkpoints', 'DELETE'), 'ROLE-SEAT-CHECKPOINTS: authenticated can DELETE';
  ASSERT has_table_privilege('service_role', 'public.role_seat_checkpoints', 'SELECT'), 'ROLE-SEAT-CHECKPOINTS: service_role cannot SELECT';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    WHERE c.oid = 'public.role_seat_checkpoints'::regclass
      AND a.grantee <> c.relowner
      AND COALESCE(pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC') <> 'service_role'
  ), 'ROLE-SEAT-CHECKPOINTS: a non-service table grant exists (including PUBLIC)';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_attribute at
    CROSS JOIN LATERAL aclexplode(at.attacl) a
    WHERE at.attrelid = 'public.role_seat_checkpoints'::regclass
      AND at.attacl IS NOT NULL
      AND a.grantee <> (SELECT relowner FROM pg_class WHERE oid = 'public.role_seat_checkpoints'::regclass)
      AND COALESCE(pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC') <> 'service_role'
  ), 'ROLE-SEAT-CHECKPOINTS: a non-service COLUMN grant exists';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'role_seat_checkpoints_seat_name_created_at_idx'),
    'ROLE-SEAT-CHECKPOINTS: index role_seat_checkpoints_seat_name_created_at_idx missing';
END
$verify$;
