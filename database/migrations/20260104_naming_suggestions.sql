-- ============================================================================
-- LEO Protocol - Venture Naming Engine
-- Migration: 20260104_naming_suggestions.sql
-- SD: SD-NAMING-ENGINE-001
-- ============================================================================
-- Purpose: Create tables for venture name generation and favorites
--
-- Tables:
--   - naming_suggestions: Generated name suggestions with scores
--   - naming_favorites: User's saved favorite names
-- ============================================================================

-- Create naming_suggestions table
CREATE TABLE IF NOT EXISTS naming_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  brand_genome_id UUID REFERENCES brand_genome_submissions(id) ON DELETE SET NULL,

  -- Generation metadata
  generation_session_id UUID NOT NULL,
  generation_style TEXT CHECK (generation_style IN ('descriptive', 'coined', 'abstract', 'combined', 'metaphorical')),

  -- Name data
  name TEXT NOT NULL,
  phonetic_guide TEXT,
  rationale TEXT,

  -- Scoring
  brand_fit_score INTEGER CHECK (brand_fit_score >= 0 AND brand_fit_score <= 100),
  length_score INTEGER CHECK (length_score >= 0 AND length_score <= 100),
  pronounceability_score INTEGER CHECK (pronounceability_score >= 0 AND pronounceability_score <= 100),
  uniqueness_score INTEGER CHECK (uniqueness_score >= 0 AND uniqueness_score <= 100),

  -- Domain availability (cached)
  domain_com_status TEXT CHECK (domain_com_status IN ('available', 'taken', 'error', 'unknown')),
  domain_io_status TEXT CHECK (domain_io_status IN ('available', 'taken', 'error', 'unknown')),
  domain_ai_status TEXT CHECK (domain_ai_status IN ('available', 'taken', 'error', 'unknown')),
  domain_checked_at TIMESTAMPTZ,

  -- LLM metadata
  llm_model TEXT,
  llm_provider TEXT,
  generation_cost DECIMAL(10, 6),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create naming_favorites table
CREATE TABLE IF NOT EXISTS naming_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  naming_suggestion_id UUID REFERENCES naming_suggestions(id) ON DELETE CASCADE,
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,

  -- User can also save custom names not from suggestions
  custom_name TEXT,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_favorite UNIQUE (user_id, naming_suggestion_id),
  CONSTRAINT name_source CHECK (naming_suggestion_id IS NOT NULL OR custom_name IS NOT NULL)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_naming_suggestions_venture ON naming_suggestions(venture_id);
CREATE INDEX IF NOT EXISTS idx_naming_suggestions_session ON naming_suggestions(generation_session_id);
CREATE INDEX IF NOT EXISTS idx_naming_suggestions_score ON naming_suggestions(brand_fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_naming_favorites_user ON naming_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_naming_favorites_venture ON naming_favorites(venture_id);

-- Enable RLS
ALTER TABLE naming_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE naming_favorites ENABLE ROW LEVEL SECURITY;

-- RLS policies for naming_suggestions
CREATE POLICY "Allow all for authenticated" ON naming_suggestions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow select for anon" ON naming_suggestions
  FOR SELECT TO anon USING (true);

-- RLS policies for naming_favorites
CREATE POLICY "Users can manage their own favorites" ON naming_favorites
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_naming_suggestions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER naming_suggestions_updated_at
  BEFORE UPDATE ON naming_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_naming_suggestions_updated_at();

-- Verification
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'naming_suggestions') THEN
    RAISE NOTICE 'naming_suggestions table created successfully';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'naming_favorites') THEN
    RAISE NOTICE 'naming_favorites table created successfully';
  END IF;
END $$;
