/**
 * LLM Client Factory
 * Central authority for all LLM client creation in EHG_Engineer
 *
 * This factory:
 * 1. Reads routing config to determine model tier (haiku/sonnet/opus)
 * 2. Routes haiku-tier to Ollama when USE_LOCAL_LLM=true
 * 3. Returns appropriate adapter for cloud calls
 * 4. Provides unified interface for all LLM operations
 *
 * @module lib/llm/client-factory
 * @created 2026-02-05
 * @see config/phase-model-routing.json for routing configuration
 * @see scripts/benchmarks/README.md for model benchmarks
 */

import { getModelForAgentAndPhase } from '../sub-agent-executor/model-routing.js';
import {
  OllamaAdapter,
  AnthropicAdapter,
  OpenAIAdapter,
  GoogleAdapter,
  getLocalFirstAdapter
} from '../sub-agents/vetting/provider-adapters.js';

/**
 * Check if local LLM is enabled (evaluated at call time, not module load)
 * This ensures dotenv has a chance to load first
 */
function isLocalLLMEnabledInternal() {
  return process.env.USE_LOCAL_LLM === 'true';
}

// Model tier to actual model mapping
const TIER_TO_MODEL = {
  haiku: 'claude-haiku-3-5-20241022',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-5-20251101'
};

// Local model for haiku-tier tasks (benchmarked best performer)
const LOCAL_HAIKU_REPLACEMENT = 'qwen3-coder:30b';

/**
 * Get an LLM client configured for the specified purpose
 *
 * This is the primary entry point for all LLM operations.
 * It respects the routing config and local LLM settings.
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

  // Determine tier from routing config
  let tier = 'sonnet'; // Default to sonnet for safety

  if (subAgent) {
    // Use phase-aware routing for sub-agents
    tier = getModelForAgentAndPhase(subAgent, phase);
  } else if (purpose) {
    // Map purpose to tier
    tier = getPurposeTier(purpose);
  }

  // Route haiku-tier to local when enabled and allowed
  if (tier === 'haiku' && isLocalLLMEnabledInternal() && allowLocal) {
    console.log(`   🏠 LLM Factory: Using local Ollama for ${subAgent || purpose || 'haiku-tier'}`);
    return getLocalFirstAdapter({
      localModel: LOCAL_HAIKU_REPLACEMENT,
      fallbackModel: TIER_TO_MODEL.haiku
    });
  }

  // Return cloud Anthropic adapter with appropriate model
  const cloudModel = TIER_TO_MODEL[tier] || TIER_TO_MODEL.sonnet;
  console.log(`   ☁️  LLM Factory: Using cloud ${tier} for ${subAgent || purpose || 'request'}`);
  return new AnthropicAdapter({ model: cloudModel });
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

    // Sonnet-tier (balanced)
    validation: 'sonnet',
    generation: 'sonnet',
    analysis: 'sonnet',
    design: 'sonnet',

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
  return {
    useLocalLLM: isLocalLLMEnabledInternal(),
    localModel: LOCAL_HAIKU_REPLACEMENT,
    tierMapping: TIER_TO_MODEL,
    timestamp: new Date().toISOString()
  };
}

export default {
  getLLMClient,
  getClassificationClient,
  getFastClient,
  getValidationClient,
  getSecurityClient,
  getSubAgentClient,
  isLocalLLMEnabled,
  getRoutingStatus
};
