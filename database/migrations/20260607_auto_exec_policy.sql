-- @approved-by: codestreetlabs@gmail.com
-- ============================================================================
-- Migration: Policy-gated auto-execution policy schema + STORAGE-LAYER
--            meta-stability guard.
--
-- SD: SD-LEO-INFRA-POLICY-GATED-AUTO-001B
--     (child of the policy-gated auto-execution engine)
-- sd_id: c6fc6355-3db7-431a-95b2-156711dbcc9c
--
-- GOAL
--   App-layer-only meta-stability is a CRITICAL gap: the auto-execution
--   engine must be UNABLE to write its own policy/guardrails even if the
--   application code is compromised. This migration adds the defense at the
--   STORAGE (table-privilege) layer:
--
--     1. leo_auto_exec_policy      — per-action-class execution policy.
--     2. leo_auto_exec_forbidden   — hard deny-list of action classes that
--                                    must never auto-execute.
--     3. leo_engine_ro             — a restricted NOLOGIN database role with
--                                    SELECT-ONLY access to the policy /
--                                    forbidden / feature-flag / kill-switch
--                                    tables. NOT superuser, NOT BYPASSRLS.
--
--   With only SELECT granted, any write the engine attempts under
--   leo_engine_ro fails with "permission denied for table ..." — at the
--   storage layer, BEFORE any RLS policy or application check. This is
--   defense-in-depth BEYOND RLS.
--
-- PROPERTIES
--   * Additive only.
--   * Fully idempotent (IF NOT EXISTS / guarded DO blocks / ON CONFLICT).
--   * Reversible — see the DOWN / ROLLBACK SQL block at the bottom.
--   * Does NOT weaken any existing grant on leo_feature_flags /
--     leo_kill_switches for other roles (leo_engine_ro is a brand-new,
--     distinct role; SELECT-only grants are purely additive).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. leo_auto_exec_policy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leo_auto_exec_policy (
  action_class   TEXT PRIMARY KEY,
  preconditions  JSONB,
  canary         JSONB,
  rollback       JSONB,
  blast_radius   JSONB,
  observe_window JSONB,
  escalation     JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leo_auto_exec_policy IS
  'Per-action-class auto-execution policy (preconditions, canary, rollback, blast radius, observe window, escalation). Engine reads via leo_engine_ro (SELECT-only); writes are operator/service-role only. SD-LEO-INFRA-POLICY-GATED-AUTO-001B.';

ALTER TABLE public.leo_auto_exec_policy ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. leo_auto_exec_forbidden
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leo_auto_exec_forbidden (
  action_class    TEXT PRIMARY KEY,
  reason          TEXT,
  outward_facing  BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leo_auto_exec_forbidden IS
  'Hard deny-list of action classes that must never auto-execute (irreversible / outward-facing). Engine reads via leo_engine_ro (SELECT-only). SD-LEO-INFRA-POLICY-GATED-AUTO-001B.';

ALTER TABLE public.leo_auto_exec_forbidden ENABLE ROW LEVEL SECURITY;

-- Seed the forbidden deny-list (idempotent).
INSERT INTO public.leo_auto_exec_forbidden (action_class, reason, outward_facing) VALUES
  ('hard_delete',               'irreversible destructive delete',  false),
  ('prod_purge_no_soft_delete', 'irreversible prod data purge',     false),
  ('external_email',            'outward-facing communication',     true),
  ('repo_delete',               'irreversible repo deletion',       false),
  ('force_push',                'history-destructive',              false)
ON CONFLICT (action_class) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Restricted engine role: leo_engine_ro  (STORAGE-LAYER meta-stability)
-- ---------------------------------------------------------------------------
-- Idempotent role creation. NOLOGIN (cannot be used to authenticate
-- directly — assumed via SET ROLE / role membership by the engine path).
-- Explicitly NOT a superuser and NOT BYPASSRLS.
--
-- NOTE: a standalone `ALTER ROLE ... NOSUPERUSER/NOBYPASSRLS` requires
-- SUPERUSER to execute (even when setting the flags OFF), and the Supabase
-- `postgres` role is CREATEROLE-but-NOT-superuser. We therefore set the safe
-- attributes at CREATE time only — a non-superuser CREATEROLE member is
-- allowed to create a role with the DEFAULT (NOSUPERUSER, NOBYPASSRLS,
-- NOLOGIN) attributes. We do NOT emit a separate ALTER ROLE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'leo_engine_ro') THEN
    CREATE ROLE leo_engine_ro NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

-- Defense-in-depth assertion: fail the migration (rolling everything back) if
-- the role somehow carries SUPERUSER / BYPASSRLS / LOGIN (e.g. drift from a
-- prior definition). This only READS pg_roles, so it needs no superuser.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'leo_engine_ro' AND (rolsuper OR rolbypassrls OR rolcanlogin)
  ) THEN
    RAISE EXCEPTION 'leo_engine_ro must be NOSUPERUSER, NOBYPASSRLS, NOLOGIN (privilege-escalation guard)';
  END IF;
END
$$;

-- Allow the table owner (postgres) to assume the role via SET ROLE so the
-- engine's read path — and the rejection tests — can exercise it. This is a
-- membership grant only; it does NOT give leo_engine_ro any extra privilege.
GRANT leo_engine_ro TO postgres;

-- Schema usage (required to reference any object in public).
GRANT USAGE ON SCHEMA public TO leo_engine_ro;

-- SELECT-ONLY on the four governance tables. No INSERT/UPDATE/DELETE granted,
-- so writes fail at the table-privilege layer.
GRANT SELECT ON public.leo_auto_exec_policy    TO leo_engine_ro;
GRANT SELECT ON public.leo_auto_exec_forbidden TO leo_engine_ro;
GRANT SELECT ON public.leo_feature_flags       TO leo_engine_ro;
GRANT SELECT ON public.leo_kill_switches       TO leo_engine_ro;

-- Be explicit: revoke any write privilege (no-op if never granted; guarantees
-- the deny holds even against a future default-privilege or prior grant).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.leo_auto_exec_policy    FROM leo_engine_ro;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.leo_auto_exec_forbidden FROM leo_engine_ro;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.leo_feature_flags       FROM leo_engine_ro;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.leo_kill_switches       FROM leo_engine_ro;

-- ============================================================================
-- DOWN / ROLLBACK  (apply manually to reverse this migration)
-- ----------------------------------------------------------------------------
-- BEGIN;
--   -- Drop the restricted role's privileges first, then the role.
--   REVOKE ALL ON public.leo_auto_exec_policy    FROM leo_engine_ro;
--   REVOKE ALL ON public.leo_auto_exec_forbidden FROM leo_engine_ro;
--   REVOKE ALL ON public.leo_feature_flags       FROM leo_engine_ro;
--   REVOKE ALL ON public.leo_kill_switches       FROM leo_engine_ro;
--   REVOKE USAGE ON SCHEMA public FROM leo_engine_ro;
--   REVOKE leo_engine_ro FROM postgres;
--   DROP ROLE IF EXISTS leo_engine_ro;
--
--   -- Drop the two new tables (additive objects only — pre-existing
--   -- leo_feature_flags / leo_kill_switches are untouched).
--   DROP TABLE IF EXISTS public.leo_auto_exec_forbidden;
--   DROP TABLE IF EXISTS public.leo_auto_exec_policy;
-- COMMIT;
-- ============================================================================
