/**
 * Context-Aware Sub-Agent Selector - Index Module
 *
 * Re-exports all functionality from sub-modules for a clean public API.
 *
 * @module lib/modules/context-aware-selector
 */

// Configuration
export { HYBRID_CONFIG, getSupabaseClient, getOpenAIClient } from './config.js';

// Domain Keywords
export {
  DOMAIN_KEYWORDS,
  COORDINATION_GROUPS,
  loadDomainKeywords,
  loadCoordinationGroups
} from './domain-keywords.js';

// Keyword Matching
export {
  extractSDContent,
  countKeywordMatches,
  calculateDomainScore,
  checkCoordinationGroups,
  selectSubAgents,
  formatSelectionResults,
  buildKeywordMatchCounts
} from './keyword-matching.js';

// Hybrid Matching
export {
  generateSDEmbedding,
  fetchSemanticMatches,
  selectSubAgentsHybrid,
  formatHybridSelectionResults
} from './hybrid-matching.js';
