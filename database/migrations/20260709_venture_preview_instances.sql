-- SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-B (FR-2)
-- Durable registry for preview/replay instances created by lib/venture-deploy/preview.js.
-- Every preview (plan-mode or live) is registered here with a TTL; the reaper
-- (scripts/venture-preview-reaper.mjs) sweeps expired planned/live rows.
-- Additive only: CREATE TABLE IF NOT EXISTS + index, no destructive DDL.

CREATE TABLE IF NOT EXISTS venture_preview_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL,
  sha text NOT NULL,
  fixture_id text,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'live', 'reaped', 'failed')),
  url text,
  expires_at timestamptz NOT NULL,
  created_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reaper sweep path: WHERE status IN ('planned','live') AND expires_at < now()
CREATE INDEX IF NOT EXISTS idx_venture_preview_instances_reap
  ON venture_preview_instances (status, expires_at);

COMMENT ON TABLE venture_preview_instances IS
  'SSOT registry of preview/replay instances (deploy-pipeline Child B). TTL enforced by scripts/venture-preview-reaper.mjs.';
