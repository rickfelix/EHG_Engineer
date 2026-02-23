/**
 * Semantic Search Client
 *
 * API wrapper for semantic code search using LLM factory embeddings and pgvector
 *
 * @module lib/semantic-search-client
 * @sd SD-SEMANTIC-SEARCH-001
 * @story US-001 - Natural Language Code Search
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

/**
 * Initialize clients
 */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Service role for RPC access
);

/**
 * Lazy-loaded embedding client from centralized LLM factory
 * Uses dynamic import() because this is a CommonJS file and the factory is ESM
 */
let _embedder = null;
async function getEmbedder() {
  if (!_embedder) {
    const { getEmbeddingClient } = await import('./llm/client-factory.js');
    _embedder = getEmbeddingClient();
  }
  return _embedder;
}

/**
 * Generate embedding for a text query using centralized LLM factory
 *
 * @param {string} query - Natural language query
 * @returns {Promise<number[]>} Embedding vector (dimensions determined by factory provider)
 */
async function generateQueryEmbedding(query) {
  const embedder = await getEmbedder();
  const [embedding] = await embedder.embed(query);
  return embedding;
}

/**
 * Search codebase using natural language query
 *
 * @param {Object} options - Search options
 * @param {string} options.query - Natural language search query
 * @param {string} [options.application] - Filter by application ('ehg' or 'ehg_engineer')
 * @param {string} [options.entityType] - Filter by entity type ('function', 'class', 'component', etc.)
 * @param {string} [options.language] - Filter by language ('typescript', 'javascript', etc.)
 * @param {number} [options.matchThreshold=0.7] - Minimum similarity threshold (0-1)
 * @param {number} [options.matchCount=10] - Maximum number of results
 * @returns {Promise<Array>} Array of matching code entities with similarity scores
 */
async function searchCode({
  query,
  application = null,
  entityType = null,
  language = null,
  matchThreshold = 0.7,
  matchCount = 10
}) {
  // Step 1: Generate embedding for query
  const queryEmbedding = await generateQueryEmbedding(query);

  // Step 2: Call semantic_code_search RPC function
  const { data, error } = await supabase.rpc('semantic_code_search', {
    query_embedding: queryEmbedding,
    application_filter: application,
    entity_type_filter: entityType,
    language_filter: language,
    match_threshold: matchThreshold,
    match_count: matchCount
  });

  if (error) {
    throw new Error(`Semantic search failed: ${error.message}`);
  }

  return data;
}

/**
 * Get codebase statistics from semantic index
 *
 * @returns {Promise<Array>} Statistics grouped by application, entity type, and language
 */
async function getCodebaseStats() {
  const { data, error } = await supabase
    .from('codebase_semantic_stats')
    .select('*')
    .order('application')
    .order('entity_type');

  if (error) {
    throw new Error(`Failed to fetch codebase stats: ${error.message}`);
  }

  return data;
}

/**
 * Check if semantic index is populated
 *
 * @returns {Promise<Object>} Index status with counts
 */
async function getIndexStatus() {
  const { data: stats } = await supabase
    .from('codebase_semantic_index')
    .select('application, entity_type', { count: 'exact', head: true });

  const { data: latest } = await supabase
    .from('codebase_semantic_index')
    .select('last_updated')
    .order('last_updated', { ascending: false })
    .limit(1)
    .single();

  return {
    totalEntities: stats?.count || 0,
    lastUpdated: latest?.last_updated || null,
    isPopulated: (stats?.count || 0) > 0
  };
}

/**
 * Search with automatic application detection
 * Attempts to search in both applications if no application filter specified
 *
 * @param {string} query - Natural language search query
 * @param {Object} [options={}] - Additional search options
 * @returns {Promise<Object>} Results grouped by application
 */
async function searchAllApplications(query, options = {}) {
  const [ehgResults, ehgEngineerResults] = await Promise.all([
    searchCode({ query, application: 'ehg', ...options }),
    searchCode({ query, application: 'ehg_engineer', ...options })
  ]);

  return {
    ehg: ehgResults,
    ehg_engineer: ehgEngineerResults,
    combined: [...ehgResults, ...ehgEngineerResults]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.matchCount || 10)
  };
}

module.exports = {
  searchCode,
  searchAllApplications,
  generateQueryEmbedding,
  getCodebaseStats,
  getIndexStatus
};
