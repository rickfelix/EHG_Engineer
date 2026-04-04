-- Migration: Upgrade LLM model registry to verified frontier models
-- SD: SD-LEO-INFRA-LLM-MODEL-CONFIG-001
-- Date: 2026-04-04
-- Verified against live provider APIs on 2026-04-04

-- OpenAI: gpt-5.2 → gpt-5.4
UPDATE llm_model_registry
SET model_key = 'gpt-5.4',
    model_name = 'GPT-5.4',
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"upgraded_from": "gpt-5.2", "upgraded_at": "2026-04-04", "upgrade_sd": "SD-LEO-INFRA-LLM-MODEL-CONFIG-001"}'::jsonb
WHERE model_key = 'gpt-5.2' AND provider_key = 'openai';

-- OpenAI: gpt-5-mini → gpt-5.4-mini
UPDATE llm_model_registry
SET model_key = 'gpt-5.4-mini',
    model_name = 'GPT-5.4 Mini',
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"upgraded_from": "gpt-5-mini", "upgraded_at": "2026-04-04", "upgrade_sd": "SD-LEO-INFRA-LLM-MODEL-CONFIG-001"}'::jsonb
WHERE model_key = 'gpt-5-mini' AND provider_key = 'openai';

-- Anthropic: claude-sonnet-4-20250514 → claude-sonnet-4-6
UPDATE llm_model_registry
SET model_key = 'claude-sonnet-4-6',
    model_name = 'Claude Sonnet 4.6',
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"upgraded_from": "claude-sonnet-4-20250514", "upgraded_at": "2026-04-04", "upgrade_sd": "SD-LEO-INFRA-LLM-MODEL-CONFIG-001"}'::jsonb
WHERE model_key = 'claude-sonnet-4-20250514' AND provider_key = 'anthropic';

-- Anthropic: claude-opus-4-5-20251101 → claude-opus-4-6
UPDATE llm_model_registry
SET model_key = 'claude-opus-4-6',
    model_name = 'Claude Opus 4.6',
    context_window = 1000000,
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"upgraded_from": "claude-opus-4-5-20251101", "upgraded_at": "2026-04-04", "upgrade_sd": "SD-LEO-INFRA-LLM-MODEL-CONFIG-001"}'::jsonb
WHERE model_key = 'claude-opus-4-5-20251101' AND provider_key = 'anthropic';

-- Google: gemini-1.5-pro → gemini-2.5-pro (was outdated in registry)
UPDATE llm_model_registry
SET model_key = 'gemini-2.5-pro',
    model_name = 'Gemini 2.5 Pro',
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"upgraded_from": "gemini-1.5-pro", "upgraded_at": "2026-04-04", "upgrade_sd": "SD-LEO-INFRA-LLM-MODEL-CONFIG-001"}'::jsonb
WHERE model_key = 'gemini-1.5-pro' AND provider_key = 'google';
