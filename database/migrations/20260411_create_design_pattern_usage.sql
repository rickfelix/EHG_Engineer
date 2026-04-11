-- Migration: Create design_pattern_usage tracking table
-- SD: SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001-A
-- Purpose: Track which design patterns have been used per venture for deduplication

CREATE TABLE IF NOT EXISTS design_pattern_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venture_id UUID NOT NULL,
  pattern_id TEXT NOT NULL,
  reference_id UUID REFERENCES design_reference_library(id),
  used_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_dpu_venture_id ON design_pattern_usage(venture_id);
CREATE INDEX IF NOT EXISTS idx_dpu_pattern_id ON design_pattern_usage(pattern_id);
CREATE INDEX IF NOT EXISTS idx_dpu_venture_pattern ON design_pattern_usage(venture_id, pattern_id);

-- RLS
ALTER TABLE design_pattern_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role full access" ON design_pattern_usage
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE design_pattern_usage IS 'Tracks design pattern usage per venture for deduplication in the archetype-matched design reference engine';

-- Rollback:
-- DROP TABLE IF EXISTS design_pattern_usage;
