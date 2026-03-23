-- Migration: Create design_reference_library table
-- SD: SD-MAN-INFRA-AWWWARDS-CURATED-DESIGN-001
-- Purpose: Curated Awwwards design reference library for archetype-based lookups
--
-- NOTE: This migration reflects the LIVE schema as deployed. Column names use
-- score_design (not design_score), tech_stack is TEXT[] (not TEXT), and
-- awwwards_page_url is included. screenshot_url and metadata were never deployed.

CREATE TABLE IF NOT EXISTS design_reference_library (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  site_name TEXT NOT NULL,
  description TEXT,
  score_design NUMERIC(4,2),
  score_usability NUMERIC(4,2),
  score_creativity NUMERIC(4,2),
  score_content NUMERIC(4,2),
  score_combined NUMERIC(4,2) GENERATED ALWAYS AS ((score_design + score_usability + score_creativity + score_content) / 4.0) STORED,
  tech_stack TEXT[],
  agency_name TEXT,
  country TEXT,
  date_awarded DATE,
  archetype_category TEXT NOT NULL CHECK (archetype_category IN ('saas', 'marketplace', 'fintech', 'healthtech', 'e-commerce', 'portfolio', 'corporate')),
  awwwards_page_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drl_archetype ON design_reference_library(archetype_category);
CREATE INDEX IF NOT EXISTS idx_drl_combined_score ON design_reference_library(score_combined DESC);

-- RLS
ALTER TABLE design_reference_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role full access" ON design_reference_library
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow anon read" ON design_reference_library
  FOR SELECT USING (true);

COMMENT ON TABLE design_reference_library IS 'Curated design references from Awwwards, categorized by venture archetype for Stage 15 wireframe generation';

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_design_ref_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_design_ref_updated_at ON design_reference_library;

CREATE TRIGGER trg_design_ref_updated_at
  BEFORE UPDATE ON design_reference_library
  FOR EACH ROW
  EXECUTE FUNCTION update_design_ref_updated_at();

-- Rollback:
-- DROP TRIGGER IF EXISTS trg_design_ref_updated_at ON design_reference_library;
-- DROP FUNCTION IF EXISTS update_design_ref_updated_at();
-- DROP TABLE IF EXISTS design_reference_library;
