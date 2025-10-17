-- Migration: Add Vector Search with OpenAI Embeddings
-- SD-RETRO-ENHANCE-001 Checkpoint 2: Semantic Search Infrastructure
-- User Stories: US-004, US-005
-- Created: 2025-10-16
--
-- Purpose: Add semantic search capability to retrospectives table using:
-- 1. pgvector extension for vector storage and similarity search
-- 2. OpenAI text-embedding-3-small (1536 dimensions)
-- 3. IVFFlat index for efficient vector similarity queries
--
-- Dependencies: Checkpoint 1 must be deployed first (requires target_application, learning_category fields)

BEGIN;

-- ============================================================================
-- US-004: Generate Embeddings for Semantic Search
-- ============================================================================

-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add content_embedding column for storing OpenAI embeddings
ALTER TABLE retrospectives
ADD COLUMN content_embedding vector(1536);

COMMENT ON COLUMN retrospectives.content_embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions) for semantic search. Generated from title + key_learnings + action_items.';

-- ============================================================================
-- US-005: Vector Similarity Search with IVFFlat Index
-- ============================================================================

-- Create IVFFlat index for efficient vector similarity search
-- Lists parameter: sqrt(total_rows) = sqrt(100) ≈ 10 (will grow to ~100 as we add more retrospectives)
-- Using cosine distance operator for similarity (1 - distance = similarity score)
CREATE INDEX idx_retrospectives_content_embedding_ivfflat
ON retrospectives USING ivfflat (content_embedding vector_cosine_ops)
WITH (lists = 10);

COMMENT ON INDEX idx_retrospectives_content_embedding_ivfflat IS 'IVFFlat index for fast vector similarity search using cosine distance. Lists=10 optimized for ~100 retrospectives.';

-- ============================================================================
-- Create RPC Function: match_retrospectives()
-- ============================================================================

-- RPC function for semantic search with structured filters
-- Returns retrospectives ranked by semantic similarity, filtered by application/category/severity
CREATE OR REPLACE FUNCTION match_retrospectives(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_application text DEFAULT NULL,
  filter_category text DEFAULT NULL,
  filter_severity text DEFAULT NULL,
  include_all_apps boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  title text,
  target_application text,
  learning_category text,
  severity_level text,
  key_learnings text,
  action_items text,
  applies_to_all_apps boolean,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.target_application,
    r.learning_category,
    r.severity_level,
    r.key_learnings,
    r.action_items,
    r.applies_to_all_apps,
    -- Calculate cosine similarity (1 - distance)
    1 - (r.content_embedding <=> query_embedding) AS similarity
  FROM retrospectives r
  WHERE
    -- Only include retrospectives with embeddings
    r.content_embedding IS NOT NULL
    -- Semantic similarity threshold
    AND (1 - (r.content_embedding <=> query_embedding)) >= match_threshold
    -- Application filter (optional)
    AND (filter_application IS NULL
         OR r.target_application = filter_application
         OR (include_all_apps AND r.applies_to_all_apps = true))
    -- Category filter (optional)
    AND (filter_category IS NULL OR r.learning_category = filter_category)
    -- Severity filter (optional)
    AND (filter_severity IS NULL OR r.severity_level = filter_severity)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_retrospectives IS 'SD-RETRO-ENHANCE-001: Semantic search for retrospectives using vector similarity with optional structured filters';

-- ============================================================================
-- Create Helper Function: get_retrospective_embedding_stats()
-- ============================================================================

-- Statistics function to monitor embedding coverage
CREATE OR REPLACE FUNCTION get_retrospective_embedding_stats()
RETURNS TABLE (
  total_retrospectives bigint,
  with_embeddings bigint,
  without_embeddings bigint,
  embedding_coverage_percent numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) AS total_retrospectives,
    COUNT(content_embedding) AS with_embeddings,
    COUNT(*) - COUNT(content_embedding) AS without_embeddings,
    ROUND((COUNT(content_embedding)::numeric / COUNT(*)) * 100, 2) AS embedding_coverage_percent
  FROM retrospectives;
END;
$$;

COMMENT ON FUNCTION get_retrospective_embedding_stats IS 'Monitor embedding coverage for retrospectives. Target: 100% coverage for PUBLISHED status.';

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify pgvector extension is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    RAISE EXCEPTION 'pgvector extension not enabled';
  END IF;
  RAISE NOTICE 'pgvector extension verified';
END $$;

-- Verify content_embedding column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'retrospectives'
      AND column_name = 'content_embedding'
  ) THEN
    RAISE EXCEPTION 'content_embedding column not created';
  END IF;
  RAISE NOTICE 'content_embedding column verified';
END $$;

-- Verify IVFFlat index exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE tablename = 'retrospectives'
      AND indexname = 'idx_retrospectives_content_embedding_ivfflat'
  ) THEN
    RAISE EXCEPTION 'IVFFlat index not created';
  END IF;
  RAISE NOTICE 'IVFFlat index verified';
END $$;

-- Verify RPC function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'match_retrospectives'
  ) THEN
    RAISE EXCEPTION 'match_retrospectives() RPC function not created';
  END IF;
  RAISE NOTICE 'match_retrospectives() RPC function verified';
END $$;

COMMIT;

-- ============================================================================
-- Post-Migration Testing
-- ============================================================================

-- Test 1: Verify embedding stats (should show 0% coverage initially)
-- SELECT * FROM get_retrospective_embedding_stats();

-- Test 2: Sample embedding generation and search
-- (Requires running generate-retrospective-embeddings.js script first)
-- SELECT * FROM match_retrospectives(
--   '[0.1, 0.2, ...]'::vector,  -- Sample embedding
--   0.7,                         -- Match threshold
--   5,                           -- Return top 5
--   'EHG_engineer',              -- Filter by application
--   NULL,                        -- All categories
--   NULL,                        -- All severities
--   true                         -- Include cross-app retrospectives
-- );

-- ============================================================================
-- Next Steps
-- ============================================================================

-- 1. Run generate-retrospective-embeddings.js to populate embeddings for all PUBLISHED retrospectives
-- 2. Test match_retrospectives() with sample queries
-- 3. Measure search quality (relevance, precision@5)
-- 4. Tune IVFFlat lists parameter if needed (sqrt(total_rows) rule of thumb)
-- 5. Integrate with automated-knowledge-retrieval.js (US-008)

-- ============================================================================
-- Rollback Instructions
-- ============================================================================

-- DROP FUNCTION IF EXISTS get_retrospective_embedding_stats();
-- DROP FUNCTION IF EXISTS match_retrospectives(vector, float, int, text, text, text, boolean);
-- DROP INDEX IF EXISTS idx_retrospectives_content_embedding_ivfflat;
-- ALTER TABLE retrospectives DROP COLUMN IF EXISTS content_embedding;
-- DROP EXTENSION IF EXISTS vector CASCADE;
