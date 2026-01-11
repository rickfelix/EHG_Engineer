-- ============================================================================
-- Migration: SD Design & Architecture Stream Tables
-- SD: SD-LEO-STREAMS-001
-- Date: 2026-01-11
-- Purpose: Add stream requirements and completion tracking for PLAN phase
-- ============================================================================

-- ============================================================================
-- TABLE 1: sd_stream_requirements
-- Stores the activation matrix for streams by SD type
-- ============================================================================

CREATE TABLE IF NOT EXISTS sd_stream_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_type VARCHAR(50) NOT NULL,
  stream_name VARCHAR(50) NOT NULL,
  stream_category VARCHAR(20) NOT NULL CHECK (stream_category IN ('design', 'architecture')),
  requirement_level VARCHAR(20) NOT NULL CHECK (requirement_level IN ('required', 'optional', 'conditional', 'skip')),
  conditional_keywords TEXT[] DEFAULT '{}',
  minimum_depth VARCHAR(20) DEFAULT 'checklist' CHECK (minimum_depth IN ('checklist', 'brief', 'full', 'adr')),
  description TEXT,
  validation_sub_agent VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(sd_type, stream_name)
);

-- Index for fast lookup by SD type
CREATE INDEX idx_stream_req_sd_type ON sd_stream_requirements(sd_type);

-- ============================================================================
-- TABLE 2: sd_stream_completions
-- Tracks completion status of streams per SD
-- ============================================================================

CREATE TABLE IF NOT EXISTS sd_stream_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(100) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  stream_name VARCHAR(50) NOT NULL,
  depth_level VARCHAR(20) NOT NULL CHECK (depth_level IN ('checklist', 'brief', 'full', 'adr')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'na')),
  completed_at TIMESTAMPTZ,
  validated_by VARCHAR(50),
  validation_score INTEGER CHECK (validation_score >= 0 AND validation_score <= 100),
  outputs JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(sd_id, stream_name)
);

-- Index for fast lookup by SD
CREATE INDEX idx_stream_comp_sd_id ON sd_stream_completions(sd_id);

-- ============================================================================
-- SEED DATA: Stream Requirements by SD Type
-- Based on Adaptive Stream Activation Matrix from PRD
-- ============================================================================

-- Design Streams: IA, UX, UI, Data Models
-- Architecture Streams: Tech Setup, API Design, Security Design, Performance Design

-- ========== FEATURE SD TYPE ==========
INSERT INTO sd_stream_requirements (sd_type, stream_name, stream_category, requirement_level, conditional_keywords, minimum_depth, validation_sub_agent, description) VALUES
  ('feature', 'information_architecture', 'design', 'required', '{}', 'brief', 'DESIGN', 'Content structure, navigation, data relationships'),
  ('feature', 'ux_design', 'design', 'required', '{}', 'brief', 'DESIGN', 'User flows, interaction patterns, wireframes'),
  ('feature', 'ui_design', 'design', 'required', '{}', 'brief', 'DESIGN', 'Visual design, components, branding'),
  ('feature', 'data_models', 'design', 'required', '{}', 'brief', 'DATABASE', 'Core entities, relationships, schemas'),
  ('feature', 'technical_setup', 'architecture', 'optional', '{}', 'checklist', NULL, 'Frameworks, environments, deployment'),
  ('feature', 'api_design', 'architecture', 'conditional', ARRAY['endpoint', 'rest', 'graphql', 'integration', 'webhook'], 'brief', 'API', 'Service boundaries, contracts, integrations'),
  ('feature', 'security_design', 'architecture', 'required', '{}', 'brief', 'SECURITY', 'AuthN/AuthZ, data protection, threat model'),
  ('feature', 'performance_design', 'architecture', 'optional', '{}', 'checklist', 'PERFORMANCE', 'Scalability, latency targets, caching')
ON CONFLICT (sd_type, stream_name) DO NOTHING;

-- ========== ENHANCEMENT SD TYPE ==========
INSERT INTO sd_stream_requirements (sd_type, stream_name, stream_category, requirement_level, conditional_keywords, minimum_depth, validation_sub_agent, description) VALUES
  ('enhancement', 'information_architecture', 'design', 'optional', '{}', 'checklist', 'DESIGN', 'Content structure changes if applicable'),
  ('enhancement', 'ux_design', 'design', 'required', '{}', 'brief', 'DESIGN', 'User flow improvements'),
  ('enhancement', 'ui_design', 'design', 'required', '{}', 'brief', 'DESIGN', 'Visual updates'),
  ('enhancement', 'data_models', 'design', 'conditional', ARRAY['table', 'schema', 'entity', 'relationship', 'migration'], 'brief', 'DATABASE', 'Schema changes if applicable'),
  ('enhancement', 'technical_setup', 'architecture', 'skip', '{}', 'checklist', NULL, 'Not typically needed'),
  ('enhancement', 'api_design', 'architecture', 'conditional', ARRAY['endpoint', 'rest', 'graphql', 'integration', 'webhook'], 'brief', 'API', 'API changes if applicable'),
  ('enhancement', 'security_design', 'architecture', 'optional', '{}', 'checklist', 'SECURITY', 'Security review for changes'),
  ('enhancement', 'performance_design', 'architecture', 'optional', '{}', 'checklist', 'PERFORMANCE', 'Performance impact review')
ON CONFLICT (sd_type, stream_name) DO NOTHING;

-- ========== BUGFIX SD TYPE ==========
INSERT INTO sd_stream_requirements (sd_type, stream_name, stream_category, requirement_level, conditional_keywords, minimum_depth, validation_sub_agent, description) VALUES
  ('bugfix', 'information_architecture', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('bugfix', 'ux_design', 'design', 'optional', '{}', 'checklist', 'DESIGN', 'UX impact if user-facing'),
  ('bugfix', 'ui_design', 'design', 'optional', '{}', 'checklist', 'DESIGN', 'UI fix if visual'),
  ('bugfix', 'data_models', 'design', 'conditional', ARRAY['table', 'schema', 'data', 'migration', 'corrupt'], 'brief', 'DATABASE', 'Data fix if schema-related'),
  ('bugfix', 'technical_setup', 'architecture', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('bugfix', 'api_design', 'architecture', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('bugfix', 'security_design', 'architecture', 'conditional', ARRAY['security', 'auth', 'vulnerability', 'exploit', 'injection'], 'brief', 'SECURITY', 'Security review if vulnerability'),
  ('bugfix', 'performance_design', 'architecture', 'skip', '{}', 'checklist', NULL, 'Not applicable')
ON CONFLICT (sd_type, stream_name) DO NOTHING;

-- ========== REFACTOR SD TYPE ==========
INSERT INTO sd_stream_requirements (sd_type, stream_name, stream_category, requirement_level, conditional_keywords, minimum_depth, validation_sub_agent, description) VALUES
  ('refactor', 'information_architecture', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('refactor', 'ux_design', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('refactor', 'ui_design', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('refactor', 'data_models', 'design', 'conditional', ARRAY['table', 'schema', 'entity', 'migration'], 'brief', 'DATABASE', 'Schema refactoring'),
  ('refactor', 'technical_setup', 'architecture', 'required', '{}', 'brief', NULL, 'Architecture restructuring'),
  ('refactor', 'api_design', 'architecture', 'conditional', ARRAY['endpoint', 'api', 'contract', 'interface'], 'brief', 'API', 'API contract changes'),
  ('refactor', 'security_design', 'architecture', 'optional', '{}', 'checklist', 'SECURITY', 'Security impact review'),
  ('refactor', 'performance_design', 'architecture', 'required', '{}', 'brief', 'PERFORMANCE', 'Performance baseline and targets')
ON CONFLICT (sd_type, stream_name) DO NOTHING;

-- ========== DATABASE SD TYPE ==========
INSERT INTO sd_stream_requirements (sd_type, stream_name, stream_category, requirement_level, conditional_keywords, minimum_depth, validation_sub_agent, description) VALUES
  ('database', 'information_architecture', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('database', 'ux_design', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('database', 'ui_design', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('database', 'data_models', 'design', 'required', '{}', 'full', 'DATABASE', 'Complete schema design'),
  ('database', 'technical_setup', 'architecture', 'optional', '{}', 'checklist', NULL, 'Migration setup'),
  ('database', 'api_design', 'architecture', 'required', '{}', 'brief', 'API', 'Data access patterns'),
  ('database', 'security_design', 'architecture', 'required', '{}', 'full', 'SECURITY', 'RLS policies, access control'),
  ('database', 'performance_design', 'architecture', 'required', '{}', 'brief', 'PERFORMANCE', 'Query optimization, indexing')
ON CONFLICT (sd_type, stream_name) DO NOTHING;

-- ========== SECURITY SD TYPE ==========
INSERT INTO sd_stream_requirements (sd_type, stream_name, stream_category, requirement_level, conditional_keywords, minimum_depth, validation_sub_agent, description) VALUES
  ('security', 'information_architecture', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('security', 'ux_design', 'design', 'optional', '{}', 'checklist', 'DESIGN', 'Auth UX if user-facing'),
  ('security', 'ui_design', 'design', 'optional', '{}', 'checklist', 'DESIGN', 'Security UI components'),
  ('security', 'data_models', 'design', 'required', '{}', 'brief', 'DATABASE', 'Security data model'),
  ('security', 'technical_setup', 'architecture', 'required', '{}', 'full', NULL, 'Security infrastructure'),
  ('security', 'api_design', 'architecture', 'required', '{}', 'full', 'API', 'Secure API patterns'),
  ('security', 'security_design', 'architecture', 'required', '{}', 'full', 'SECURITY', 'Complete threat model'),
  ('security', 'performance_design', 'architecture', 'required', '{}', 'brief', 'PERFORMANCE', 'Auth performance')
ON CONFLICT (sd_type, stream_name) DO NOTHING;

-- ========== PERFORMANCE SD TYPE ==========
INSERT INTO sd_stream_requirements (sd_type, stream_name, stream_category, requirement_level, conditional_keywords, minimum_depth, validation_sub_agent, description) VALUES
  ('performance', 'information_architecture', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('performance', 'ux_design', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('performance', 'ui_design', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('performance', 'data_models', 'design', 'optional', '{}', 'checklist', 'DATABASE', 'Query optimization'),
  ('performance', 'technical_setup', 'architecture', 'required', '{}', 'brief', NULL, 'Performance infrastructure'),
  ('performance', 'api_design', 'architecture', 'conditional', ARRAY['endpoint', 'api', 'latency', 'throughput'], 'brief', 'API', 'API performance patterns'),
  ('performance', 'security_design', 'architecture', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('performance', 'performance_design', 'architecture', 'required', '{}', 'full', 'PERFORMANCE', 'Complete performance plan')
ON CONFLICT (sd_type, stream_name) DO NOTHING;

-- ========== INFRASTRUCTURE SD TYPE ==========
INSERT INTO sd_stream_requirements (sd_type, stream_name, stream_category, requirement_level, conditional_keywords, minimum_depth, validation_sub_agent, description) VALUES
  ('infrastructure', 'information_architecture', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('infrastructure', 'ux_design', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('infrastructure', 'ui_design', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('infrastructure', 'data_models', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('infrastructure', 'technical_setup', 'architecture', 'required', '{}', 'full', NULL, 'Infrastructure design'),
  ('infrastructure', 'api_design', 'architecture', 'conditional', ARRAY['api', 'endpoint', 'service', 'integration'], 'brief', 'API', 'Service integrations'),
  ('infrastructure', 'security_design', 'architecture', 'required', '{}', 'brief', 'SECURITY', 'Infrastructure security'),
  ('infrastructure', 'performance_design', 'architecture', 'optional', '{}', 'checklist', 'PERFORMANCE', 'Infrastructure performance')
ON CONFLICT (sd_type, stream_name) DO NOTHING;

-- ========== API SD TYPE ==========
INSERT INTO sd_stream_requirements (sd_type, stream_name, stream_category, requirement_level, conditional_keywords, minimum_depth, validation_sub_agent, description) VALUES
  ('api', 'information_architecture', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('api', 'ux_design', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('api', 'ui_design', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('api', 'data_models', 'design', 'required', '{}', 'brief', 'DATABASE', 'API data contracts'),
  ('api', 'technical_setup', 'architecture', 'required', '{}', 'brief', NULL, 'API infrastructure'),
  ('api', 'api_design', 'architecture', 'required', '{}', 'full', 'API', 'Complete API specification'),
  ('api', 'security_design', 'architecture', 'required', '{}', 'full', 'SECURITY', 'API security'),
  ('api', 'performance_design', 'architecture', 'required', '{}', 'brief', 'PERFORMANCE', 'API performance targets')
ON CONFLICT (sd_type, stream_name) DO NOTHING;

-- ========== DOCUMENTATION SD TYPE ==========
INSERT INTO sd_stream_requirements (sd_type, stream_name, stream_category, requirement_level, conditional_keywords, minimum_depth, validation_sub_agent, description) VALUES
  ('documentation', 'information_architecture', 'design', 'required', '{}', 'brief', 'DESIGN', 'Documentation structure'),
  ('documentation', 'ux_design', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('documentation', 'ui_design', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('documentation', 'data_models', 'design', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('documentation', 'technical_setup', 'architecture', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('documentation', 'api_design', 'architecture', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('documentation', 'security_design', 'architecture', 'skip', '{}', 'checklist', NULL, 'Not applicable'),
  ('documentation', 'performance_design', 'architecture', 'skip', '{}', 'checklist', NULL, 'Not applicable')
ON CONFLICT (sd_type, stream_name) DO NOTHING;

-- ============================================================================
-- RLS POLICIES (if RLS is enabled on these tables)
-- ============================================================================

-- For now, these are reference tables, so we use permissive policies
ALTER TABLE sd_stream_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_stream_completions ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read stream requirements
CREATE POLICY "Stream requirements are readable by all"
  ON sd_stream_requirements FOR SELECT
  USING (true);

-- Allow all authenticated users to read/write stream completions
CREATE POLICY "Stream completions are accessible by all"
  ON sd_stream_completions FOR ALL
  USING (true);

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- Run this to verify the migration:
-- SELECT sd_type, COUNT(*) as stream_count
-- FROM sd_stream_requirements
-- GROUP BY sd_type
-- ORDER BY sd_type;

-- Expected: 10 SD types with 8 streams each = 80 rows
