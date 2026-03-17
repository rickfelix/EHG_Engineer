/**
 * Context-Aware Sub-Agent Selector - Configuration Module
 *
 * Contains configuration constants and lazy-loaded client initialization.
 *
 * @module lib/modules/context-aware-selector/config
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';
import { getLLMClient } from '../../llm/client-factory.js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

export const HYBRID_CONFIG = {
  // Weights for hybrid matching (must sum to 1.0)
  semanticWeight: 0.6,   // 60% weight to semantic similarity
  keywordWeight: 0.4,    // 40% weight to keyword matching

  // Thresholds
  semanticThreshold: 0.7,     // Minimum semantic similarity (0-1)
  combinedThreshold: 0.6,     // Minimum combined score (0-1)

  // Fallback behavior
  useKeywordFallback: true,   // Fall back to keyword-only if embeddings fail

  // Model configuration
  embeddingModel: 'text-embedding-3-small',  // OpenAI model
  embeddingDimensions: 1536                  // Embedding dimensions
};

// ============================================================================
// Lazy-loaded Clients
// ============================================================================

let supabaseClient = null;
let llmClient = null;

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createSupabaseServiceClient();
  }
  return supabaseClient;
}

export function getOpenAIClient() {
  if (!llmClient) {
    llmClient = getLLMClient({ purpose: 'classification' });
  }
  return llmClient;
}
