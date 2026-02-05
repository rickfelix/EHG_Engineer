/**
 * LLM Module
 * Centralized LLM client management for EHG_Engineer
 *
 * @module lib/llm
 * @created 2026-02-05
 *
 * @example
 * import { getLLMClient, getClassificationClient } from '../llm/index.js';
 *
 * // Get client for sub-agent
 * const client = getLLMClient({ subAgent: 'DATABASE', phase: 'EXEC' });
 * const result = await client.complete(systemPrompt, userPrompt);
 *
 * // Quick helper for classification
 * const classifier = getClassificationClient();
 */

export {
  getLLMClient,
  getClassificationClient,
  getFastClient,
  getValidationClient,
  getSecurityClient,
  getSubAgentClient,
  isLocalLLMEnabled,
  getRoutingStatus
} from './client-factory.js';

// Re-export adapters for direct access when needed
export {
  OllamaAdapter,
  AnthropicAdapter,
  OpenAIAdapter,
  GoogleAdapter,
  getLocalFirstAdapter,
  getProviderAdapter,
  getAllAdapters
} from '../sub-agents/vetting/provider-adapters.js';
