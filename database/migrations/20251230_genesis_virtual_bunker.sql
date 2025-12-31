-- Migration: Genesis Virtual Bunker Tables
-- Date: 2025-12-30
-- Source: docs/vision/GENESIS_VIRTUAL_BUNKER_ADDENDUM.md
-- Purpose: Create tables for Genesis virtual simulation system

-- =====================================================
-- Table: simulation_sessions
-- Purpose: Tracks simulation lifecycle (audit trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS simulation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID, -- Will reference ventures when created
  seed_text TEXT NOT NULL,
  prd_content JSONB,
  schema_content JSONB,
  repo_url TEXT,
  preview_url TEXT,
  epistemic_status TEXT DEFAULT 'simulation' CHECK (epistemic_status IN ('simulation', 'official', 'archived', 'incinerated')),
  ttl_days INTEGER DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  incinerated_at TIMESTAMPTZ
);

-- Create index on venture_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_simulation_sessions_venture_id ON simulation_sessions(venture_id);

-- Create index on epistemic_status for filtering
CREATE INDEX IF NOT EXISTS idx_simulation_sessions_epistemic_status ON simulation_sessions(epistemic_status);

-- =====================================================
-- Table: scaffold_patterns
-- Purpose: Pattern library for code generation
-- =====================================================
CREATE TABLE IF NOT EXISTS scaffold_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_name TEXT NOT NULL UNIQUE,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'component', 'hook', 'service', 'page', 'layout',
    'api_route', 'database_table', 'rls_policy', 'migration'
  )),
  template_code TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  dependencies JSONB DEFAULT '[]',
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on pattern_type for filtering
CREATE INDEX IF NOT EXISTS idx_scaffold_patterns_pattern_type ON scaffold_patterns(pattern_type);

-- Create index on pattern_name for unique lookups
CREATE INDEX IF NOT EXISTS idx_scaffold_patterns_pattern_name ON scaffold_patterns(pattern_name);

-- =====================================================
-- Table: soul_extractions
-- Purpose: Stores extracted requirements for regeneration
-- =====================================================
CREATE TABLE IF NOT EXISTS soul_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID, -- Will reference ventures when created
  simulation_session_id UUID REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  extraction_stage INTEGER NOT NULL,
  soul_content JSONB NOT NULL,
  extracted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on venture_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_soul_extractions_venture_id ON soul_extractions(venture_id);

-- Create index on simulation_session_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_soul_extractions_simulation_session_id ON soul_extractions(simulation_session_id);

-- Create index on extraction_stage for filtering
CREATE INDEX IF NOT EXISTS idx_soul_extractions_extraction_stage ON soul_extractions(extraction_stage);

-- =====================================================
-- Comments for schema documentation
-- =====================================================
COMMENT ON TABLE simulation_sessions IS 'Tracks Genesis simulation lifecycle including ephemeral deployments and incineration';
COMMENT ON COLUMN simulation_sessions.epistemic_status IS 'Tracks simulation state: simulation (active), official (promoted), archived (failed kill gate), incinerated (purged)';
COMMENT ON COLUMN simulation_sessions.ttl_days IS 'Time-to-live in days before auto-incineration (default: 90)';

COMMENT ON TABLE scaffold_patterns IS 'Pattern library for AI-driven code generation in Genesis simulations';
COMMENT ON COLUMN scaffold_patterns.pattern_type IS 'Category of pattern: component, hook, service, page, layout, api_route, database_table, rls_policy, migration';
COMMENT ON COLUMN scaffold_patterns.variables IS 'JSONB array of variable placeholders used in template_code';
COMMENT ON COLUMN scaffold_patterns.dependencies IS 'JSONB array of pattern dependencies or package requirements';

COMMENT ON TABLE soul_extractions IS 'Stores extracted structured requirements from simulations for regeneration gates (Stage 16/17)';
COMMENT ON COLUMN soul_extractions.extraction_stage IS 'Stage number where extraction occurred (typically 16 or 17)';
COMMENT ON COLUMN soul_extractions.soul_content IS 'JSONB containing validated requirements, data model, user flows, component inventory';
