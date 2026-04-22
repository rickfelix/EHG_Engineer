-- Migration: Add Claude Opus 4.7 to model registry, deprecate Opus 4.6
-- Date: 2026-04-22
-- Applied: 2026-04-22 (manually, via corrected SQL; see HISTORY below)
--
-- HISTORY: The first version of this file (shipped in PR #3217, commit
-- cc0a1e92c3) targeted table `llm_model_registry`, which does not exist
-- in this database. The actual table is `llm_models`. This file has been
-- rewritten to target the real table and uses INSERT WHERE NOT EXISTS so
-- it is safe to re-run. DB state was applied manually on 2026-04-22.
--
-- Context: Anthropic released Opus 4.7. Sonnet stayed at 4.6 and Haiku
-- at 4.5 — only Opus advanced. Code defaults for `generation` and
-- `complex-reasoning` were updated to claude-opus-4-7 in PR #3217.

-- 1. Insert Opus 4.7 (leo_tier copied from the existing 4.6 row to preserve routing)
INSERT INTO llm_models (
  provider_id, model_key, model_name, model_family, model_version,
  model_tier, context_window, max_output_tokens,
  supports_function_calling, supports_vision, supports_streaming, supports_system_prompt,
  pricing, status, release_date, metadata, leo_tier
)
SELECT
  (SELECT id FROM llm_providers WHERE provider_key = 'anthropic'),
  'claude-opus-4-7', 'Claude Opus 4.7', 'claude', '4.7',
  'flagship', 1000000, 8192,
  true, true, true, true,
  '{"input_per_1m": 15.00, "output_per_1m": 75.00}'::jsonb,
  'active', '2026-04-22',
  jsonb_build_object(
    'supersedes', 'claude-opus-4-6',
    'added_at', '2026-04-22',
    'added_by', 'ad-hoc model upgrade'
  ),
  (SELECT leo_tier FROM llm_models WHERE model_key = 'claude-opus-4-6')
WHERE NOT EXISTS (
  SELECT 1 FROM llm_models WHERE model_key = 'claude-opus-4-7'
);

-- 2. Deprecate Opus 4.6 (row kept — usage logs reference it)
UPDATE llm_models
SET status = 'deprecated',
    deprecation_date = CURRENT_DATE,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'superseded_by', 'claude-opus-4-7',
      'deprecated_at', CURRENT_DATE::text
    )
WHERE model_key = 'claude-opus-4-6'
  AND status != 'deprecated';

-- 3. Verify
--   SELECT model_key, status, deprecation_date, context_window
--   FROM llm_models
--   WHERE model_key LIKE 'claude-opus-4-%'
--   ORDER BY model_key;
