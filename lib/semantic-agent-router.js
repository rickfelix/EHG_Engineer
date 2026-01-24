/**
 * Semantic Agent Router
 *
 * Routes user queries to appropriate sub-agents using semantic similarity.
 * Uses OpenAI embeddings and cosine similarity for intent matching.
 *
 * Part of SD-LEO-INFRA-SEMANTIC-ROUTING-001
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const EMBEDDING_MODEL = 'text-embedding-3-small';
const SIMILARITY_THRESHOLD = 0.35; // Minimum similarity for a match (35% captures semantic intent)
const TOP_K = 5; // Return top 5 matches

/**
 * Parse a vector from string format (PostgreSQL pgvector returns "[x,y,z,...]")
 */
function parseVector(vec) {
  if (Array.isArray(vec)) return vec;
  if (typeof vec === 'string') {
    // pgvector format: "[0.1,0.2,0.3,...]"
    try {
      const cleaned = vec.replace(/^\[|\]$/g, '');
      return cleaned.split(',').map(Number);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Calculates cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  const vecA = parseVector(a);
  const vecB = parseVector(b);

  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * SemanticAgentRouter - Routes queries to sub-agents using semantic similarity
 */
export class SemanticAgentRouter {
  constructor(options = {}) {
    this.supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.threshold = options.threshold || SIMILARITY_THRESHOLD;
    this.topK = options.topK || TOP_K;
    this.agentCache = null;
    this.cacheExpiry = null;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Load all sub-agents with their embeddings (cached)
   */
  async loadAgents() {
    const now = Date.now();

    if (this.agentCache && this.cacheExpiry && this.cacheExpiry > now) {
      return this.agentCache;
    }

    const { data, error } = await this.supabase
      .from('leo_sub_agents')
      .select('code, name, description, priority, domain_embedding')
      .eq('active', true)
      .not('domain_embedding', 'is', null);

    if (error) {
      throw new Error(`Failed to load sub-agents: ${error.message}`);
    }

    this.agentCache = data || [];
    this.cacheExpiry = now + this.cacheTTL;

    return this.agentCache;
  }

  /**
   * Generate embedding for a query string
   */
  async generateQueryEmbedding(query) {
    try {
      const response = await this.openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: query
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Failed to generate query embedding:', error.message);
      return null;
    }
  }

  /**
   * Route a query to the most appropriate sub-agents
   *
   * @param {string} query - User query or context
   * @param {Object} options - Routing options
   * @returns {Promise<Array>} - Ranked list of matching sub-agents
   */
  async route(query, options = {}) {
    const {
      threshold = this.threshold,
      topK = this.topK
    } = options;

    // Generate embedding for the query
    const queryEmbedding = await this.generateQueryEmbedding(query);

    if (!queryEmbedding) {
      console.warn('Embedding generation failed, falling back to keyword-only');
      return this.keywordFallback(query);
    }

    // Load agents with embeddings
    const agents = await this.loadAgents();

    // Calculate similarity scores
    const scored = agents.map(agent => {
      const semanticScore = cosineSimilarity(queryEmbedding, agent.domain_embedding);

      return {
        code: agent.code,
        name: agent.name,
        description: agent.description,
        priority: agent.priority,
        semanticScore: Math.round(semanticScore * 100),
        combinedScore: Math.round(semanticScore * 100),
        reason: `Semantic similarity: ${Math.round(semanticScore * 100)}%`
      };
    });

    // Filter by threshold and sort by combined score
    const matches = scored
      .filter(agent => agent.combinedScore >= threshold * 100)
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, topK);

    return matches;
  }

  /**
   * Keyword-only fallback when embeddings fail
   * Uses simple text matching on description
   */
  async keywordFallback(query) {
    const agents = await this.loadAgents();
    const queryLower = query.toLowerCase();

    const scored = agents
      .map(agent => {
        // Simple text matching on description
        const descLower = (agent.description || '').toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
        const matched = queryWords.filter(word => descLower.includes(word));

        return {
          code: agent.code,
          name: agent.name,
          description: agent.description,
          priority: agent.priority,
          semanticScore: 0,
          combinedScore: matched.length * 10,
          reason: `Word matches: ${matched.length}`,
          matchedWords: matched
        };
      })
      .filter(agent => agent.combinedScore > 0)
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, this.topK);

    return scored;
  }

  /**
   * Test routing with example queries
   */
  async runTests() {
    const testQueries = [
      'identify the root cause of this bug',
      'why is this failing',
      'find the source of this error',
      'analyze performance bottlenecks',
      'check for security vulnerabilities',
      'create database migration',
      'design the user interface',
      'write unit tests for this function'
    ];

    console.log('\n🧪 Semantic Agent Router - Test Results\n');
    console.log('='.repeat(70));

    for (const query of testQueries) {
      console.log(`\n📝 Query: "${query}"`);
      console.log('-'.repeat(50));

      const matches = await this.route(query);

      if (matches.length === 0) {
        console.log('   No matches found above threshold');
      } else {
        matches.forEach((match, i) => {
          console.log(`   ${i + 1}. ${match.code} (${match.combinedScore}%) - ${match.name}`);
          console.log(`      ${match.reason}`);
        });
      }
    }

    console.log('\n' + '='.repeat(70));
  }
}

// CLI entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     process.argv[1]?.endsWith('semantic-agent-router.js');

if (isMainModule) {
  const router = new SemanticAgentRouter();

  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    router.runTests().catch(err => {
      console.error('Test failed:', err.message);
      process.exit(1);
    });
  } else if (args.length > 0) {
    const query = args.filter(a => !a.startsWith('--')).join(' ');
    router.route(query).then(matches => {
      console.log(JSON.stringify(matches, null, 2));
    }).catch(err => {
      console.error('Routing failed:', err.message);
      process.exit(1);
    });
  } else {
    console.log('Usage:');
    console.log('  node lib/semantic-agent-router.js --test');
    console.log('  node lib/semantic-agent-router.js "your query here"');
  }
}

export default SemanticAgentRouter;
