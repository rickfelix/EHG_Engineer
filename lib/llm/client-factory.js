/**
 * LLM Client Factory
 * Central authority for all LLM client creation in EHG_Engineer
 *
 * This factory:
 * 1. Reads model registry from database (v_llm_model_registry view)
 * 2. Falls back to hardcoded config if database unavailable
 * 3. Routes haiku-tier to Ollama when USE_LOCAL_LLM=true
 * 4. Caches registry with TTL to minimize database calls
 * 5. Provides unified interface for all LLM operations
 *
 * @module lib/llm/client-factory
 * @created 2026-02-05
 * @updated 2026-02-05 - SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001B: Database-driven registry
 * @see config/phase-model-routing.json for routing configuration
 * @see scripts/benchmarks/README.md for model benchmarks
 * @see database/migrations/20260205_llm_registry_ollama_integration.sql
 */

import { getEffortForAgentAndPhase } from '../sub-agent-executor/model-routing.js';
import {
  OllamaAdapter,
  AnthropicAdapter,
  OpenAIAdapter,
  GoogleAdapter,
  getLocalFirstAdapter
} from '../sub-agents/vetting/provider-adapters.js';
import { getOpenAIModel } from '../config/model-config.js';

/**
 * Check if local LLM is enabled (evaluated at call time, not module load)
 * This ensures dotenv has a chance to load first
 */
function isLocalLLMEnabledInternal() {
  return process.env.USE_LOCAL_LLM === 'true';
}

// =============================================================================
// DATABASE-DRIVEN MODEL REGISTRY (SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001B)
// =============================================================================

/**
 * Model registry cache to avoid repeated database queries
 * TTL: 5 minutes (refresh on next call after expiry)
 */
let modelRegistryCache = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fallback constants used when database is unavailable
 * These match the values in the database for consistency
 */
const FALLBACK_TIER_TO_MODEL = {
  haiku: 'claude-haiku-3-5-20241022',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-5-20251101'
};

const FALLBACK_LOCAL_MODEL = 'qwen3-coder:30b';

/**
 * Thinking effort → budget_tokens mapping
 * Used when routing sub-agents to Anthropic with extended thinking
 *
 * SD-LEO-FIX-REPLACE-MODEL-SELECTION-001: Single model (Opus) with varying thinking depth
 */
const EFFORT_TO_BUDGET = {
  low: 1024,
  medium: 4096,
  high: 16384
};

/**
 * The single Opus model used for all thinking-effort-routed requests
 */
const THINKING_MODEL = 'claude-opus-4-5-20251101';

/**
 * Get Supabase client (lazy loaded to avoid import issues)
 * @returns {Object|null} Supabase client or null if unavailable
 */
async function getSupabaseClient() {
  try {
    // Dynamic import to handle environments where Supabase isn't configured
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return null;
    }

    return createClient(url, key);
  } catch {
    return null;
  }
}

/**
 * Load model registry from database
 * @returns {Object} Registry with models array and helper maps
 */
async function loadModelRegistry() {
  // Return cache if still valid
  if (modelRegistryCache && Date.now() < cacheExpiry) {
    return modelRegistryCache;
  }

  const supabase = await getSupabaseClient();

  if (!supabase) {
    console.log('   ⚠️  LLM Factory: Database unavailable, using fallback config');
    return buildFallbackRegistry();
  }

  try {
    // View already filters for active models (see migration for view definition)
    const { data, error } = await supabase
      .from('v_llm_model_registry')
      .select('*');

    if (error) {
      console.warn('   ⚠️  LLM Factory: Registry query failed, using fallback:', error.message);
      return buildFallbackRegistry();
    }

    if (!data || data.length === 0) {
      console.warn('   ⚠️  LLM Factory: No models in registry, using fallback');
      return buildFallbackRegistry();
    }

    // Build registry from database data
    const registry = {
      models: data,
      tierToModel: {},
      localModels: {},
      source: 'database',
      loadedAt: new Date().toISOString()
    };

    // Build tier mappings
    for (const model of data) {
      if (model.leo_tier) {
        // Prefer local models for the tier if available
        if (model.is_local) {
          registry.localModels[model.leo_tier] = model.model_key;
        } else if (!registry.tierToModel[model.leo_tier]) {
          // Cloud fallback (only if no cloud model set yet for this tier)
          registry.tierToModel[model.leo_tier] = model.model_key;
        }
      }
    }

    // Cache the registry
    modelRegistryCache = registry;
    cacheExpiry = Date.now() + CACHE_TTL_MS;

    return registry;
  } catch (err) {
    console.warn('   ⚠️  LLM Factory: Registry load error, using fallback:', err.message);
    return buildFallbackRegistry();
  }
}

/**
 * Build fallback registry from hardcoded constants
 * @returns {Object} Registry object
 */
function buildFallbackRegistry() {
  return {
    models: [],
    tierToModel: { ...FALLBACK_TIER_TO_MODEL },
    localModels: { haiku: FALLBACK_LOCAL_MODEL },
    source: 'fallback',
    loadedAt: new Date().toISOString()
  };
}

/**
 * Get the cloud model for a tier (sync version using cache)
 * @param {string} tier - haiku, sonnet, or opus
 * @returns {string} Model identifier
 */
function getTierModel(tier) {
  if (modelRegistryCache && Date.now() < cacheExpiry) {
    return modelRegistryCache.tierToModel[tier] || FALLBACK_TIER_TO_MODEL[tier] || FALLBACK_TIER_TO_MODEL.sonnet;
  }
  return FALLBACK_TIER_TO_MODEL[tier] || FALLBACK_TIER_TO_MODEL.sonnet;
}

/**
 * Get the local model for a tier (sync version using cache)
 * @param {string} tier - haiku, sonnet, or opus
 * @returns {string|null} Local model identifier or null
 */
function getLocalModel(tier) {
  if (modelRegistryCache && Date.now() < cacheExpiry) {
    return modelRegistryCache.localModels[tier] || null;
  }
  // Only haiku has local fallback
  return tier === 'haiku' ? FALLBACK_LOCAL_MODEL : null;
}

/**
 * Force refresh of the model registry cache
 * Call this after model configuration changes
 */
export async function refreshModelRegistry() {
  modelRegistryCache = null;
  cacheExpiry = 0;
  const registry = await loadModelRegistry();
  console.log(`   🔄 LLM Factory: Registry refreshed from ${registry.source}`);
  return registry;
}

/**
 * Initialize the LLM client factory (loads registry from database)
 * Call this once at application startup for optimal performance.
 * If not called, the registry will be loaded lazily on first getLLMClient call.
 *
 * @returns {Promise<Object>} The loaded registry
 */
export async function initializeLLMFactory() {
  const registry = await loadModelRegistry();
  console.log(`   ✅ LLM Factory initialized from ${registry.source}`);
  return registry;
}

/**
 * Get an LLM client configured for the specified purpose
 *
 * This is the primary entry point for all LLM operations.
 * It respects the routing config and local LLM settings.
 *
 * NOTE: This function is SYNCHRONOUS for backward compatibility.
 * Call initializeLLMFactory() at startup to ensure registry is loaded.
 * If registry isn't loaded yet, hardcoded fallbacks are used.
 *
 * @param {Object} options - Client configuration
 * @param {string} [options.purpose] - Purpose category: 'classification', 'fast', 'validation', 'generation'
 * @param {string} [options.subAgent] - Sub-agent code (e.g., 'DATABASE', 'TESTING')
 * @param {string} [options.phase] - SD phase (LEAD, PLAN, EXEC)
 * @param {string} [options.provider] - Force specific provider: 'anthropic', 'openai', 'google', 'ollama'
 * @param {string} [options.model] - Force specific model (overrides routing)
 * @param {boolean} [options.allowLocal=true] - Allow local LLM for haiku-tier
 * @returns {OllamaAdapter|AnthropicAdapter|OpenAIAdapter|GoogleAdapter}
 *
 * @example
 * // Initialize at startup (recommended)
 * await initializeLLMFactory();
 *
 * @example
 * // Get client for a sub-agent (respects routing config)
 * const client = getLLMClient({ subAgent: 'GITHUB', phase: 'EXEC' });
 *
 * @example
 * // Get client for classification (haiku-tier, uses local if enabled)
 * const client = getLLMClient({ purpose: 'classification' });
 *
 * @example
 * // Force cloud even for haiku-tier
 * const client = getLLMClient({ purpose: 'fast', allowLocal: false });
 */
export function getLLMClient(options = {}) {
  const {
    purpose,
    subAgent,
    phase,
    provider,
    model,
    allowLocal = true
  } = options;

  // If specific provider requested, return that adapter
  if (provider) {
    return getAdapterByProvider(provider, { model });
  }

  // If specific model requested, determine provider and return
  if (model) {
    return getAdapterForModel(model);
  }

  // Determine effort level or tier from routing config
  let effortOrTier = 'medium'; // Default

  if (subAgent) {
    // Use phase-aware routing — now returns effort level (low/medium/high)
    effortOrTier = getEffortForAgentAndPhase(subAgent, phase);
  } else if (purpose) {
    // Map purpose to tier (still uses haiku/sonnet/opus for backward compat)
    effortOrTier = getPurposeTier(purpose);
  }

  // Check if this is an effort level (new) vs a tier name (legacy)
  const isEffortLevel = ['low', 'medium', 'high'].includes(effortOrTier);
  const label = subAgent || purpose || 'request';

  // Route haiku-tier to local when enabled and allowed (legacy purpose-based path)
  if (!isEffortLevel && effortOrTier === 'haiku' && isLocalLLMEnabledInternal() && allowLocal) {
    const localModel = getLocalModel('haiku') || FALLBACK_LOCAL_MODEL;
    const cloudFallback = getTierModel('haiku');

    console.log(`   🏠 LLM Factory: Using local Ollama (${localModel}) for ${label}`);
    return getLocalFirstAdapter({
      localModel,
      fallbackModel: cloudFallback
    });
  }

  // Effort-based routing: use Anthropic Opus with thinking budget
  if (isEffortLevel) {
    const budgetTokens = EFFORT_TO_BUDGET[effortOrTier];
    console.log(`   🧠 LLM Factory: Opus with ${effortOrTier} effort (${budgetTokens} thinking tokens) for ${label}`);
    const adapter = new AnthropicAdapter({ model: THINKING_MODEL });
    // Attach thinking config so callers can pass it through to .complete()
    adapter.thinkingBudget = budgetTokens;
    adapter.effortLevel = effortOrTier;
    return adapter;
  }

  // Legacy tier-based routing for purpose-based calls
  const cloudModel = getTierModel(effortOrTier);

  // Use OpenAI cloud provider for non-effort routes
  if (process.env.OPENAI_API_KEY) {
    const tierToPurpose = { opus: 'validation', sonnet: 'validation', haiku: 'fast' };
    const openaiModel = getOpenAIModel(tierToPurpose[effortOrTier] || 'validation');
    console.log(`   ☁️  LLM Factory: Using OpenAI cloud (${openaiModel}) for ${label}`);
    return new OpenAIAdapter({ model: openaiModel });
  }

  // No cloud keys available - try local as last resort
  if (isLocalLLMEnabledInternal()) {
    const localModel = getLocalModel(effortOrTier) || FALLBACK_LOCAL_MODEL;
    console.log(`   🏠 LLM Factory: Using local fallback (${localModel}) for ${label} [no cloud API keys]`);
    return new OllamaAdapter({ model: localModel, fallbackEnabled: false });
  }

  // No options - return OpenAI adapter (will fail with clear error message about missing OPENAI_API_KEY)
  console.log(`   ⚠️  LLM Factory: No cloud API keys available for ${label} - returning OpenAI adapter (will require OPENAI_API_KEY)`);
  return new OpenAIAdapter({ model: cloudModel });
}

/**
 * Get the model tier for a given purpose
 * @param {string} purpose - Purpose category
 * @returns {string} Tier: haiku, sonnet, or opus
 */
function getPurposeTier(purpose) {
  const purposeToTier = {
    // Haiku-tier (fast, cheap, deterministic)
    classification: 'haiku',
    fast: 'haiku',
    screening: 'haiku',
    triage: 'haiku',

    // Effort-based routing → Opus 4.6 (replaces GPT 5.2)
    // SD-CORR-VIS-V07-DASHBOARD-SCOPE-001: Switched validation/analysis/design from
    // GPT-5.2 to Opus. Opus has codebase context, no timeouts, better quality.
    validation: 'medium',
    analysis: 'medium',
    design: 'medium',

    // Generation uses high effort → Opus 4.6
    // SD-LEO-INFRA-REPLACE-GPT-OPUS-001: Opus has codebase context, no timeouts
    generation: 'high',

    // Opus-tier (highest quality)
    security: 'opus',
    critical: 'opus'
  };

  return purposeToTier[purpose] || 'sonnet';
}

/**
 * Get adapter by provider name
 * @param {string} provider - Provider name
 * @param {Object} options - Adapter options
 * @returns {Adapter}
 */
function getAdapterByProvider(provider, options = {}) {
  switch (provider.toLowerCase()) {
    case 'ollama':
    case 'local':
      return new OllamaAdapter(options);
    case 'anthropic':
    case 'claude':
      return new AnthropicAdapter(options);
    case 'openai':
    case 'gpt':
      return new OpenAIAdapter(options);
    case 'google':
    case 'gemini':
      return new GoogleAdapter(options);
    default:
      console.warn(`Unknown provider: ${provider}, falling back to Anthropic`);
      return new AnthropicAdapter(options);
  }
}

/**
 * Get adapter for a specific model
 * @param {string} model - Model identifier
 * @returns {Adapter}
 */
function getAdapterForModel(model) {
  const modelLower = model.toLowerCase();

  if (modelLower.includes('claude') || modelLower.includes('haiku') ||
      modelLower.includes('sonnet') || modelLower.includes('opus')) {
    return new AnthropicAdapter({ model });
  }

  if (modelLower.includes('gpt') || modelLower.includes('openai')) {
    return new OpenAIAdapter({ model });
  }

  if (modelLower.includes('gemini') || modelLower.includes('palm')) {
    return new GoogleAdapter({ model });
  }

  // Assume local model for Ollama
  if (modelLower.includes('llama') || modelLower.includes('qwen') ||
      modelLower.includes('mistral') || modelLower.includes('deepseek')) {
    return new OllamaAdapter({ model });
  }

  // Default to Anthropic
  return new AnthropicAdapter({ model });
}

/**
 * Quick helper for classification tasks (common use case)
 * @returns {Adapter} Configured for classification
 */
export function getClassificationClient() {
  return getLLMClient({ purpose: 'classification' });
}

/**
 * Quick helper for fast/cheap tasks
 * @returns {Adapter} Configured for fast operations
 */
export function getFastClient() {
  return getLLMClient({ purpose: 'fast' });
}

/**
 * Quick helper for validation tasks
 * @returns {Adapter} Configured for validation
 */
export function getValidationClient() {
  return getLLMClient({ purpose: 'validation' });
}

/**
 * Quick helper for security-critical tasks (always cloud opus)
 * @returns {Adapter} Configured for security (opus tier)
 */
export function getSecurityClient() {
  return getLLMClient({ purpose: 'security', allowLocal: false });
}

/**
 * Get an embedding client for generating vector embeddings.
 *
 * Supports two providers:
 * - OpenAI text-embedding-3-small (1536 dimensions) — default, cloud
 * - Ollama nomic-embed-text (768 dimensions) — when USE_LOCAL_LLM=true
 *
 * The returned client exposes a single method:
 *   embed(text: string | string[]) → Promise<number[][]>
 *
 * @param {Object} [options]
 * @param {boolean} [options.allowLocal=true] - Allow local Ollama embeddings
 * @returns {{ embed: Function, model: string, dimensions: number, provider: string }}
 *
 * @example
 * const embedder = getEmbeddingClient();
 * const [vector] = await embedder.embed('search query');
 * // vector is a number[] of length embedder.dimensions
 */
export function getEmbeddingClient(options = {}) {
  const { allowLocal = true } = options;

  // Local Ollama embeddings when enabled
  if (allowLocal && isLocalLLMEnabledInternal() && process.env.OLLAMA_BASE_URL) {
    const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const model = 'nomic-embed-text';
    const dimensions = 768;

    return {
      model,
      dimensions,
      provider: 'ollama',
      async embed(input) {
        const texts = Array.isArray(input) ? input : [input];
        const embeddings = [];
        for (const text of texts) {
          const response = await fetch(`${ollamaBase}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: text }),
          });
          if (!response.ok) {
            throw new Error(`Ollama embedding failed: ${response.status} ${response.statusText}`);
          }
          const data = await response.json();
          embeddings.push(data.embedding);
        }
        return embeddings;
      },
    };
  }

  // OpenAI embeddings (default)
  const apiKey = process.env.OPENAI_API_KEY;
  const model = 'text-embedding-3-small';
  const dimensions = 1536;

  return {
    model,
    dimensions,
    provider: 'openai',
    async embed(input) {
      const texts = Array.isArray(input) ? input : [input];
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required for embedding generation');
      }
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI embedding failed (${response.status}): ${err}`);
      }
      const data = await response.json();
      return data.data.map((d) => d.embedding);
    },
  };
}

/**
 * Get client for a specific sub-agent with phase context
 * @param {string} subAgent - Sub-agent code
 * @param {string} [phase] - SD phase
 * @returns {Adapter}
 */
export function getSubAgentClient(subAgent, phase = null) {
  return getLLMClient({ subAgent, phase });
}

/**
 * Check if local LLM is enabled
 * @returns {boolean}
 */
export function isLocalLLMEnabled() {
  return isLocalLLMEnabledInternal();
}

/**
 * Get current routing status for diagnostics
 * @returns {Object} Current routing configuration
 */
export function getRoutingStatus() {
  const registrySource = modelRegistryCache?.source || 'not_loaded';
  const registryLoadedAt = modelRegistryCache?.loadedAt || null;
  const cacheValid = modelRegistryCache && Date.now() < cacheExpiry;

  return {
    useLocalLLM: isLocalLLMEnabledInternal(),
    localModel: getLocalModel('haiku') || FALLBACK_LOCAL_MODEL,
    tierMapping: {
      haiku: getTierModel('haiku'),
      sonnet: getTierModel('sonnet'),
      opus: getTierModel('opus')
    },
    effortConfig: {
      model: THINKING_MODEL,
      budgets: { ...EFFORT_TO_BUDGET }
    },
    registry: {
      source: registrySource,
      loadedAt: registryLoadedAt,
      cacheValid,
      cacheExpiresIn: cacheValid ? Math.round((cacheExpiry - Date.now()) / 1000) + 's' : 'expired',
      modelCount: modelRegistryCache?.models?.length || 0
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Get full model registry (async - loads from DB if needed)
 * @returns {Promise<Object>} Full registry object
 */
export async function getModelRegistry() {
  return await loadModelRegistry();
}

export default {
  getLLMClient,
  getClassificationClient,
  getFastClient,
  getValidationClient,
  getSecurityClient,
  getEmbeddingClient,
  getSubAgentClient,
  isLocalLLMEnabled,
  getRoutingStatus,
  initializeLLMFactory,
  refreshModelRegistry,
  getModelRegistry
};
