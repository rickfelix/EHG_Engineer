/**
 * Context-Aware Sub-Agent Selector - Hybrid Matching Module
 *
 * Phase 4 implementation - Hybrid semantic + keyword matching
 * - Semantic similarity using OpenAI embeddings (text-embedding-3-small)
 * - Keyword-based confidence scoring
 * - Weighted combination (default: 60% semantic, 40% keyword)
 * - Fallback to keyword-only when embeddings unavailable
 *
 * @module lib/modules/context-aware-selector/hybrid-matching
 */

import { HYBRID_CONFIG, getSupabaseClient } from './config.js';
import { getEmbeddingClient } from '../../llm/client-factory.js';
import { DOMAIN_KEYWORDS } from './domain-keywords.js';
import {
  extractSDContent,
  checkCoordinationGroups,
  selectSubAgents,
  buildKeywordMatchCounts
} from './keyword-matching.js';

// ============================================================================
// Embedding Generation
// ============================================================================

/**
 * Generates OpenAI embedding for SD content
 *
 * @param {Object} sd - Strategic directive object
 * @returns {Promise<Array<number>>} - Embedding vector (1536 dimensions)
 */
export async function generateSDEmbedding(sd) {
  try {
    const embedder = getEmbeddingClient();

    // Combine SD content into a single text for embedding
    const content = extractSDContent(sd);
    const text = [
      `Title: ${content.title}`,
      `Description: ${content.description}`,
      content.business_value && `Business Value: ${content.business_value}`,
      content.technical_notes && `Technical Notes: ${content.technical_notes}`
    ].filter(Boolean).join('\n\n');

    // Generate embedding
    const [embedding] = await embedder.embed(text);

    return embedding;

  } catch (error) {
    console.error('Failed to generate SD embedding:', error.message);
    return null;
  }
}

// ============================================================================
// Semantic Matching
// ============================================================================

/**
 * Fetches semantic matches from database using embeddings
 *
 * @param {Array<number>} queryEmbedding - SD embedding vector
 * @param {Object} options - Query options
 * @returns {Promise<Array<Object>>} - Semantically similar sub-agents
 */
export async function fetchSemanticMatches(queryEmbedding, options = {}) {
  const {
    matchThreshold = HYBRID_CONFIG.semanticThreshold,
    matchCount = 10
  } = options;

  try {
    const supabase = getSupabaseClient();

    // Call the semantic matching function from database
    const { data, error } = await supabase.rpc('match_sub_agents_semantic', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount
    });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return data || [];

  } catch (error) {
    console.error('Failed to fetch semantic matches:', error.message);
    return [];
  }
}

// ============================================================================
// Hybrid Selection
// ============================================================================

/**
 * Hybrid selection: Combines semantic similarity with keyword matching
 *
 * @param {Object} sd - Strategic directive object
 * @param {Object} options - Selection options
 * @returns {Promise<Object>} - Recommended sub-agents with hybrid scores
 */
export async function selectSubAgentsHybrid(sd, options = {}) {
  const {
    semanticWeight = HYBRID_CONFIG.semanticWeight,
    keywordWeight = HYBRID_CONFIG.keywordWeight,
    combinedThreshold = HYBRID_CONFIG.combinedThreshold,
    useKeywordFallback = HYBRID_CONFIG.useKeywordFallback,
    matchCount = 10
  } = options;

  // Step 1: Generate embedding for SD
  const queryEmbedding = await generateSDEmbedding(sd);

  // Step 2: If embeddings failed and fallback enabled, use keyword-only
  if (!queryEmbedding && useKeywordFallback) {
    console.warn('Embeddings unavailable, falling back to keyword-only matching');
    return selectSubAgents(sd, { confidenceThreshold: combinedThreshold });
  }

  if (!queryEmbedding) {
    throw new Error('Failed to generate SD embedding and fallback disabled');
  }

  // Step 3: Build keyword match counts
  const keywordMatchCounts = buildKeywordMatchCounts(sd);

  // Step 4: Call hybrid matching function from database
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.rpc('match_sub_agents_hybrid', {
      query_embedding: queryEmbedding,
      keyword_matches: keywordMatchCounts,
      semantic_weight: semanticWeight,
      keyword_weight: keywordWeight,
      match_threshold: combinedThreshold,
      match_count: matchCount
    });

    if (error) {
      throw new Error(`Hybrid matching failed: ${error.message}`);
    }

    // Step 5: Format results
    const results = (data || []).map(agent => ({
      code: agent.code,
      name: agent.name,
      confidence: Math.round(agent.combined_score * 100),  // Convert to percentage
      semanticScore: Math.round(agent.semantic_score * 100),
      keywordScore: Math.round(agent.keyword_score * 100),
      keywordMatches: agent.keyword_match_count,
      priority: agent.priority,
      reason: `Hybrid match: ${Math.round(agent.semantic_score * 100)}% semantic + ${Math.round(agent.keyword_score * 100)}% keyword (${agent.keyword_match_count} keywords)`
    }));

    // Step 6: Check coordination groups (reuse existing logic)
    const content = extractSDContent(sd);
    const coordinationGroups = checkCoordinationGroups(content);
    const triggeredGroups = [];

    for (const group of coordinationGroups) {
      if (group.keywordMatches >= 2) {
        triggeredGroups.push(group);

        for (const agentCode of group.agents) {
          if (!results.some(r => r.code === agentCode)) {
            const domain = DOMAIN_KEYWORDS[agentCode];
            if (domain) {
              results.push({
                code: agentCode,
                name: domain.name,
                confidence: 60,
                semanticScore: 0,
                keywordScore: 0,
                keywordMatches: 0,
                priority: 0,
                reason: `Coordination required: ${group.reason}`,
                coordinationGroup: group.groupName
              });
            }
          }
        }
      }
    }

    // Sort by combined confidence (highest first)
    results.sort((a, b) => b.confidence - a.confidence);

    return {
      recommended: results,
      coordinationGroups: triggeredGroups,
      matchingStrategy: 'hybrid',
      summary: {
        totalRecommended: results.length,
        highConfidence: results.filter(r => r.confidence >= 75).length,
        mediumConfidence: results.filter(r => r.confidence >= 50 && r.confidence < 75).length,
        lowConfidence: results.filter(r => r.confidence < 50).length,
        semanticWeight,
        keywordWeight
      }
    };

  } catch (error) {
    console.error('Hybrid matching error:', error.message);

    // Fallback to keyword-only if enabled
    if (useKeywordFallback) {
      console.warn('Falling back to keyword-only matching');
      return selectSubAgents(sd, { confidenceThreshold: combinedThreshold });
    }

    throw error;
  }
}

/**
 * Formats hybrid selection results for display
 *
 * @param {Object} selectionResult - Result from selectSubAgentsHybrid()
 * @returns {string} - Formatted output
 */
export function formatHybridSelectionResults(selectionResult) {
  const { recommended, coordinationGroups, summary, matchingStrategy } = selectionResult;

  let output = 'Hybrid Sub-Agent Selection Results (Semantic + Keyword)\n\n';
  output += '=' .repeat(70) + '\n\n';

  if (recommended.length === 0) {
    output += 'No sub-agents recommended (confidence threshold not met)\n';
    return output;
  }

  output += `Matching Strategy: ${matchingStrategy || 'hybrid'}\n`;
  output += `Weights: ${Math.round((summary.semanticWeight || 0.6) * 100)}% semantic, ${Math.round((summary.keywordWeight || 0.4) * 100)}% keyword\n\n`;
  output += `Summary: ${summary.totalRecommended} sub-agents recommended\n`;
  output += `   High Confidence (>=75%): ${summary.highConfidence}\n`;
  output += `   Medium Confidence (50-74%): ${summary.mediumConfidence}\n`;
  output += `   Low Confidence (<50%): ${summary.lowConfidence}\n\n`;

  output += '=' .repeat(70) + '\n\n';

  recommended.forEach((agent, index) => {
    const confidenceBar = '='.repeat(Math.round(agent.confidence / 5));
    output += `${index + 1}. ${agent.code} - ${agent.name}\n`;
    output += `   Combined: ${agent.confidence}% ${confidenceBar}\n`;

    if (agent.semanticScore !== undefined && agent.keywordScore !== undefined) {
      output += `   - Semantic: ${agent.semanticScore}% | Keyword: ${agent.keywordScore}% (${agent.keywordMatches} matches)\n`;
    }

    output += `   Reason: ${agent.reason}\n`;

    if (agent.coordinationGroup) {
      output += `   Coordination Group: ${agent.coordinationGroup}\n`;
    }
    output += '\n';
  });

  if (coordinationGroups && coordinationGroups.length > 0) {
    output += '=' .repeat(70) + '\n\n';
    output += 'Coordination Groups Detected:\n\n';
    coordinationGroups.forEach(group => {
      output += `* ${group.groupName}: ${group.agents.join(', ')}\n`;
      output += `  Reason: ${group.reason}\n\n`;
    });
  }

  return output;
}
