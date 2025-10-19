-- ============================================================================
-- Semantic Code Search RPC Function
-- Feature: Cosine similarity search for code entities using vector embeddings
-- SD: SD-SEMANTIC-SEARCH-001
-- User Story: US-001 - Natural Language Code Search
-- Date: 2025-10-19
-- ============================================================================

CREATE OR REPLACE FUNCTION semantic_code_search(
  query_embedding vector(1536),
  application_filter TEXT DEFAULT NULL,
  entity_type_filter TEXT DEFAULT NULL,
  language_filter TEXT DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  file_path TEXT,
  entity_type TEXT,
  entity_name TEXT,
  code_snippet TEXT,
  semantic_description TEXT,
  line_start INTEGER,
  line_end INTEGER,
  language TEXT,
  application TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    csi.id,
    csi.file_path,
    csi.entity_type,
    csi.entity_name,
    csi.code_snippet,
    csi.semantic_description,
    csi.line_start,
    csi.line_end,
    csi.language,
    csi.application,
    1 - (csi.embedding <=> query_embedding) as similarity
  FROM codebase_semantic_index csi
  WHERE
    (application_filter IS NULL OR csi.application = application_filter)
    AND (entity_type_filter IS NULL OR csi.entity_type = entity_type_filter)
    AND (language_filter IS NULL OR csi.language = language_filter)
    AND (1 - (csi.embedding <=> query_embedding)) >= match_threshold
  ORDER BY csi.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION semantic_code_search TO authenticated;

-- ============================================================================
-- VERIFICATION QUERY (run manually to test function)
-- ============================================================================

-- Test query (requires embeddings to be populated first):
-- SELECT * FROM semantic_code_search(
--   query_embedding := '[0.1, 0.2, ..., 0.9]'::vector(1536),
--   application_filter := 'ehg_engineer',
--   entity_type_filter := 'function',
--   match_threshold := 0.7,
--   match_count := 5
-- );

-- ============================================================================
-- USAGE NOTES
-- ============================================================================

-- The function uses cosine distance operator (<=>):
-- - Returns distance between 0 and 2 (0 = identical, 2 = opposite)
-- - Similarity = 1 - distance (range: 0 to 1, higher = more similar)
-- - Match threshold of 0.7 means ≥70% similarity required

-- Performance:
-- - ivfflat index automatically used for vector search
-- - Filters applied BEFORE vector search for optimal performance
-- - Results sorted by similarity (most similar first)

COMMENT ON FUNCTION semantic_code_search IS 'Search code entities using natural language vector embeddings. Returns top K most similar entities based on cosine similarity threshold.';
