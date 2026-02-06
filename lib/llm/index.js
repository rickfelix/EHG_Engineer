/**
 * LLM Module
 * Centralized LLM client management for EHG_Engineer
 *
 * @module lib/llm
 * @created 2026-02-05
 * @updated 2026-02-06 - SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001C: Canary routing
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
 *
 * @example
 * // Canary routing (SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001C)
 * import { getCanaryRoutedClient, getCanaryStatus } from '../llm/index.js';
 *
 * // Get client with canary traffic splitting
 * const { client, routing } = await getCanaryRoutedClient({ purpose: 'classification' });
 * console.log(`Routed to: ${routing.routedTo} (${routing.model})`);
 */

export {
  getLLMClient,
  getClassificationClient,
  getFastClient,
  getValidationClient,
  getSecurityClient,
  getSubAgentClient,
  isLocalLLMEnabled,
  getRoutingStatus,
  // SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001B: Database-driven registry
  initializeLLMFactory,
  refreshModelRegistry,
  getModelRegistry
} from './client-factory.js';

// SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001C: Canary routing exports
export {
  // Routing
  getCanaryRoutedClient,
  getBucketId,
  shouldRouteToLocal,
  // State management
  getCanaryState,
  refreshCanaryState,
  // Stage control
  advanceCanaryStage,
  setCanaryStage,
  pauseCanary,
  resumeCanary,
  rollbackCanary,
  // Quality gates
  evaluateQualityGates,
  checkAndRollbackIfNeeded,
  // Status
  getCanaryStatus,
  // Lifecycle
  initializeCanaryRouter
} from './canary-router.js';

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
