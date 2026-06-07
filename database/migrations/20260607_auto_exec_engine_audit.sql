-- @approved-by: codestreetlabs@gmail.com
-- ============================================================================
-- Migration: Auto-execution engine APPEND-ONLY audit log + 001B SELECT-RLS
--            carry-forward for the restricted engine role.
--
-- SD: SD-LEO-INFRA-POLICY-GATED-AUTO-001C
--     (auto-exec engine control loop; child of the policy-gated
--      auto-execution engine)
-- sd_id: 262bd51d-5db0-4656-a362-e030bead9405
--
-- GOAL
--   The auto-execution control loop needs (1) a tamper-evident, append-only
--   audit trail of every decision/action it takes, and (2) the ability to
--   actually READ its own policy/forbidden tables under the restricted
--   leo_engine_ro role. 001B granted SELECT to leo_engine_ro and enabled RLS
--   on the policy/forbidden tables, but added NO permissive SELECT policy —
--   so RLS currently filters those reads to ZERO rows for the engine role.
--
--   This migration:
--     1. Creates public.leo_auto_exec_audit — APPEND-ONLY (a BEFORE UPDATE OR
--        DELETE trigger raises), RLS on, SELECT for service_role + leo_engine_ro,
--        INSERT for service_role. No UPDATE/DELETE granted to anyone.
--     2. Adds permissive SELECT RLS policies for leo_engine_ro on
--        leo_auto_exec_policy + leo_auto_exec_forbidden so the engine can READ
--        its policy. Writes stay denied at the storage (table-privilege) layer
--        — 001B's SELECT-only grant is untouched, so this does NOT regress the
--        write-deny.
--
-- PROPERTIES
--   * Additive only.
--   * Fully idempotent (IF NOT EXISTS / CREATE OR REPLACE / guarded DROP POLICY
--     + CREATE POLICY / ON CONFLICT-free).
--   * Reversible — see the DOWN / ROLLBACK SQL block at the bottom.
--   * Does NOT weaken any existing grant. leo_engine_ro keeps SELECT-ONLY on
--     the policy/forbidden tables; the new SELECT policy only un-filters the
--     rows it is already privileged to read.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. leo_auto_exec_audit  — APPEND-ONLY control-loop audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leo_auto_exec_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID,
  action_class TEXT,
  phase        TEXT,
  target       TEXT,
  decision     JSONB,
  snapshot     JSONB,
  outcome      TEXT,
  detail       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leo_auto_exec_audit IS
  'APPEND-ONLY audit trail for the policy-gated auto-execution control loop: one row per decision/action (run_id, action_class, phase, target, decision, snapshot, outcome, detail). UPDATE/DELETE are blocked by a BEFORE trigger AND by withheld table privileges. Engine/operators read via service_role + leo_engine_ro. SD-LEO-INFRA-POLICY-GATED-AUTO-001C.';

-- Helpful index for run-scoped + time-ordered reads (additive, idempotent).
CREATE INDEX IF NOT EXISTS idx_leo_auto_exec_audit_run_id
  ON public.leo_auto_exec_audit (run_id);
CREATE INDEX IF NOT EXISTS idx_leo_auto_exec_audit_created_at
  ON public.leo_auto_exec_audit (created_at);

ALTER TABLE public.leo_auto_exec_audit ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 1a. APPEND-ONLY hard guarantee: a BEFORE UPDATE OR DELETE trigger that
--     RAISES regardless of role (defense beyond the withheld grants).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leo_auto_exec_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'leo_auto_exec_audit is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

COMMENT ON FUNCTION public.leo_auto_exec_audit_append_only() IS
  'Append-only guard for leo_auto_exec_audit: raises on any UPDATE/DELETE. SD-LEO-INFRA-POLICY-GATED-AUTO-001C.';

-- CREATE OR REPLACE (PG14+) is idempotent against an already-applied trigger and
-- satisfies the pre-merge migration-readiness probe (R5: CREATE-without-OR-REPLACE
-- on an existing object is CONFLICTING). DROP IF EXISTS kept as belt-and-suspenders.
DROP TRIGGER IF EXISTS trg_leo_auto_exec_audit_append_only
  ON public.leo_auto_exec_audit;
CREATE OR REPLACE TRIGGER trg_leo_auto_exec_audit_append_only
  BEFORE UPDATE OR DELETE ON public.leo_auto_exec_audit
  FOR EACH ROW
  EXECUTE FUNCTION public.leo_auto_exec_audit_append_only();

-- ---------------------------------------------------------------------------
-- 1b. RLS policies for leo_auto_exec_audit.
--     SELECT: service_role + leo_engine_ro.  INSERT: service_role.
--     (No UPDATE/DELETE policy — and no UPDATE/DELETE grant — so those paths
--      are denied both at RLS AND at the privilege layer; the trigger is the
--      belt-and-suspenders hard stop.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS audit_select_service_role ON public.leo_auto_exec_audit;
CREATE POLICY audit_select_service_role
  ON public.leo_auto_exec_audit
  FOR SELECT
  TO service_role
  USING (true);

DROP POLICY IF EXISTS audit_select_engine_ro ON public.leo_auto_exec_audit;
CREATE POLICY audit_select_engine_ro
  ON public.leo_auto_exec_audit
  FOR SELECT
  TO leo_engine_ro
  USING (true);

DROP POLICY IF EXISTS audit_insert_service_role ON public.leo_auto_exec_audit;
CREATE POLICY audit_insert_service_role
  ON public.leo_auto_exec_audit
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 1c. Table grants for leo_auto_exec_audit.
--     SELECT + INSERT to service_role; SELECT to leo_engine_ro.
--     Explicitly REVOKE write privileges from leo_engine_ro and never grant
--     UPDATE/DELETE/TRUNCATE to anyone here.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON public.leo_auto_exec_audit TO service_role;
GRANT SELECT          ON public.leo_auto_exec_audit TO leo_engine_ro;

-- Be explicit: leo_engine_ro must never carry a write privilege on the audit.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.leo_auto_exec_audit FROM leo_engine_ro;
-- service_role must never be able to UPDATE/DELETE the append-only log either
-- (INSERT is its only write path). The trigger is the hard stop regardless.
REVOKE UPDATE, DELETE, TRUNCATE
  ON public.leo_auto_exec_audit FROM service_role;

-- ---------------------------------------------------------------------------
-- 2. 001B CARRY-FORWARD — permissive SELECT RLS for leo_engine_ro on the
--    policy + forbidden tables. RLS is already enabled and leo_engine_ro
--    already holds the SELECT *privilege* (001B), but with no SELECT policy
--    RLS filters every row out. These policies un-filter reads ONLY; they add
--    NO write capability (no INSERT/UPDATE/DELETE policy, no write grant).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS engine_ro_select_leo_auto_exec_policy
  ON public.leo_auto_exec_policy;
CREATE POLICY engine_ro_select_leo_auto_exec_policy
  ON public.leo_auto_exec_policy
  FOR SELECT
  TO leo_engine_ro
  USING (true);

DROP POLICY IF EXISTS engine_ro_select_leo_auto_exec_forbidden
  ON public.leo_auto_exec_forbidden;
CREATE POLICY engine_ro_select_leo_auto_exec_forbidden
  ON public.leo_auto_exec_forbidden
  FOR SELECT
  TO leo_engine_ro
  USING (true);

-- Re-assert (idempotent, no-op if already correct) that 001B's write-deny on
-- the policy/forbidden tables is intact — we must NOT regress it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.leo_auto_exec_policy    FROM leo_engine_ro;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.leo_auto_exec_forbidden FROM leo_engine_ro;

-- ============================================================================
-- DOWN / ROLLBACK  (apply manually to reverse this migration)
-- ----------------------------------------------------------------------------
-- BEGIN;
--   -- 2. Drop the 001B carry-forward SELECT policies (RLS stays enabled;
--   --    leo_engine_ro reverts to RLS-filtered-to-zero, matching 001B).
--   DROP POLICY IF EXISTS engine_ro_select_leo_auto_exec_forbidden
--     ON public.leo_auto_exec_forbidden;
--   DROP POLICY IF EXISTS engine_ro_select_leo_auto_exec_policy
--     ON public.leo_auto_exec_policy;
--
--   -- 1. Tear down the audit log (policies → grants → trigger → function → table).
--   DROP POLICY  IF EXISTS audit_insert_service_role  ON public.leo_auto_exec_audit;
--   DROP POLICY  IF EXISTS audit_select_engine_ro     ON public.leo_auto_exec_audit;
--   DROP POLICY  IF EXISTS audit_select_service_role  ON public.leo_auto_exec_audit;
--   REVOKE ALL ON public.leo_auto_exec_audit FROM leo_engine_ro;
--   REVOKE ALL ON public.leo_auto_exec_audit FROM service_role;
--   DROP TRIGGER IF EXISTS trg_leo_auto_exec_audit_append_only
--     ON public.leo_auto_exec_audit;
--   DROP FUNCTION IF EXISTS public.leo_auto_exec_audit_append_only();
--   DROP INDEX  IF EXISTS public.idx_leo_auto_exec_audit_created_at;
--   DROP INDEX  IF EXISTS public.idx_leo_auto_exec_audit_run_id;
--   DROP TABLE  IF EXISTS public.leo_auto_exec_audit;
-- COMMIT;
-- ============================================================================
