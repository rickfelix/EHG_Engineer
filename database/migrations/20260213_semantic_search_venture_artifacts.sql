-- Migration: Add semantic search infrastructure for venture_artifacts
-- SD: SD-EVA-FEAT-SEMANTIC-SEARCH-001
-- Phase 1: Database & RPC groundwork
--
-- Prerequisites: pgvector extension already enabled (from 20251016 migration)
--
-- Column mapping verified against live schema (2026-02-13):
--   venture_artifacts: content (not output), quality_score, artifact_type
--   issue_patterns: pattern_id (not pattern_key), issue_summary (not description),
--                   occurrence_count (not frequency), NO content_embedding column
--   retrospectives: key_learnings is jsonb (cast to text for trgm)

-- 1. Add artifact_embedding column to venture_artifacts
ALTER TABLE venture_artifacts
  ADD COLUMN IF NOT EXISTS artifact_embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_model text DEFAULT 'text-embedding-3-small',
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS indexing_status text DEFAULT 'pending'
    CHECK (indexing_status IN ('pending', 'indexed', 'failed', 'skipped'));

-- 2. Add content_embedding column to issue_patterns (does not exist yet)
ALTER TABLE issue_patterns
  ADD COLUMN IF NOT EXISTS content_embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

-- 3. Create IVFFlat index for cosine similarity search on venture_artifacts
-- Note: IVFFlat requires >= lists rows to build. With only ~5 rows currently,
-- we use lists=1. Rebuild with higher lists when row count grows past 1000:
--   DROP INDEX idx_venture_artifacts_embedding_ivfflat;
--   CREATE INDEX ... WITH (lists = sqrt(row_count));
CREATE INDEX IF NOT EXISTS idx_venture_artifacts_embedding_ivfflat
  ON venture_artifacts
  USING ivfflat (artifact_embedding vector_cosine_ops)
  WITH (lists = 1);

-- 4. Create GIN index for pg_trgm fallback text search on venture_artifacts.content
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_venture_artifacts_content_trgm
  ON venture_artifacts
  USING gin (content gin_trgm_ops);

-- 5. Create GIN index on issue_patterns for keyword fallback (issue_summary column)
CREATE INDEX IF NOT EXISTS idx_issue_patterns_summary_trgm
  ON issue_patterns
  USING gin (issue_summary gin_trgm_ops);

-- 6. RPC: match_venture_artifacts (follows match_retrospectives pattern)
-- Uses: content (not output), artifact_type, quality_score
CREATE OR REPLACE FUNCTION match_venture_artifacts(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_venture_id uuid DEFAULT NULL,
  filter_artifact_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  venture_id uuid,
  artifact_type text,
  content text,
  quality_score int,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    va.id,
    va.venture_id,
    va.artifact_type::text,
    va.content,
    va.quality_score,
    va.created_at,
    va.updated_at,
    (1 - (va.artifact_embedding <=> query_embedding))::float AS similarity
  FROM venture_artifacts va
  WHERE
    va.artifact_embedding IS NOT NULL
    AND (1 - (va.artifact_embedding <=> query_embedding)) >= match_threshold
    AND (filter_venture_id IS NULL OR va.venture_id = filter_venture_id)
    AND (filter_artifact_type IS NULL OR va.artifact_type::text = filter_artifact_type)
  ORDER BY similarity DESC, va.updated_at DESC, va.id ASC
  LIMIT match_count;
END;
$$;

-- 7. RPC: match_issue_patterns (semantic search across issue_patterns)
-- Uses: pattern_id (not pattern_key), issue_summary (not description),
--        occurrence_count (not frequency), content_embedding (added in step 2)
CREATE OR REPLACE FUNCTION match_issue_patterns(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_category text DEFAULT NULL,
  filter_severity text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  pattern_id text,
  issue_summary text,
  category text,
  severity text,
  occurrence_count int,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    ip.id,
    ip.pattern_id::text,
    ip.issue_summary,
    ip.category::text,
    ip.severity::text,
    ip.occurrence_count,
    ip.created_at,
    (1 - (ip.content_embedding <=> query_embedding))::float AS similarity
  FROM issue_patterns ip
  WHERE
    ip.content_embedding IS NOT NULL
    AND (1 - (ip.content_embedding <=> query_embedding)) >= match_threshold
    AND (filter_category IS NULL OR ip.category::text = filter_category)
    AND (filter_severity IS NULL OR ip.severity::text = filter_severity)
  ORDER BY similarity DESC, ip.created_at DESC, ip.id ASC
  LIMIT match_count;
END;
$$;

-- 8. RPC: keyword_search_fallback (BM25-like text search using pg_trgm)
-- Uses correct column names:
--   venture_artifacts.content, issue_patterns.issue_summary,
--   retrospectives.key_learnings (jsonb, cast to text)
CREATE OR REPLACE FUNCTION keyword_search_fallback(
  search_query text,
  target_tables text[] DEFAULT ARRAY['venture_artifacts', 'issue_patterns', 'retrospectives'],
  match_count int DEFAULT 10
)
RETURNS TABLE (
  source_table text,
  record_id uuid,
  content_preview text,
  similarity_score float
)
LANGUAGE plpgsql AS $$
BEGIN
  -- Search venture_artifacts (content column)
  IF 'venture_artifacts' = ANY(target_tables) THEN
    RETURN QUERY
    SELECT
      'venture_artifacts'::text AS source_table,
      va.id AS record_id,
      left(va.content, 200) AS content_preview,
      similarity(va.content, search_query)::float AS similarity_score
    FROM venture_artifacts va
    WHERE va.content IS NOT NULL
      AND va.content != ''
      AND similarity(va.content, search_query) > 0.1
    ORDER BY similarity_score DESC
    LIMIT match_count;
  END IF;

  -- Search issue_patterns (issue_summary column)
  IF 'issue_patterns' = ANY(target_tables) THEN
    RETURN QUERY
    SELECT
      'issue_patterns'::text AS source_table,
      ip.id AS record_id,
      left(ip.issue_summary, 200) AS content_preview,
      similarity(ip.issue_summary, search_query)::float AS similarity_score
    FROM issue_patterns ip
    WHERE ip.issue_summary IS NOT NULL
      AND ip.issue_summary != ''
      AND similarity(ip.issue_summary, search_query) > 0.1
    ORDER BY similarity_score DESC
    LIMIT match_count;
  END IF;

  -- Search retrospectives (key_learnings is jsonb, cast to text)
  IF 'retrospectives' = ANY(target_tables) THEN
    RETURN QUERY
    SELECT
      'retrospectives'::text AS source_table,
      r.id AS record_id,
      left(r.key_learnings::text, 200) AS content_preview,
      similarity(r.key_learnings::text, search_query)::float AS similarity_score
    FROM retrospectives r
    WHERE r.key_learnings IS NOT NULL
      AND r.key_learnings::text != ''
      AND r.key_learnings::text != 'null'
      AND similarity(r.key_learnings::text, search_query) > 0.1
    ORDER BY similarity_score DESC
    LIMIT match_count;
  END IF;
END;
$$;

-- 9. Add comments for documentation
COMMENT ON COLUMN venture_artifacts.artifact_embedding IS 'pgvector embedding (1536-dim, text-embedding-3-small) for semantic search';
COMMENT ON COLUMN venture_artifacts.indexing_status IS 'Embedding indexing status: pending, indexed, failed, skipped';
COMMENT ON COLUMN issue_patterns.content_embedding IS 'pgvector embedding (1536-dim) for semantic search across issue patterns';
COMMENT ON FUNCTION match_venture_artifacts IS 'Vector similarity search for venture artifacts (SD-EVA-FEAT-SEMANTIC-SEARCH-001)';
COMMENT ON FUNCTION match_issue_patterns IS 'Vector similarity search for issue patterns (SD-EVA-FEAT-SEMANTIC-SEARCH-001)';
COMMENT ON FUNCTION keyword_search_fallback IS 'BM25-like keyword fallback using pg_trgm (SD-EVA-FEAT-SEMANTIC-SEARCH-001)';
