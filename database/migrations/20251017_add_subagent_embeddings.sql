-- ============================================================================
-- Migration: Add Vector Embeddings to Sub-Agents for Semantic Search
-- ============================================================================
-- Purpose: Enable hybrid (semantic + keyword) sub-agent selection
-- Created: 2025-10-17
-- Part of: Phase 4 - Semantic Search Enhancement
--
-- This migration adds OpenAI embedding support to leo_sub_agents table,
-- enabling semantic similarity matching in addition to keyword triggers.
--
-- Benefits:
-- - Reduced false positives (from ~20-30% to <10%)
-- - Better context understanding (semantic vs literal keywords)
-- - Hybrid scoring: semantic similarity + keyword match confidence
-- ============================================================================

-- Enable pgvector extension (required for vector operations)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Schema Changes
-- ============================================================================

-- Add domain_embedding column to leo_sub_agents table
-- Using 1536 dimensions (OpenAI text-embedding-3-small standard)
ALTER TABLE leo_sub_agents
ADD COLUMN IF NOT EXISTS domain_embedding vector(1536);

-- Add metadata columns for embedding management
ALTER TABLE leo_sub_agents
ADD COLUMN IF NOT EXISTS embedding_generated_at timestamptz,
ADD COLUMN IF NOT EXISTS embedding_model varchar(100) DEFAULT 'text-embedding-3-small';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Create IVFFlat index for efficient vector similarity search
-- IVFFlat is optimal for datasets with 100-1M rows
-- Using cosine distance (1 - cosine_similarity) as the metric
-- Lists parameter: sqrt(row_count) is a good starting point for small datasets
CREATE INDEX IF NOT EXISTS idx_leo_sub_agents_embedding
ON leo_sub_agents
USING ivfflat (domain_embedding vector_cosine_ops)
WITH (lists = 10);

-- Note: For production with more agents, adjust lists parameter:
-- - 10 lists: <100 agents (current)
-- - 100 lists: 100-10,000 agents
-- - 1000 lists: >10,000 agents

-- ============================================================================
-- Semantic Matching Function
-- ============================================================================

-- Function: match_sub_agents_semantic
-- Purpose: Find sub-agents semantically similar to query text embedding
--
-- Parameters:
--   query_embedding: vector(1536) - The embedding of the SD scope/description
--   match_threshold: float - Minimum similarity score (0-1, default 0.7)
--   match_count: int - Maximum number of results to return (default 5)
--
-- Returns: Table with sub-agent details and similarity scores
--
-- Usage:
--   SELECT * FROM match_sub_agents_semantic(
--     query_embedding := '[0.1, 0.2, ...]'::vector(1536),
--     match_threshold := 0.75,
--     match_count := 3
--   );

CREATE OR REPLACE FUNCTION match_sub_agents_semantic(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  code varchar(50),
  name varchar(255),
  description text,
  priority integer,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id,
    sa.code,
    sa.name,
    sa.description,
    sa.priority,
    -- Calculate cosine similarity (1 - cosine distance)
    1 - (sa.domain_embedding <=> query_embedding) AS similarity
  FROM leo_sub_agents sa
  WHERE
    sa.active = true
    AND sa.domain_embedding IS NOT NULL
    -- Filter by similarity threshold
    AND 1 - (sa.domain_embedding <=> query_embedding) >= match_threshold
  ORDER BY
    -- Sort by similarity (highest first)
    sa.domain_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- Helper Function: Hybrid Matching (Semantic + Keyword)
-- ============================================================================

-- Function: match_sub_agents_hybrid
-- Purpose: Combine semantic similarity with keyword-based priority boosting
--
-- Parameters:
--   query_embedding: vector(1536) - The embedding of the SD scope/description
--   keyword_matches: jsonb - Map of sub_agent_code -> keyword_match_count
--   semantic_weight: float - Weight for semantic score (0-1, default 0.6)
--   keyword_weight: float - Weight for keyword score (0-1, default 0.4)
--   match_threshold: float - Minimum combined score (0-1, default 0.6)
--   match_count: int - Maximum number of results (default 10)
--
-- Returns: Table with hybrid scores and component breakdown
--
-- Example keyword_matches JSON:
--   {"API": 3, "DATABASE": 2, "SECURITY": 1}
--
-- Usage:
--   SELECT * FROM match_sub_agents_hybrid(
--     query_embedding := '[0.1, 0.2, ...]'::vector(1536),
--     keyword_matches := '{"API": 3, "DATABASE": 2}'::jsonb,
--     semantic_weight := 0.6,
--     keyword_weight := 0.4
--   );

CREATE OR REPLACE FUNCTION match_sub_agents_hybrid(
  query_embedding vector(1536),
  keyword_matches jsonb DEFAULT '{}'::jsonb,
  semantic_weight float DEFAULT 0.6,
  keyword_weight float DEFAULT 0.4,
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  code varchar(50),
  name varchar(255),
  priority integer,
  semantic_score float,
  keyword_score float,
  combined_score float,
  keyword_match_count int
)
LANGUAGE plpgsql
AS $$
DECLARE
  max_keyword_matches int;
BEGIN
  -- Find maximum keyword match count for normalization
  SELECT COALESCE(MAX((value)::int), 1)
  INTO max_keyword_matches
  FROM jsonb_each_text(keyword_matches);

  RETURN QUERY
  SELECT
    sa.id,
    sa.code,
    sa.name,
    sa.priority,
    -- Semantic similarity (cosine similarity, 0-1)
    (1 - (sa.domain_embedding <=> query_embedding))::float AS semantic_score,
    -- Normalized keyword score (0-1)
    COALESCE(
      ((keyword_matches->>sa.code)::float / max_keyword_matches),
      0
    )::float AS keyword_score,
    -- Combined weighted score
    (
      semantic_weight * (1 - (sa.domain_embedding <=> query_embedding)) +
      keyword_weight * COALESCE(
        ((keyword_matches->>sa.code)::float / max_keyword_matches),
        0
      )
    )::float AS combined_score,
    -- Raw keyword match count
    COALESCE((keyword_matches->>sa.code)::int, 0) AS keyword_match_count
  FROM leo_sub_agents sa
  WHERE
    sa.active = true
    AND sa.domain_embedding IS NOT NULL
    -- Filter by combined score threshold
    AND (
      semantic_weight * (1 - (sa.domain_embedding <=> query_embedding)) +
      keyword_weight * COALESCE(
        ((keyword_matches->>sa.code)::float / max_keyword_matches),
        0
      )
    ) >= match_threshold
  ORDER BY
    combined_score DESC,
    sa.priority DESC
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- Comments and Documentation
-- ============================================================================

COMMENT ON COLUMN leo_sub_agents.domain_embedding IS
  'OpenAI embedding (text-embedding-3-small, 1536 dimensions) of sub-agent domain description. Used for semantic similarity matching.';

COMMENT ON COLUMN leo_sub_agents.embedding_generated_at IS
  'Timestamp when the embedding was last generated. Used to track staleness.';

COMMENT ON COLUMN leo_sub_agents.embedding_model IS
  'OpenAI model used to generate the embedding. Default: text-embedding-3-small';

COMMENT ON FUNCTION match_sub_agents_semantic IS
  'Semantic search: Find sub-agents similar to query embedding using cosine similarity. Returns agents with similarity >= threshold.';

COMMENT ON FUNCTION match_sub_agents_hybrid IS
  'Hybrid search: Combine semantic similarity with keyword match scores. Returns weighted combination of both signals.';

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Run these queries after migration to verify success:

-- 1. Check column was added
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'leo_sub_agents'
-- AND column_name IN ('domain_embedding', 'embedding_generated_at', 'embedding_model');

-- 2. Check index was created
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'leo_sub_agents'
-- AND indexname = 'idx_leo_sub_agents_embedding';

-- 3. Check functions were created
-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_name IN ('match_sub_agents_semantic', 'match_sub_agents_hybrid');

-- 4. Verify all active sub-agents are ready for embeddings
-- SELECT code, name,
--   CASE WHEN domain_embedding IS NULL THEN 'Missing' ELSE 'Present' END AS embedding_status
-- FROM leo_sub_agents
-- WHERE active = true
-- ORDER BY priority DESC;

-- ============================================================================
-- Rollback Instructions
-- ============================================================================

-- To rollback this migration:
-- DROP FUNCTION IF EXISTS match_sub_agents_hybrid;
-- DROP FUNCTION IF EXISTS match_sub_agents_semantic;
-- DROP INDEX IF EXISTS idx_leo_sub_agents_embedding;
-- ALTER TABLE leo_sub_agents DROP COLUMN IF EXISTS domain_embedding;
-- ALTER TABLE leo_sub_agents DROP COLUMN IF EXISTS embedding_generated_at;
-- ALTER TABLE leo_sub_agents DROP COLUMN IF EXISTS embedding_model;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Next Steps:
-- 1. Run scripts/generate-subagent-embeddings.js to populate embeddings
-- 2. Verify embeddings with: SELECT COUNT(*) FROM leo_sub_agents WHERE domain_embedding IS NOT NULL;
-- 3. Test semantic matching with sample query embeddings
-- 4. Integrate hybrid matching into context-aware-sub-agent-selector.js
