-- Migration: Create protected_resources table
-- SD: SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-A
--
-- Provides a database-driven protection list for the master_reset_portfolio RPC.
-- Resources listed here are excluded from deletion during a portfolio reset.
--
-- Replaces the hard-coded PROTECTED_REPOS set in server/routes/ventures.js
-- with a queryable, auditable table.

CREATE TABLE IF NOT EXISTS public.protected_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL,          -- 'venture', 'repo', 'application'
  resource_id TEXT NOT NULL,            -- UUID string for ventures, slug for repos
  venture_id UUID,                      -- optional link to ventures table
  protection_reason TEXT NOT NULL,      -- why this resource is protected
  protected_by TEXT NOT NULL DEFAULT 'system',  -- who added the protection
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_protected_resource UNIQUE (resource_type, resource_id)
);

COMMENT ON TABLE public.protected_resources IS 'Resources that must never be deleted during master reset or cleanup operations.';
COMMENT ON COLUMN public.protected_resources.resource_type IS 'Type of protected resource: venture, repo, application';
COMMENT ON COLUMN public.protected_resources.resource_id IS 'Identifier of the resource. UUID for ventures, slug for repos (e.g. rickfelix/ehg)';

-- RLS: Only service_role and chairman can read/modify protected resources
ALTER TABLE public.protected_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY protected_resources_service_role ON public.protected_resources
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY protected_resources_authenticated_read ON public.protected_resources
  FOR SELECT TO authenticated
  USING (true);

-- Seed with core protected repos (matches existing PROTECTED_REPOS in ventures.js)
INSERT INTO public.protected_resources (resource_type, resource_id, protection_reason, protected_by)
VALUES
  ('repo', 'rickfelix/ehg', 'Core frontend application — must never be deleted', 'system'),
  ('repo', 'rickfelix/EHG_Engineer', 'Core backend application — must never be deleted', 'system'),
  ('repo', 'rickfelix/ehg_engineer', 'Core backend application (lowercase) — must never be deleted', 'system')
ON CONFLICT (resource_type, resource_id) DO NOTHING;

-- Grant permissions
GRANT SELECT ON public.protected_resources TO authenticated;
GRANT ALL ON public.protected_resources TO service_role;
