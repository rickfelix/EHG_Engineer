-- ============================================================================
-- Migration: 20260525_venture_build_routing_isolation_additive.sql
-- SD: SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (FR-5) — ADDITIVE / NON-BREAKING
-- Purpose: Stand up the canonical `applications` registry, seed/backfill it
--          from live data, and HEAL the missing vw_venture_registry view that
--          lib/venture-resolver.js::getVentureConfigAsync (line 182) queries.
-- Mode: IDEMPOTENT + ADDITIVE ONLY. No DROP/DELETE/ALTER TYPE. Safe to re-run.
--
-- NOTE: The fail-closed validating trigger on strategic_directives_v2 is
--       DELIBERATELY NOT in this file. It is deferred to
--       20260525_venture_build_routing_isolation_trigger_DEFERRED.sql
--       (NOT applied yet) until the leo-create-sd path auto-registers a
--       venture in `applications` before creating its SD. Enabling the trigger
--       prematurely would block SD creation fleet-wide for any unregistered
--       venture name.
--
-- KEY FINDING: target_application lives on strategic_directives_v2 (NOT on
--   ventures). Routing data (3260 rows) is on sd_v2.target_application.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- (1) Canonical applications registry table. Backs applications/registry.json
--     AND vw_venture_registry.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            varchar(120) NOT NULL,          -- canonical target_application value
  normalized_name varchar(120) NOT NULL,          -- NFKD/lower, matches venture-resolver normalizer
  kind            varchar(20)  NOT NULL DEFAULT 'venture'
                    CHECK (kind IN ('platform','venture')),
  github_repo     text,
  local_path      text,
  repo_url        text,
  deployment_url  text,
  deployment_target varchar(60),
  supabase_project_id text,
  current_lifecycle_stage integer,
  status          varchar(20)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive','retired')),
  venture_id      uuid REFERENCES public.ventures(id) ON DELETE SET NULL,
  metadata        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_name_lower
  ON public.applications (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_normalized_name
  ON public.applications (normalized_name);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications (status);

COMMENT ON TABLE public.applications IS
  'Canonical registry of valid target_application routing values (platform repos + ventures). SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 FR-5. Backs vw_venture_registry + applications/registry.json.';

-- updated_at trigger (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at_applications()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$fn$;
-- CREATE OR REPLACE TRIGGER (PG14+) is the idempotent form the pre-merge migration-readiness
-- probe accepts on an already-existing object (this migration is applied during EXEC, then the
-- file rides the PR — so the trigger already exists at merge-check time). Equivalent to the prior
-- DROP-IF-EXISTS + CREATE, re-runnable cleanly.
CREATE OR REPLACE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_applications();

-- ---------------------------------------------------------------------------
-- (2) Seed platform repos + DISTINCT existing target_application values so the
--     registry already covers every live value. ON CONFLICT DO NOTHING => re-runnable.
-- ---------------------------------------------------------------------------
INSERT INTO public.applications (name, normalized_name, kind, github_repo, local_path, status)
VALUES
  ('EHG',          'ehg',          'platform', 'rickfelix/ehg.git',          NULL, 'active'),
  ('EHG_Engineer', 'ehg_engineer', 'platform', 'rickfelix/EHG_Engineer.git', NULL, 'active')
ON CONFLICT (lower(name)) DO NOTHING;

-- Backfill every distinct non-platform value currently in use (CodeGuardian CI,
-- PrivacyPatrol AI, CronRead, CommitCraft AI, Cron Canary, CronLinter, Canvas AI, ...).
INSERT INTO public.applications (name, normalized_name, kind, status)
SELECT DISTINCT s.target_application,
       lower(regexp_replace(s.target_application, '\s+', '_', 'g')),
       'venture', 'active'
FROM public.strategic_directives_v2 s
WHERE s.target_application IS NOT NULL
  AND lower(s.target_application) NOT IN ('ehg','ehg_engineer')
ON CONFLICT (lower(name)) DO NOTHING;

-- ---------------------------------------------------------------------------
-- (3) Create the MISSING vw_venture_registry view that the SHIPPED
--     lib/venture-resolver.js::getVentureConfigAsync already queries (exact 10
--     named cols). Today that query throws -> this heals latent breakage.
--     ventures lacks normalized_name AND local_path, so the view sources from
--     applications, not ventures.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_venture_registry AS
  SELECT a.id, a.name, a.normalized_name, a.local_path, a.repo_url,
         a.deployment_url, a.deployment_target, a.status,
         a.current_lifecycle_stage, a.created_at
  FROM public.applications a
  WHERE a.status = 'active';

COMMIT;

-- ============================================================================
-- ROLLBACK (manual, if needed):
--   DROP VIEW IF EXISTS public.vw_venture_registry;
--   DROP TRIGGER IF EXISTS trg_applications_updated_at ON public.applications;
--   DROP FUNCTION IF EXISTS public.set_updated_at_applications();
--   DROP TABLE IF EXISTS public.applications;   -- only if no FK dependents created
-- ============================================================================
