-- Migration: Add Claude Opus 4.8 to model registry, deprecate Opus 4.7
-- Date: 2026-05-28
-- Context: Anthropic released Opus 4.8. Sonnet stays at 4.6 and Haiku at 4.5 —
-- only Opus advanced. Mirrors database/migrations/20260422_add_claude_opus_4_7.sql.
-- Code defaults for `generation` (S17 variant HTML), `complex-reasoning`, the
-- brainstorm anthropic rotation, and the eva-support default model were bumped to
-- claude-opus-4-8 in the same change set.
--
-- Idempotent: INSERT uses WHERE NOT EXISTS; the deprecate UPDATE is guarded on status.
--
-- ⚠️ PRICING: input_per_1m / output_per_1m below are carried over from Opus 4.7
-- ($15 / $75). VERIFY against Anthropic's pricing page before relying on cost
-- tracking, and correct here + in lib/ai/multimodal-client.js if they differ.

-- 1. Insert Opus 4.8 (leo_tier copied from the existing 4.7 row to preserve routing)
INSERT INTO llm_models (
  provider_id, model_key, model_name, model_family, model_version,
  model_tier, context_window, max_output_tokens,
  supports_function_calling, supports_vision, supports_streaming, supports_system_prompt,
  pricing, status, release_date, metadata, leo_tier
)
SELECT
  (SELECT id FROM llm_providers WHERE provider_key = 'anthropic'),
  'claude-opus-4-8', 'Claude Opus 4.8', 'claude', '4.8',
  'flagship', 1000000, 8192,
  true, true, true, true,
  '{"input_per_1m": 15.00, "output_per_1m": 75.00}'::jsonb,  -- VERIFY: carried over from 4.7
  'active', '2026-05-28',
  jsonb_build_object(
    'supersedes', 'claude-opus-4-7',
    'added_at', '2026-05-28',
    'added_by', 'opus 4.7->4.8 mechanical model bump'
  ),
  (SELECT leo_tier FROM llm_models WHERE model_key = 'claude-opus-4-7')
WHERE NOT EXISTS (
  SELECT 1 FROM llm_models WHERE model_key = 'claude-opus-4-8'
);

-- 2. Deprecate Opus 4.7 (row kept — usage logs reference it)
UPDATE llm_models
SET status = 'deprecated',
    deprecation_date = CURRENT_DATE,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'superseded_by', 'claude-opus-4-8',
      'deprecated_at', CURRENT_DATE::text
    )
WHERE model_key = 'claude-opus-4-7'
  AND status != 'deprecated';

-- 3. Verify
--   SELECT model_key, status, deprecation_date, context_window, leo_tier
--   FROM llm_models
--   WHERE model_key LIKE 'claude-opus-4-%'
--   ORDER BY model_key;
