-- SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-D (FR-2)
-- Deploy-event record stamped by lib/venture-deploy/promote.js: every production
-- deploy attempt lands here in a terminal status. The exit-gate verifiers
-- (verifyComputeDeployed / verifyPagesUrlLive) and the launch_mode flip-guard
-- precondition read the latest 'routed' row per venture (design SSOT
-- docs/design/deploy-pipeline-architecture.md §3 step 4).
-- Additive only: CREATE TABLE IF NOT EXISTS + index + RLS, no destructive DDL (TIER-1).

CREATE TABLE IF NOT EXISTS venture_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL,
  sha text NOT NULL,
  revision text,
  url text,
  actor text NOT NULL,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'deployed_no_traffic', 'routed', 'failed', 'rolled_back')),
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Verifier/flip-guard read path: latest routed row per venture.
CREATE INDEX IF NOT EXISTS idx_venture_deployments_venture_created
  ON venture_deployments (venture_id, created_at DESC);

ALTER TABLE venture_deployments ENABLE ROW LEVEL SECURITY;

-- Service-role-only writes (mirrors venture_preview_instances posture): no anon/authenticated
-- policy is created, so RLS denies all non-service access by default.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'venture_deployments' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON venture_deployments
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE venture_deployments IS
  'Deploy-event record (deploy-pipeline Child D). Written by lib/venture-deploy/promote.js; read by exit-gate verifiers and the launch_mode deploy precondition.';
