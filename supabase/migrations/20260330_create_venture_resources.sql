-- Venture Resources Registry
-- SD-LEO-INFRA-UNIFIED-VENTURE-CREATION-001-B
--
-- Unified registry of all external resources created during venture provisioning.
-- Replaces fragmented tracking across venture_provisioning_state,
-- venture_asset_registry, and protected_resources.

CREATE TABLE IF NOT EXISTS venture_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN (
    'github_repo', 'vercel_deployment', 'local_directory',
    'supabase_project', 'domain', 'npm_package'
  )),
  resource_identifier TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cleaned', 'failed', 'orphaned')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (venture_id, resource_type, resource_identifier)
);

-- Index for fast lookup by venture
CREATE INDEX IF NOT EXISTS idx_venture_resources_venture_id ON venture_resources(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_resources_status ON venture_resources(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_venture_resources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_venture_resources_updated_at ON venture_resources;
CREATE TRIGGER trg_venture_resources_updated_at
  BEFORE UPDATE ON venture_resources
  FOR EACH ROW
  EXECUTE FUNCTION update_venture_resources_updated_at();

-- RLS
ALTER TABLE venture_resources ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically.
-- Allow authenticated users to read resources for ventures they have access to.
CREATE POLICY venture_resources_select_own ON venture_resources
  FOR SELECT TO authenticated
  USING (
    (current_setting('role'::text, true) = 'service_role'::text)
    OR portfolio.has_venture_access(venture_id)
  );

-- Service role insert/update (backend operations)
CREATE POLICY venture_resources_service_all ON venture_resources
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE venture_resources IS 'Unified registry of external resources per venture (SD-LEO-INFRA-UNIFIED-VENTURE-CREATION-001-B)';
