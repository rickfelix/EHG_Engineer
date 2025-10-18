-- Migration: Component Registry with Semantic Search Embeddings
-- Created: 2025-10-18
-- Purpose: Enable AI-powered component recommendations with explainable confidence scores
--
-- Features:
-- 1. Store shadcn/ui + third-party registry components with metadata
-- 2. OpenAI text-embedding-3-small (1536d) for semantic similarity search
-- 3. IVFFlat index for efficient vector similarity queries
-- 4. Explainability metadata (use cases, alternatives, warnings)
--
-- Usage: Queried during PRD creation to recommend UI components based on SD description

BEGIN;

-- ============================================================================
-- Enable pgvector extension (if not already enabled)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Component Registry Table with Embeddings
-- ============================================================================

CREATE TABLE IF NOT EXISTS component_registry_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Component Identity
  component_name TEXT NOT NULL,
  component_category TEXT NOT NULL CHECK (component_category IN ('ui', 'ai', 'voice', 'extended', 'blocks')),
  registry_source TEXT NOT NULL CHECK (registry_source IN ('shadcn-ui', 'ai-elements', 'openai-voice', 'kibo-ui', 'blocks-so', 'reui')),

  -- Component Metadata
  description TEXT NOT NULL,
  use_cases JSONB DEFAULT '[]'::jsonb,
  trigger_keywords TEXT[] DEFAULT '{}',

  -- Installation
  install_command TEXT NOT NULL,
  dependencies JSONB DEFAULT '[]'::jsonb,
  registry_dependencies JSONB DEFAULT '[]'::jsonb,

  -- Documentation
  docs_url TEXT,
  implementation_notes TEXT,
  example_code TEXT,

  -- Explainability Metadata (NEW)
  primary_use_case TEXT,              -- Main use case for matching explanation
  bundle_size_kb INTEGER DEFAULT 0,    -- For bundle size warnings
  common_alternatives JSONB DEFAULT '[]'::jsonb, -- Alternative component suggestions

  -- Semantic Search
  description_embedding vector(1536),  -- OpenAI text-embedding-3-small

  -- Scoring
  confidence_weight FLOAT DEFAULT 1.0 CHECK (confidence_weight >= 0.5 AND confidence_weight <= 2.0),

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(component_name, registry_source)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- IVFFlat index for fast vector similarity search (cosine distance)
CREATE INDEX idx_component_embeddings_vector
ON component_registry_embeddings USING ivfflat (description_embedding vector_cosine_ops)
WITH (lists = 10);

-- Indexes for filtering
CREATE INDEX idx_component_category ON component_registry_embeddings(component_category);
CREATE INDEX idx_component_registry ON component_registry_embeddings(registry_source);
CREATE INDEX idx_component_name ON component_registry_embeddings(component_name);

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE component_registry_embeddings IS 'Component registry with semantic search embeddings for AI-powered recommendations during PRD creation';
COMMENT ON COLUMN component_registry_embeddings.description IS 'Human-readable description used for semantic matching and explanation generation';
COMMENT ON COLUMN component_registry_embeddings.description_embedding IS 'OpenAI text-embedding-3-small (1536 dimensions) for semantic similarity search via pgvector';
COMMENT ON COLUMN component_registry_embeddings.primary_use_case IS 'Main use case for explainability (shown in "Why recommended" reasoning)';
COMMENT ON COLUMN component_registry_embeddings.bundle_size_kb IS 'Approximate bundle size impact (used for warning generation)';
COMMENT ON COLUMN component_registry_embeddings.common_alternatives IS 'Alternative components with tradeoffs (e.g., lighter/heavier versions)';
COMMENT ON COLUMN component_registry_embeddings.confidence_weight IS 'Popularity multiplier (1.0 = neutral, >1.0 = boost popular components, <1.0 = less popular)';

-- ============================================================================
-- RPC Function: match_components_semantic()
-- ============================================================================

CREATE OR REPLACE FUNCTION match_components_semantic(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.65,
  match_count int DEFAULT 10,
  filter_category text DEFAULT NULL,
  filter_registry text DEFAULT NULL
)
RETURNS TABLE (
  component_name text,
  registry_source text,
  description text,
  primary_use_case text,
  install_command text,
  dependencies jsonb,
  registry_dependencies jsonb,
  docs_url text,
  implementation_notes text,
  trigger_keywords text[],
  common_alternatives jsonb,
  bundle_size_kb integer,
  similarity float,
  confidence_score float,
  confidence_weight float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.component_name,
    c.registry_source,
    c.description,
    c.primary_use_case,
    c.install_command,
    c.dependencies,
    c.registry_dependencies,
    c.docs_url,
    c.implementation_notes,
    c.trigger_keywords,
    c.common_alternatives,
    c.bundle_size_kb,
    -- Calculate cosine similarity (1 - distance)
    1 - (c.description_embedding <=> query_embedding) AS similarity,
    -- Confidence score = similarity * confidence_weight (boost popular components)
    (1 - (c.description_embedding <=> query_embedding)) * c.confidence_weight AS confidence_score,
    c.confidence_weight
  FROM component_registry_embeddings c
  WHERE
    c.description_embedding IS NOT NULL
    AND (1 - (c.description_embedding <=> query_embedding)) >= match_threshold
    AND (filter_category IS NULL OR c.component_category = filter_category)
    AND (filter_registry IS NULL OR c.registry_source = filter_registry)
  ORDER BY confidence_score DESC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_components_semantic IS 'Semantic search for UI components using vector similarity. Returns components ranked by confidence score (similarity * popularity weight) with explainability metadata.';

-- ============================================================================
-- Update Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_component_embeddings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_component_embeddings_updated_at
BEFORE UPDATE ON component_registry_embeddings
FOR EACH ROW
EXECUTE FUNCTION update_component_embeddings_timestamp();

COMMIT;
