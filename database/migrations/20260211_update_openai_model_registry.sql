-- Migration: Update OpenAI Model Registry
-- SD: SD-LEO-REFAC-ELIMINATE-HARDCODED-LLM-001
-- Date: 2026-02-11
--
-- Purpose: Add current OpenAI models (gpt-5.2, gpt-5-mini) with leo_tier mappings
-- and deprecate legacy models (gpt-4o, gpt-4-turbo, gpt-3.5-turbo)

-- OpenAI provider ID: 08a76dd2-a674-42a3-be5c-70b2f6790074

-- Step 1: Add gpt-5.2 (sonnet-tier equivalent for OpenAI)
INSERT INTO llm_models (
  id, provider_id, model_key, model_name, model_family, model_version,
  model_tier, context_window, max_output_tokens,
  supports_function_calling, supports_vision, supports_streaming,
  supports_audio, supports_system_prompt,
  pricing, capabilities, status, leo_tier, is_local
) VALUES (
  gen_random_uuid(),
  '08a76dd2-a674-42a3-be5c-70b2f6790074',
  'gpt-5.2',
  'GPT-5.2',
  'gpt-5',
  '2025-12-01',
  'flagship',
  128000,
  16384,
  true, true, true, false, true,
  '{"currency": "USD", "input_price_per_1k_tokens": 0.003, "output_price_per_1k_tokens": 0.012}'::jsonb,
  '{"languages": ["en", "es", "fr", "de", "zh"], "use_cases": ["chat", "code", "analysis", "vision"], "special_features": ["multimodal"]}'::jsonb,
  'active',
  'sonnet',
  false
) ON CONFLICT (model_key) DO UPDATE SET
  leo_tier = 'sonnet',
  status = 'active',
  updated_at = now();

-- Step 2: Add gpt-5-mini (haiku-tier equivalent for OpenAI)
INSERT INTO llm_models (
  id, provider_id, model_key, model_name, model_family, model_version,
  model_tier, context_window, max_output_tokens,
  supports_function_calling, supports_vision, supports_streaming,
  supports_audio, supports_system_prompt,
  pricing, capabilities, status, leo_tier, is_local
) VALUES (
  gen_random_uuid(),
  '08a76dd2-a674-42a3-be5c-70b2f6790074',
  'gpt-5-mini',
  'GPT-5 Mini',
  'gpt-5',
  '2025-10-01',
  'standard',
  128000,
  16384,
  true, false, true, false, true,
  '{"currency": "USD", "input_price_per_1k_tokens": 0.0003, "output_price_per_1k_tokens": 0.0012}'::jsonb,
  '{"languages": ["en", "es", "fr", "de"], "use_cases": ["chat", "code", "classification"], "special_features": ["fast", "no_temperature_support"]}'::jsonb,
  'active',
  'haiku',
  false
) ON CONFLICT (model_key) DO UPDATE SET
  leo_tier = 'haiku',
  status = 'active',
  updated_at = now();

-- Step 3: Deprecate legacy OpenAI models (mark as deprecated, remove leo_tier)
UPDATE llm_models
SET status = 'deprecated',
    deprecation_date = '2025-06-01',
    updated_at = now()
WHERE model_key IN ('gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo')
  AND status = 'active';

-- Step 4: Verify the registry view returns updated models
-- (Run manually to confirm)
-- SELECT model_key, leo_tier, status FROM v_llm_model_registry WHERE provider_name = 'OpenAI';
