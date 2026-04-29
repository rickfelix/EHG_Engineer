-- Migration: eva_venture_config — per-venture EVA feature flags + config overrides
-- SD: SD-LEO-INFRA-EVA-STAGE-WORKER-001
-- Purpose: TR-4 storage for FR-4 per-venture override of LEO_VISION_REPAIR_LOOP_ENABLED
-- Pattern: Modeled on db_agent_config (id/key/value-jsonb/description/timestamps)
-- Verified absent: PLAN-phase database-agent (sub_agent_execution_results.id=b6d66974-9aeb-4119-b85e-5d8a28537f49)

CREATE TABLE IF NOT EXISTS eva_venture_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(128) NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE eva_venture_config IS
  'Per-venture EVA feature flag and config overrides. Modeled on db_agent_config. '
  'Use key=''<scope>.<flag_name>'' (e.g. ''vision_repair_loop_enabled'') with value as JSONB boolean or object. '
  'For per-venture scoping, use composite keys like ''venture:<uuid>:vision_repair_loop_enabled''.';

COMMENT ON COLUMN eva_venture_config.key IS
  'Unique config key. Use dotted scope prefix for namespacing (e.g. ''vision_repair_loop_enabled'', ''venture:<uuid>:flag_name'').';

COMMENT ON COLUMN eva_venture_config.value IS
  'JSONB value. For boolean flags, store as JSON boolean (true/false). For complex configs, store as object.';

-- Seed default global flag for FR-4 (LEO_VISION_REPAIR_LOOP_ENABLED, default OFF)
INSERT INTO eva_venture_config (key, value, description)
VALUES (
  'vision_repair_loop_enabled',
  'false'::jsonb,
  'FR-4 global feature flag for SD-LEO-INFRA-EVA-STAGE-WORKER-001 vision repair loop. Default OFF. Per-venture override via key=''venture:<uuid>:vision_repair_loop_enabled''.'
)
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_eva_venture_config_key_lookup ON eva_venture_config(key);

-- Rollback SQL:
-- DROP TABLE IF EXISTS eva_venture_config;
