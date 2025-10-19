-- ============================================================================
-- Migration: Add Vector Embeddings to Strategic Directives for Semantic Search
-- ============================================================================
-- Purpose: Enable hybrid (semantic + keyword) SD analysis and sub-agent selection
-- Created: 2025-10-17
-- Part of: Phase 5 - Semantic Search Deployment
--
-- This migration adds OpenAI embedding support to strategic_directives_v2 table,
-- enabling semantic similarity search for:
-- - Better sub-agent selection (reduce false positives)
-- - Similar SD detection
-- - Improved duplicate work prevention
--
-- Benefits:
-- - Reduced false positives in sub-agent selection (from ~20-30% to <10%)
-- - Better context understanding beyond literal keywords
-- - Enhanced VALIDATION sub-agent duplicate detection
-- ============================================================================

-- Enable pgvector extension (required for vector operations)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Schema Changes
-- ============================================================================

-- Add scope_embedding column to strategic_directives_v2 table
-- Using 1536 dimensions (OpenAI text-embedding-3-small standard)
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS scope_embedding vector(1536);

-- Add metadata columns for embedding management
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS embedding_generated_at timestamptz,
ADD COLUMN IF NOT EXISTS embedding_model varchar(100) DEFAULT 'text-embedding-3-small';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Create IVFFlat index for efficient vector similarity search
-- IVFFlat is optimal for datasets with 100-1M rows
-- Using cosine distance (1 - cosine_similarity) as the metric
-- Lists parameter: sqrt(row_count) is a good starting point
CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_embedding
ON strategic_directives_v2
USING ivfflat (scope_embedding vector_cosine_ops)
WITH (lists = 50);

-- Note: For production with more SDs, adjust lists parameter:
-- - 50 lists: 100-10,000 SDs (current estimate)
-- - 100 lists: 10,000-100,000 SDs
-- - 1000 lists: >100,000 SDs

-- ============================================================================
-- Semantic Search Functions
-- ============================================================================

-- Function: match_sds_semantic
-- Purpose: Find SDs semantically similar to query embedding
--
-- Parameters:
--   query_embedding: vector(1536) - The embedding to search for
--   match_threshold: float - Minimum similarity score (0-1, default 0.7)
--   match_count: int - Maximum number of results to return (default 10)
--   status_filter: text[] - Filter by SD status (default all active statuses)
--
-- Returns: Table with SD details and similarity scores
--
-- Usage:
--   SELECT * FROM match_sds_semantic(
--     query_embedding := '[0.1, 0.2, ...]'::vector(1536),
--     match_threshold := 0.75,
--     match_count := 5,
--     status_filter := ARRAY['PLAN_PRD', 'PLAN_VERIFY', 'EXEC_IMPL']
--   );

CREATE OR REPLACE FUNCTION match_sds_semantic(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  status_filter text[] DEFAULT ARRAY['PLAN_PRD', 'PLAN_VERIFY', 'EXEC_IMPL', 'EXEC_TEST', 'LEAD_FINAL']
)
RETURNS TABLE (
  id uuid,
  sd_id varchar(100),
  title varchar(255),
  scope text,
  status varchar(50),
  priority integer,
  similarity float,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sd.id,
    sd.sd_id,
    sd.title,
    sd.scope,
    sd.status,
    sd.priority,
    -- Calculate cosine similarity (1 - cosine distance)
    1 - (sd.scope_embedding <=> query_embedding) AS similarity,
    sd.created_at
  FROM strategic_directives_v2 sd
  WHERE
    sd.scope_embedding IS NOT NULL
    AND sd.status = ANY(status_filter)
    -- Filter by similarity threshold
    AND 1 - (sd.scope_embedding <=> query_embedding) >= match_threshold
  ORDER BY
    -- Sort by similarity (highest first)
    sd.scope_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- Duplicate Detection Function
-- ============================================================================

-- Function: find_similar_sds
-- Purpose: Find potentially duplicate or similar SDs for VALIDATION sub-agent
--
-- Parameters:
--   query_embedding: vector(1536) - The embedding of the proposed SD
--   exclude_sd_id: uuid - Exclude this SD from results (usually the current SD)
--   similarity_threshold: float - Minimum similarity (0-1, default 0.8 for high similarity)
--   limit_count: int - Maximum results (default 5)
--
-- Returns: Table with similar SDs that may be duplicates
--
-- Usage:
--   SELECT * FROM find_similar_sds(
--     query_embedding := '[0.1, 0.2, ...]'::vector(1536),
--     exclude_sd_id := 'abc-123-def'::uuid,
--     similarity_threshold := 0.85
--   );

CREATE OR REPLACE FUNCTION find_similar_sds(
  query_embedding vector(1536),
  exclude_sd_id uuid DEFAULT NULL,
  similarity_threshold float DEFAULT 0.8,
  limit_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  sd_id varchar(100),
  title varchar(255),
  scope text,
  status varchar(50),
  similarity float,
  is_potential_duplicate boolean
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sd.id,
    sd.sd_id,
    sd.title,
    sd.scope,
    sd.status,
    -- Calculate cosine similarity
    1 - (sd.scope_embedding <=> query_embedding) AS similarity,
    -- Flag as potential duplicate if similarity >= 0.9 (very high)
    (1 - (sd.scope_embedding <=> query_embedding)) >= 0.9 AS is_potential_duplicate
  FROM strategic_directives_v2 sd
  WHERE
    sd.scope_embedding IS NOT NULL
    -- Exclude the query SD itself
    AND (exclude_sd_id IS NULL OR sd.id != exclude_sd_id)
    -- Filter by similarity threshold
    AND 1 - (sd.scope_embedding <=> query_embedding) >= similarity_threshold
    -- Only check active/in-progress SDs
    AND sd.status NOT IN ('ARCHIVED', 'CANCELLED', 'REJECTED')
  ORDER BY
    sd.scope_embedding <=> query_embedding
  LIMIT limit_count;
END;
$$;

-- ============================================================================
-- Batch Embedding Update Function
-- ============================================================================

-- Function: update_sd_embedding
-- Purpose: Helper function to update a single SD's embedding
--
-- Used by scripts/generate-sd-embeddings.js for batch processing
--
-- Parameters:
--   target_sd_id: uuid - The SD to update
--   new_embedding: vector(1536) - The embedding vector
--
-- Returns: boolean - True if update succeeded

CREATE OR REPLACE FUNCTION update_sd_embedding(
  target_sd_id uuid,
  new_embedding vector(1536)
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE strategic_directives_v2
  SET
    scope_embedding = new_embedding,
    embedding_generated_at = NOW(),
    embedding_model = 'text-embedding-3-small',
    updated_at = NOW()
  WHERE id = target_sd_id;

  RETURN FOUND;
END;
$$;

-- ============================================================================
-- Comments and Documentation
-- ============================================================================

COMMENT ON COLUMN strategic_directives_v2.scope_embedding IS
  'OpenAI embedding (text-embedding-3-small, 1536 dimensions) of SD title, scope, description, and context. Used for semantic similarity matching and duplicate detection.';

COMMENT ON COLUMN strategic_directives_v2.embedding_generated_at IS
  'Timestamp when the embedding was last generated. Used to track staleness and trigger regeneration.';

COMMENT ON COLUMN strategic_directives_v2.embedding_model IS
  'OpenAI model used to generate the embedding. Default: text-embedding-3-small';

COMMENT ON FUNCTION match_sds_semantic IS
  'Semantic search: Find SDs similar to query embedding using cosine similarity. Used for context-aware sub-agent selection and similar SD discovery.';

COMMENT ON FUNCTION find_similar_sds IS
  'Duplicate detection: Find SDs with high similarity to query embedding. Used by VALIDATION sub-agent to prevent duplicate work.';

COMMENT ON FUNCTION update_sd_embedding IS
  'Helper function: Update a single SD embedding with metadata. Used by batch embedding generation scripts.';

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Run these queries after migration to verify success:

-- 1. Check columns were added
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'strategic_directives_v2'
-- AND column_name IN ('scope_embedding', 'embedding_generated_at', 'embedding_model');

-- 2. Check index was created
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'strategic_directives_v2'
-- AND indexname = 'idx_strategic_directives_v2_embedding';

-- 3. Check functions were created
-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_name IN ('match_sds_semantic', 'find_similar_sds', 'update_sd_embedding');

-- 4. Verify current SDs are ready for embeddings
-- SELECT status, COUNT(*) as total,
--   SUM(CASE WHEN scope_embedding IS NULL THEN 1 ELSE 0 END) as missing_embeddings
-- FROM strategic_directives_v2
-- WHERE status NOT IN ('ARCHIVED', 'CANCELLED')
-- GROUP BY status
-- ORDER BY status;

-- 5. Test semantic search (after embeddings generated)
-- SELECT sd_id, title, similarity
-- FROM match_sds_semantic(
--   (SELECT scope_embedding FROM strategic_directives_v2 WHERE sd_id = 'SD-TEST-001'),
--   0.7,
--   5
-- );

-- ============================================================================
-- Rollback Instructions
-- ============================================================================

-- To rollback this migration:
-- DROP FUNCTION IF EXISTS update_sd_embedding;
-- DROP FUNCTION IF EXISTS find_similar_sds;
-- DROP FUNCTION IF EXISTS match_sds_semantic;
-- DROP INDEX IF EXISTS idx_strategic_directives_v2_embedding;
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS scope_embedding;
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS embedding_generated_at;
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS embedding_model;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Next Steps:
-- 1. Run scripts/generate-sd-embeddings.js to populate embeddings for existing SDs
-- 2. Verify embeddings with: SELECT COUNT(*) FROM strategic_directives_v2 WHERE scope_embedding IS NOT NULL;
-- 3. Test semantic search with match_sds_semantic()
-- 4. Test duplicate detection with find_similar_sds()
-- 5. Monitor orchestrator logs for hybrid matching results
