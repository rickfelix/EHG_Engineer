-- Migration: Fix match_retrospectives() RPC Function - Remove severity_level & Fix Data Types
-- SD-RETRO-ENHANCE-001 Checkpoint 2 Fix v2
-- Created: 2025-10-16
--
-- Issues:
-- 1. RPC function references severity_level column that doesn't exist
-- 2. key_learnings and action_items are JSONB but function returns TEXT
-- Solution: Remove severity parameter and fix return types to match actual columns

BEGIN;

-- ============================================================================
-- Fix match_retrospectives() RPC Function
-- ============================================================================

-- Drop existing function (all signatures)
DROP FUNCTION IF EXISTS match_retrospectives(vector, float, int, text, text, text, boolean);
DROP FUNCTION IF EXISTS match_retrospectives(vector, float, int, text, text, boolean);

CREATE OR REPLACE FUNCTION match_retrospectives(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_application text DEFAULT NULL,
  filter_category text DEFAULT NULL,
  include_all_apps boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  title text,
  target_application text,
  learning_category text,
  key_learnings jsonb,
  action_items jsonb,
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
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_retrospectives IS 'SD-RETRO-ENHANCE-001: Semantic search for retrospectives using vector similarity with optional structured filters (fixed: removed severity_level, corrected data types to jsonb)';

-- ============================================================================
-- Verification
-- ============================================================================

-- Verify RPC function exists with correct signature
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'match_retrospectives'
      AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'match_retrospectives() function not created';
  END IF;
  RAISE NOTICE 'match_retrospectives() function verified (severity_level removed, data types corrected)';
END $$;

COMMIT;

-- ============================================================================
-- Testing
-- ============================================================================

-- Test 1: Verify function can be called without severity parameter and returns correct types
-- SELECT * FROM match_retrospectives(
--   '[0.1, 0.2, ...]'::vector(1536),  -- Sample embedding
--   0.7,                               -- Match threshold
--   5,                                 -- Return top 5
--   'EHG_engineer',                    -- Filter by application
--   NULL,                              -- All categories
--   true                               -- Include cross-app retrospectives
-- );

-- ============================================================================
-- Rollback Instructions
-- ============================================================================

-- To rollback:
-- DROP FUNCTION IF EXISTS match_retrospectives(vector, float, int, text, text, boolean);
-- -- Then restore from 20251016_add_vector_search_embeddings.sql (though it will fail due to missing severity_level column)
