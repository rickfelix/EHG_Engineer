/**
 * Context-Aware Sub-Agent Selector
 *
 * Pattern 4 implementation - Intelligently selects relevant sub-agents based on SD content analysis.
 * Reduces false positives through compound keyword matching, context weighting, and exclusion patterns.
 *
 * PHASE 4 ENHANCEMENT: Hybrid semantic + keyword matching
 * - Semantic similarity using OpenAI embeddings (text-embedding-3-small)
 * - Keyword-based confidence scoring
 * - Weighted combination (default: 60% semantic, 40% keyword)
 * - Fallback to keyword-only when embeddings unavailable
 *
 * Part of LEO Protocol Pattern 4 implementation.
 *
 * @module lib/context-aware-sub-agent-selector
 */

// Re-export all functionality from modularized sub-modules
export {
  // Configuration
  HYBRID_CONFIG,

  // Domain Keywords
  DOMAIN_KEYWORDS,
  COORDINATION_GROUPS,

  // Keyword Matching
  extractSDContent,
  countKeywordMatches,
  calculateDomainScore,
  checkCoordinationGroups,
  selectSubAgents,
  formatSelectionResults,

  // Hybrid Matching
  generateSDEmbedding,
  fetchSemanticMatches,
  buildKeywordMatchCounts,
  selectSubAgentsHybrid,
  formatHybridSelectionResults
} from './modules/context-aware-selector/index.js';

// Import for CLI execution
import {
  selectSubAgents,
  selectSubAgentsHybrid,
  formatSelectionResults,
  formatHybridSelectionResults
} from './modules/context-aware-selector/index.js';

// CLI execution for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const useHybrid = process.argv.includes('--hybrid');

  // Example SD for testing
  const testSD = {
    title: process.argv[2] || 'User Authentication System',
    description: process.argv[3] || 'Implement login, logout, and session management with RLS policies',
    business_value: 'Secure user access',
    technical_notes: 'Use Supabase Auth, implement RLS policies on all tables'
  };

  console.log('Testing with SD:');
  console.log(`Title: ${testSD.title}`);
  console.log(`Description: ${testSD.description}`);
  console.log(`Mode: ${useHybrid ? 'HYBRID (semantic + keyword)' : 'KEYWORD-ONLY'}\n`);

  if (useHybrid) {
    // Test hybrid mode
    selectSubAgentsHybrid(testSD)
      .then(result => {
        console.log(formatHybridSelectionResults(result));
      })
      .catch(error => {
        console.error('Hybrid selection failed:', error.message);
        process.exit(1);
      });
  } else {
    // Test keyword-only mode
    const result = selectSubAgents(testSD);
    console.log(formatSelectionResults(result));
  }
}
