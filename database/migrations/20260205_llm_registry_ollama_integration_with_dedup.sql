-- Migration: LLM Registry Ollama Integration (With Deduplication)
-- SD: SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001B
-- Purpose: Add Ollama provider and local model for Haiku replacement
-- Date: 2026-02-05
-- Fix: Deduplicates existing rows before adding unique constraint

-- Step 1: Deduplicate existing rows (keep the most recent one)
DELETE FROM llm_models a
USING llm_models b
WHERE a.id < b.id
  AND a.provider_id = b.provider_id
  AND a.model_key = b.model_key;

-- Step 2: Add unique constraint if it doesn't exist
-- This is required for ON CONFLICT clauses to work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'llm_models_provider_model_key'
  ) THEN
    ALTER TABLE llm_models
    ADD CONSTRAINT llm_models_provider_model_key UNIQUE (provider_id, model_key);
  END IF;
END $$;

-- Step 3: Add leo_tier column to llm_models for LEO Protocol tier mapping
-- This maps to our haiku/sonnet/opus tier system used by client-factory.js
ALTER TABLE llm_models
ADD COLUMN IF NOT EXISTS leo_tier VARCHAR(20) CHECK (leo_tier IN ('haiku', 'sonnet', 'opus'));

-- Step 4: Add is_local flag to distinguish local vs cloud models
ALTER TABLE llm_models
ADD COLUMN IF NOT EXISTS is_local BOOLEAN DEFAULT FALSE;

-- Step 5: Add Ollama provider
INSERT INTO llm_providers (
  provider_key,
  provider_name,
  provider_type,
  api_base_url,
  auth_method,
  capabilities,
  status,
  metadata
) VALUES (
  'ollama',
  'Ollama (Local)',
  'local',
  'http://localhost:11434/api',
  'none',
  '{
    "chat": true,
    "completion": true,
    "embeddings": true,
    "streaming": true,
    "vision": false,
    "audio": false,
    "function_calling": false
  }'::jsonb,
  'active',
  '{
    "local_only": true,
    "requires_ollama_running": true,
    "fallback_enabled": true
  }'::jsonb
) ON CONFLICT (provider_key) DO UPDATE SET
  status = 'active',
  api_base_url = 'http://localhost:11434/api',
  capabilities = EXCLUDED.capabilities,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- Step 6: Add qwen3-coder:30b as local Haiku replacement
INSERT INTO llm_models (
  provider_id,
  model_key,
  model_name,
  model_family,
  model_version,
  model_tier,
  leo_tier,
  is_local,
  context_window,
  max_output_tokens,
  supports_function_calling,
  supports_vision,
  supports_streaming,
  supports_system_prompt,
  pricing,
  capabilities,
  status,
  metadata
)
SELECT
  p.id,
  'qwen3-coder:30b',
  'Qwen3 Coder 30B',
  'qwen3',
  '30b',
  'standard',
  'haiku',  -- LEO Protocol tier - replaces Haiku
  TRUE,     -- is_local
  32768,
  4096,
  FALSE,
  FALSE,
  TRUE,
  TRUE,
  '{"currency": "USD", "input_price_per_1k_tokens": 0, "output_price_per_1k_tokens": 0}'::jsonb,
  '{"use_cases": ["classification", "fast_tasks", "json_generation"], "benchmark_accuracy": 100, "tokens_per_second": 33}'::jsonb,
  'active',
  '{"ollama_model": "qwen3-coder:30b", "benchmark_date": "2026-02-05", "replaces_cloud_tier": "haiku"}'::jsonb
FROM llm_providers p
WHERE p.provider_key = 'ollama'
ON CONFLICT (provider_id, model_key) DO UPDATE SET
  leo_tier = 'haiku',
  is_local = TRUE,
  capabilities = EXCLUDED.capabilities,
  metadata = EXCLUDED.metadata,
  status = 'active',
  updated_at = NOW();

-- Step 7: Add/update current Anthropic Claude models with LEO tiers
-- Claude Haiku 3.5
INSERT INTO llm_models (
  provider_id,
  model_key,
  model_name,
  model_family,
  model_tier,
  leo_tier,
  is_local,
  context_window,
  max_output_tokens,
  supports_function_calling,
  supports_vision,
  supports_streaming,
  supports_system_prompt,
  status
)
SELECT
  p.id,
  'claude-haiku-3-5-20241022',
  'Claude 3.5 Haiku',
  'claude-3.5',
  'standard',
  'haiku',
  FALSE,
  200000,
  4096,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  'active'
FROM llm_providers p
WHERE p.provider_key = 'anthropic'
ON CONFLICT (provider_id, model_key) DO UPDATE SET
  leo_tier = 'haiku',
  is_local = FALSE,
  updated_at = NOW();

-- Claude Sonnet 4
INSERT INTO llm_models (
  provider_id,
  model_key,
  model_name,
  model_family,
  model_tier,
  leo_tier,
  is_local,
  context_window,
  max_output_tokens,
  supports_function_calling,
  supports_vision,
  supports_streaming,
  supports_system_prompt,
  status
)
SELECT
  p.id,
  'claude-sonnet-4-20250514',
  'Claude 4 Sonnet',
  'claude-4',
  'standard',
  'sonnet',
  FALSE,
  200000,
  8192,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  'active'
FROM llm_providers p
WHERE p.provider_key = 'anthropic'
ON CONFLICT (provider_id, model_key) DO UPDATE SET
  leo_tier = 'sonnet',
  is_local = FALSE,
  updated_at = NOW();

-- Claude Opus 4.5
INSERT INTO llm_models (
  provider_id,
  model_key,
  model_name,
  model_family,
  model_tier,
  leo_tier,
  is_local,
  context_window,
  max_output_tokens,
  supports_function_calling,
  supports_vision,
  supports_streaming,
  supports_system_prompt,
  status
)
SELECT
  p.id,
  'claude-opus-4-5-20251101',
  'Claude 4.5 Opus',
  'claude-4.5',
  'flagship',
  'opus',
  FALSE,
  200000,
  16384,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  'active'
FROM llm_providers p
WHERE p.provider_key = 'anthropic'
ON CONFLICT (provider_id, model_key) DO UPDATE SET
  leo_tier = 'opus',
  is_local = FALSE,
  updated_at = NOW();

-- Step 8: Add provider_source column to model_usage_log for tracking local vs cloud
ALTER TABLE model_usage_log
ADD COLUMN IF NOT EXISTS provider_source VARCHAR(20) CHECK (provider_source IN ('local', 'cloud', 'fallback'));

-- Step 9: Create index for efficient tier lookups
CREATE INDEX IF NOT EXISTS idx_llm_models_leo_tier ON llm_models(leo_tier) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_llm_models_local ON llm_models(is_local) WHERE status = 'active' AND is_local = TRUE;

-- Step 10: Create view for model registry lookup (used by client-factory.js)
CREATE OR REPLACE VIEW v_llm_model_registry AS
SELECT
  m.id,
  m.model_key,
  m.model_name,
  m.leo_tier,
  m.is_local,
  p.provider_key,
  p.provider_type,
  p.api_base_url,
  m.context_window,
  m.max_output_tokens,
  m.capabilities,
  m.metadata
FROM llm_models m
JOIN llm_providers p ON m.provider_id = p.id
WHERE m.status = 'active' AND p.status = 'active'
ORDER BY m.is_local DESC, m.leo_tier;

-- Verification query (run after migration)
-- SELECT leo_tier, model_key, is_local, provider_key FROM v_llm_model_registry WHERE leo_tier IS NOT NULL;
