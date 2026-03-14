-- =============================================================================
-- Migration: 20260314_srip_artifact_tables.sql
-- Purpose: Create SRIP (Site Replication Intelligence Protocol) artifact tables
-- SD: SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001
-- Author: database-agent
-- Date: 2026-03-14
--
-- Tables created:
--   1. srip_site_dna          - Extracted design patterns from reference URLs
--   2. srip_brand_interviews  - Brand interview answers per venture
--   3. srip_synthesis_prompts - Generated one-shot replication prompts
--   4. srip_quality_checks    - Multi-domain fidelity scores
--
-- Dependencies:
--   - ventures(id) must exist (created in 20251130_ehg_app_schema_migration.sql)
--   - public.update_updated_at_column() must exist (created in 20251201_fix_ehg_consolidation_p0.sql)
--
-- Rollback:
--   DROP TABLE IF EXISTS srip_quality_checks CASCADE;
--   DROP TABLE IF EXISTS srip_synthesis_prompts CASCADE;
--   DROP TABLE IF EXISTS srip_brand_interviews CASCADE;
--   DROP TABLE IF EXISTS srip_site_dna CASCADE;
-- =============================================================================

-- =============================================================================
-- TABLE 1: srip_site_dna
-- Stores extracted design patterns (DNA) from reference URLs.
-- The dna_json column contains design tokens, layout structure, component
-- inventory, and other visual/structural patterns extracted from the reference.
-- =============================================================================

CREATE TABLE IF NOT EXISTS srip_site_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  reference_url TEXT NOT NULL,
  screenshot_path TEXT,
  dna_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_steps JSONB DEFAULT '[]'::jsonb,
  quality_score NUMERIC(5,2),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100)
);

COMMENT ON TABLE srip_site_dna IS 'SRIP: Stores extracted design DNA (tokens, layout, components) from reference site URLs for venture site replication.';
COMMENT ON COLUMN srip_site_dna.dna_json IS 'JSONB containing design tokens, layout structure, component inventory, typography, color palette, and spacing extracted from the reference URL.';
COMMENT ON COLUMN srip_site_dna.extraction_steps IS 'JSONB array tracking which extraction steps have completed (e.g., screenshot, DOM analysis, style extraction).';
COMMENT ON COLUMN srip_site_dna.quality_score IS 'Quality score (0-100) indicating confidence in the extraction completeness and accuracy.';
COMMENT ON COLUMN srip_site_dna.screenshot_path IS 'Optional path to a manual screenshot fallback when automated capture is unavailable.';


-- =============================================================================
-- TABLE 2: srip_brand_interviews
-- Stores brand interview answers per venture, linking to the site DNA that
-- may have pre-populated some answers automatically.
-- =============================================================================

CREATE TABLE IF NOT EXISTS srip_brand_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  site_dna_id UUID REFERENCES srip_site_dna(id) ON DELETE SET NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  pre_populated_count INT DEFAULT 0,
  manual_input_count INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100)
);

COMMENT ON TABLE srip_brand_interviews IS 'SRIP: Stores 12-question brand interview answers per venture. Some answers may be auto-populated from site DNA extraction.';
COMMENT ON COLUMN srip_brand_interviews.answers IS 'JSONB containing the 12 brand interview question-answer pairs (e.g., brand personality, target audience, tone of voice).';
COMMENT ON COLUMN srip_brand_interviews.pre_populated_count IS 'Number of interview questions that were automatically filled from site DNA analysis.';
COMMENT ON COLUMN srip_brand_interviews.manual_input_count IS 'Number of interview questions that required manual user input.';


-- =============================================================================
-- TABLE 3: srip_synthesis_prompts
-- Stores generated one-shot replication prompts that combine site DNA and
-- brand interview data into actionable prompts for site generation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS srip_synthesis_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  site_dna_id UUID REFERENCES srip_site_dna(id) ON DELETE SET NULL,
  brand_interview_id UUID REFERENCES srip_brand_interviews(id) ON DELETE SET NULL,
  prompt_text TEXT NOT NULL,
  fidelity_target NUMERIC(5,2) DEFAULT 80.00,
  version INT DEFAULT 1,
  token_count INT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100)
);

COMMENT ON TABLE srip_synthesis_prompts IS 'SRIP: Stores generated one-shot replication prompts that synthesize site DNA and brand interview data into actionable site generation instructions.';
COMMENT ON COLUMN srip_synthesis_prompts.prompt_text IS 'The full synthesized prompt text combining design DNA and brand context for one-shot site replication.';
COMMENT ON COLUMN srip_synthesis_prompts.fidelity_target IS 'Target fidelity score (0-100) that the generated site should achieve against the reference.';
COMMENT ON COLUMN srip_synthesis_prompts.version IS 'Version number for prompt iterations. New versions supersede previous ones.';
COMMENT ON COLUMN srip_synthesis_prompts.token_count IS 'Estimated token length of the prompt for LLM context budget planning.';


-- =============================================================================
-- TABLE 4: srip_quality_checks
-- Stores multi-domain fidelity scores comparing generated output against
-- the reference site across 6 quality domains.
-- =============================================================================

CREATE TABLE IF NOT EXISTS srip_quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  synthesis_prompt_id UUID REFERENCES srip_synthesis_prompts(id) ON DELETE SET NULL,
  domain_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_score NUMERIC(5,2),
  gaps JSONB DEFAULT '[]'::jsonb,
  pass_threshold NUMERIC(5,2) DEFAULT 80.00,
  passed BOOLEAN GENERATED ALWAYS AS (overall_score >= pass_threshold) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100)
);

COMMENT ON TABLE srip_quality_checks IS 'SRIP: Stores multi-domain fidelity scores comparing generated site output against the reference across 6 domains: layout, visual_composition, design_system, interaction, technical, accessibility.';
COMMENT ON COLUMN srip_quality_checks.domain_scores IS 'JSONB containing scores for each quality domain: layout, visual_composition, design_system, interaction, technical, accessibility.';
COMMENT ON COLUMN srip_quality_checks.overall_score IS 'Weighted overall fidelity score (0-100) aggregated from domain scores.';
COMMENT ON COLUMN srip_quality_checks.gaps IS 'JSONB array of actionable improvement items identified during quality assessment.';
COMMENT ON COLUMN srip_quality_checks.pass_threshold IS 'Minimum overall score required to pass quality check (default 80.00).';
COMMENT ON COLUMN srip_quality_checks.passed IS 'Generated column: true when overall_score >= pass_threshold.';


-- =============================================================================
-- INDEXES
-- =============================================================================

-- Venture lookups (all tables)
CREATE INDEX IF NOT EXISTS idx_srip_site_dna_venture_id ON srip_site_dna(venture_id);
CREATE INDEX IF NOT EXISTS idx_srip_brand_interviews_venture_id ON srip_brand_interviews(venture_id);
CREATE INDEX IF NOT EXISTS idx_srip_synthesis_prompts_venture_id ON srip_synthesis_prompts(venture_id);
CREATE INDEX IF NOT EXISTS idx_srip_quality_checks_venture_id ON srip_quality_checks(venture_id);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_srip_site_dna_status ON srip_site_dna(status);
CREATE INDEX IF NOT EXISTS idx_srip_synthesis_prompts_status ON srip_synthesis_prompts(status);

-- GIN indexes for JSONB query support
CREATE INDEX IF NOT EXISTS idx_srip_site_dna_dna_json ON srip_site_dna USING GIN (dna_json);
CREATE INDEX IF NOT EXISTS idx_srip_quality_checks_domain_scores ON srip_quality_checks USING GIN (domain_scores);


-- =============================================================================
-- UPDATED_AT TRIGGERS
-- Uses shared public.update_updated_at_column() function
-- (created in 20251201_fix_ehg_consolidation_p0.sql)
-- =============================================================================

DROP TRIGGER IF EXISTS update_srip_site_dna_updated_at ON srip_site_dna;
CREATE TRIGGER update_srip_site_dna_updated_at
  BEFORE UPDATE ON srip_site_dna
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_srip_brand_interviews_updated_at ON srip_brand_interviews;
CREATE TRIGGER update_srip_brand_interviews_updated_at
  BEFORE UPDATE ON srip_brand_interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- ROW LEVEL SECURITY
-- Enables RLS on all SRIP tables with permissive policies for service_role access.
-- Uses idempotent DO block pattern to avoid policy-already-exists errors.
-- =============================================================================

ALTER TABLE srip_site_dna ENABLE ROW LEVEL SECURITY;
ALTER TABLE srip_brand_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE srip_synthesis_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE srip_quality_checks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- srip_site_dna policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_site_dna' AND policyname = 'srip_site_dna_select_policy'
  ) THEN
    CREATE POLICY srip_site_dna_select_policy ON srip_site_dna FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_site_dna' AND policyname = 'srip_site_dna_insert_policy'
  ) THEN
    CREATE POLICY srip_site_dna_insert_policy ON srip_site_dna FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_site_dna' AND policyname = 'srip_site_dna_update_policy'
  ) THEN
    CREATE POLICY srip_site_dna_update_policy ON srip_site_dna FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_site_dna' AND policyname = 'srip_site_dna_delete_policy'
  ) THEN
    CREATE POLICY srip_site_dna_delete_policy ON srip_site_dna FOR DELETE USING (true);
  END IF;

  -- srip_brand_interviews policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_brand_interviews' AND policyname = 'srip_brand_interviews_select_policy'
  ) THEN
    CREATE POLICY srip_brand_interviews_select_policy ON srip_brand_interviews FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_brand_interviews' AND policyname = 'srip_brand_interviews_insert_policy'
  ) THEN
    CREATE POLICY srip_brand_interviews_insert_policy ON srip_brand_interviews FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_brand_interviews' AND policyname = 'srip_brand_interviews_update_policy'
  ) THEN
    CREATE POLICY srip_brand_interviews_update_policy ON srip_brand_interviews FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_brand_interviews' AND policyname = 'srip_brand_interviews_delete_policy'
  ) THEN
    CREATE POLICY srip_brand_interviews_delete_policy ON srip_brand_interviews FOR DELETE USING (true);
  END IF;

  -- srip_synthesis_prompts policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_synthesis_prompts' AND policyname = 'srip_synthesis_prompts_select_policy'
  ) THEN
    CREATE POLICY srip_synthesis_prompts_select_policy ON srip_synthesis_prompts FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_synthesis_prompts' AND policyname = 'srip_synthesis_prompts_insert_policy'
  ) THEN
    CREATE POLICY srip_synthesis_prompts_insert_policy ON srip_synthesis_prompts FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_synthesis_prompts' AND policyname = 'srip_synthesis_prompts_update_policy'
  ) THEN
    CREATE POLICY srip_synthesis_prompts_update_policy ON srip_synthesis_prompts FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_synthesis_prompts' AND policyname = 'srip_synthesis_prompts_delete_policy'
  ) THEN
    CREATE POLICY srip_synthesis_prompts_delete_policy ON srip_synthesis_prompts FOR DELETE USING (true);
  END IF;

  -- srip_quality_checks policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_quality_checks' AND policyname = 'srip_quality_checks_select_policy'
  ) THEN
    CREATE POLICY srip_quality_checks_select_policy ON srip_quality_checks FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_quality_checks' AND policyname = 'srip_quality_checks_insert_policy'
  ) THEN
    CREATE POLICY srip_quality_checks_insert_policy ON srip_quality_checks FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_quality_checks' AND policyname = 'srip_quality_checks_update_policy'
  ) THEN
    CREATE POLICY srip_quality_checks_update_policy ON srip_quality_checks FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'srip_quality_checks' AND policyname = 'srip_quality_checks_delete_policy'
  ) THEN
    CREATE POLICY srip_quality_checks_delete_policy ON srip_quality_checks FOR DELETE USING (true);
  END IF;
END $$;
