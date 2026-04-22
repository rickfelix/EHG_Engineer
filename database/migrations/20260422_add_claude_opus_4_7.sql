-- Migration: Add Claude Opus 4.7 to model registry, deprecate Opus 4.6
-- Date: 2026-04-22
-- Context: Anthropic released Opus 4.7. Sonnet remains at 4.6 and Haiku at 4.5 —
-- only Opus advanced. Codebase default for 'generation' and 'complex-reasoning'
-- updated to claude-opus-4-7 in the same commit. See:
--   lib/config/model-config.js
--   lib/ai/multimodal-client.js
--   lib/brainstorm/provider-rotation.js
--   docs/reference/model-version-upgrade-runbook.md (Section 3)

-- 1. Insert new Opus 4.7 row
INSERT INTO llm_model_registry (
  provider_key,
  model_key,
  model_name,
  context_window,
  metadata
)
VALUES (
  'anthropic',
  'claude-opus-4-7',
  'Claude Opus 4.7',
  1000000,
  jsonb_build_object(
    'added_at', '2026-04-22',
    'added_sd', 'ad-hoc model upgrade (2026-04-22)',
    'supersedes', 'claude-opus-4-6',
    'pricing_per_1m', jsonb_build_object('input', 15.00, 'output', 75.00),
    'supports_1m_context', true,
    'supports_vision', true,
    'supports_function_calling', true
  )
)
ON CONFLICT (provider_key, model_key) DO UPDATE
SET model_name    = EXCLUDED.model_name,
    context_window = EXCLUDED.context_window,
    metadata      = llm_model_registry.metadata || EXCLUDED.metadata;

-- 2. Deprecate Opus 4.6 (keep the row — referenced by usage logs)
UPDATE llm_model_registry
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'status', 'deprecated',
  'deprecated_at', '2026-04-22',
  'superseded_by', 'claude-opus-4-7'
)
WHERE provider_key = 'anthropic'
  AND model_key    = 'claude-opus-4-6';

-- 3. Verify
--   SELECT model_key, model_name, metadata->>'status' AS status
--   FROM llm_model_registry
--   WHERE provider_key = 'anthropic' AND model_key LIKE 'claude-opus-4-%'
--   ORDER BY model_key;
