-- Migration: Operation 'GOVERNED ENGINE' v5.1.0
-- Purpose: Venture-scoped agent memory search
-- Created: 2025-12-21
--
-- Components:
-- 1. PARTITION AGENT MEMORY - Semantic search with venture_id filter

-- =============================================================================
-- TASK 1: PARTITION AGENT MEMORY - Semantic Search with Venture Filter
-- =============================================================================

-- Ensure venture_id NOT NULL for new records (existing records grandfathered)
-- INDUSTRIAL-HARDENING-v2.9.0 already added the column, now enforce it

-- Create semantic search function for agent memory WITH venture_id filter
CREATE OR REPLACE FUNCTION match_agent_memory(
  p_query_embedding vector(1536),
  p_venture_id UUID,                           -- MANDATORY: No global searches
  p_agent_id UUID DEFAULT NULL,                -- Optional: Filter to specific agent
  p_memory_type VARCHAR(50) DEFAULT NULL,      -- Optional: 'context', 'decisions', 'learnings', 'preferences'
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  agent_id UUID,
  venture_id UUID,
  memory_type VARCHAR(50),
  content JSONB,
  summary TEXT,
  similarity FLOAT,
  importance_score FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- GOVERNANCE: venture_id is MANDATORY - no global memory reads
  IF p_venture_id IS NULL THEN
    RAISE EXCEPTION 'GOVERNANCE VIOLATION: venture_id is MANDATORY for memory search (GOVERNED-ENGINE-v5.1.0)';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.agent_id,
    m.venture_id,
    m.memory_type,
    m.content,
    m.summary,
    (1 - (m.embedding <=> p_query_embedding))::FLOAT AS similarity,
    m.importance_score,
    m.created_at
  FROM agent_memory_stores m
  WHERE
    -- MANDATORY: Venture isolation
    m.venture_id = p_venture_id
    -- Optional: Agent filter
    AND (p_agent_id IS NULL OR m.agent_id = p_agent_id)
    -- Optional: Memory type filter
    AND (p_memory_type IS NULL OR m.memory_type = p_memory_type)
    -- Only current versions
    AND m.is_current = TRUE
    -- Must have embedding
    AND m.embedding IS NOT NULL
    -- Similarity threshold
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_match_threshold
  ORDER BY similarity DESC
  LIMIT p_match_count;
END;
$$;

-- Grant execute to service_role
GRANT EXECUTE ON FUNCTION match_agent_memory TO service_role;

COMMENT ON FUNCTION match_agent_memory IS
'GOVERNED-ENGINE-v5.1.0: Venture-scoped semantic search for agent memory.
THE LAW: venture_id is MANDATORY - no global memory reads allowed.
Replaces unscoped semantic search to prevent cross-venture memory contamination.';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'GOVERNED-ENGINE-v5.1.0 Migration Complete';
  RAISE NOTICE '1. match_agent_memory() - Venture-scoped semantic search';
END $$;
