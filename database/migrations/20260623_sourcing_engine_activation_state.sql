-- Migration: sourcing_engine_activation_state — DB source-of-truth for sourcing-engine arm activation
-- SD: SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001 (FR-1/FR-3)
--
-- Why: the coordinator capacity-forecaster read the sourcing arm flags from its LOCAL process.env, but
-- SOURCING_GAUGE_GAP_MINER_V1 / SOURCING_DEFERRED_WATCHER_V1 live only as GitHub-Actions JOB-scoped env
-- in the cron ymls — absent from the coordinator process — so the forecaster read undefined → false and
-- printed a FALSE "engine DORMANT → ACTIVATE" readout while the crons were in fact running. This table is
-- the durable source of truth: each sourcing arm's on/off, written when an arm is activated/deactivated,
-- read by readSourcingEngineFlagsFromDb (workflow-yml presence != enabled; gh-run-state is rate-limited).
--
-- Keyed by `arm` (the awareness-registry label: gauge-gap-miner | deferred-watcher | auto-refill).

CREATE TABLE IF NOT EXISTS sourcing_engine_activation_state (
  arm TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

COMMENT ON TABLE sourcing_engine_activation_state IS
  'DB source-of-truth for sourcing-engine arm activation (SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001). One row per arm; readSourcingEngineFlagsFromDb derives the forecaster awareness from this, not coordinator process.env.';

-- FR-3: seed the currently-live arms ON so the forecaster reads true-ON immediately on ship.
-- Idempotent (ON CONFLICT DO NOTHING) — re-running the migration never clobbers an operator toggle.
INSERT INTO sourcing_engine_activation_state (arm, enabled, updated_by) VALUES
  ('gauge-gap-miner', true, 'migration:20260623_seed'),
  ('deferred-watcher', true, 'migration:20260623_seed'),
  ('auto-refill',     true, 'migration:20260623_seed')
ON CONFLICT (arm) DO NOTHING;

-- RLS: defense-in-depth; service_role retains full access (matches the operational pattern).
ALTER TABLE sourcing_engine_activation_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sourcing_engine_activation_state' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON sourcing_engine_activation_state
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
