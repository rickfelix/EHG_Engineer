-- ============================================================================
-- Create Codebase Semantic Index Table with pgvector Support
-- Feature: Semantic code search using OpenAI embeddings
-- SD: SD-SEMANTIC-SEARCH-001
-- User Story: US-001 - Natural Language Code Search
-- Date: 2025-10-19
-- ============================================================================

-- Ensure pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- STEP 1: Create codebase_semantic_index table
-- ============================================================================

CREATE TABLE IF NOT EXISTS codebase_semantic_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Code entity identification
  file_path TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('function', 'class', 'component', 'interface', 'type', 'utility', 'module')),
  entity_name TEXT NOT NULL,

  -- Code context
  code_snippet TEXT NOT NULL,
  semantic_description TEXT NOT NULL,

  -- Vector embedding (OpenAI text-embedding-3-small: 1536 dimensions)
  embedding vector(1536) NOT NULL,

  -- Metadata
  line_start INTEGER,
  line_end INTEGER,
  language TEXT NOT NULL CHECK (language IN ('typescript', 'javascript', 'tsx', 'jsx', 'sql', 'json')),

  -- Application context
  application TEXT NOT NULL CHECK (application IN ('ehg', 'ehg_engineer')),

  -- Indexing metadata
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(file_path, entity_name, entity_type)
);

-- ============================================================================
-- STEP 2: Create indexes
-- ============================================================================

-- Vector similarity index (ivfflat for cosine similarity)
-- Lists parameter set to sqrt(total_rows), adjust after data population
CREATE INDEX idx_codebase_semantic_embedding
  ON codebase_semantic_index
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Supporting indexes for filtering
CREATE INDEX idx_codebase_semantic_entity_type
  ON codebase_semantic_index(entity_type);

CREATE INDEX idx_codebase_semantic_application
  ON codebase_semantic_index(application);

CREATE INDEX idx_codebase_semantic_language
  ON codebase_semantic_index(language);

CREATE INDEX idx_codebase_semantic_file_path
  ON codebase_semantic_index(file_path);

-- Composite index for common query patterns
CREATE INDEX idx_codebase_semantic_app_type
  ON codebase_semantic_index(application, entity_type);

-- ============================================================================
-- STEP 3: Add RLS policies
-- ============================================================================

ALTER TABLE codebase_semantic_index ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read semantic index
CREATE POLICY "Allow authenticated read access to semantic index"
  ON codebase_semantic_index
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role to manage semantic index (for indexing scripts)
CREATE POLICY "Allow service role full access to semantic index"
  ON codebase_semantic_index
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- STEP 4: Create helper views
-- ============================================================================

-- View for entity statistics
CREATE OR REPLACE VIEW codebase_semantic_stats AS
SELECT
  application,
  entity_type,
  language,
  COUNT(*) as entity_count,
  MAX(last_updated) as latest_update
FROM codebase_semantic_index
GROUP BY application, entity_type, language
ORDER BY application, entity_type;

-- ============================================================================
-- STEP 5: Create update trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_semantic_index_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_semantic_index_timestamp
  BEFORE UPDATE ON codebase_semantic_index
  FOR EACH ROW
  EXECUTE FUNCTION update_semantic_index_timestamp();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ CODEBASE SEMANTIC INDEX CREATED SUCCESSFULLY';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Table: codebase_semantic_index';
  RAISE NOTICE 'Extension: pgvector (1536-dimensional vectors)';
  RAISE NOTICE 'Indexes: 6 indexes (1 ivfflat vector, 5 supporting)';
  RAISE NOTICE 'RLS: Enabled (authenticated read, service_role full access)';
  RAISE NOTICE 'Views: codebase_semantic_stats';
  RAISE NOTICE 'Triggers: update_semantic_index_timestamp';
  RAISE NOTICE '';
  RAISE NOTICE 'Ready for semantic code search! 🚀';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================================================

-- To remove the semantic index:
-- DROP TABLE IF EXISTS codebase_semantic_index CASCADE;
-- DROP VIEW IF EXISTS codebase_semantic_stats;
-- DROP FUNCTION IF EXISTS update_semantic_index_timestamp() CASCADE;
