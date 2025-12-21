-- Migration: Create vertical_complexity_multipliers table
-- SD: SD-HARDENING-V2
-- Purpose: Truth Normalization (Pillar 6) - Industry vertical complexity factors
-- Date: 2025-12-20

-- Create vertical_complexity_multipliers table
CREATE TABLE IF NOT EXISTS vertical_complexity_multipliers (
  vertical_category VARCHAR(50) PRIMARY KEY,
  complexity_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  risk_adjustment_factor NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  min_market_validation_confidence NUMERIC(4,2) NOT NULL DEFAULT 0.70,
  health_threshold_green NUMERIC(4,2) NOT NULL DEFAULT 0.75,
  health_threshold_yellow NUMERIC(4,2) NOT NULL DEFAULT 0.50,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE vertical_complexity_multipliers IS 'Industry vertical complexity factors for Truth Normalization (SD-HARDENING-V2)';
COMMENT ON COLUMN vertical_complexity_multipliers.vertical_category IS 'Industry vertical identifier (healthcare, fintech, edtech, logistics, other)';
COMMENT ON COLUMN vertical_complexity_multipliers.complexity_multiplier IS 'Multiplier for estimating complexity based on vertical (1.0-2.0 range)';
COMMENT ON COLUMN vertical_complexity_multipliers.risk_adjustment_factor IS 'Multiplier for risk assessment (1.0-2.0 range)';
COMMENT ON COLUMN vertical_complexity_multipliers.min_market_validation_confidence IS 'Minimum confidence threshold for market validation (0.0-1.0)';
COMMENT ON COLUMN vertical_complexity_multipliers.health_threshold_green IS 'Health score threshold for "green" status (0.0-1.0)';
COMMENT ON COLUMN vertical_complexity_multipliers.health_threshold_yellow IS 'Health score threshold for "yellow" status (0.0-1.0)';

-- Seed initial vertical multipliers
INSERT INTO vertical_complexity_multipliers
  (vertical_category, complexity_multiplier, risk_adjustment_factor, min_market_validation_confidence,
   health_threshold_green, health_threshold_yellow, description)
VALUES
  ('healthcare', 1.5, 1.8, 0.95, 0.90, 0.70, 'Patient safety, regulatory compliance, HIPAA'),
  ('fintech', 1.3, 1.6, 0.90, 0.85, 0.65, 'Regulatory compliance, fraud prevention, financial accuracy'),
  ('edtech', 1.2, 1.3, 0.75, 0.75, 0.50, 'User engagement variance, educational efficacy'),
  ('logistics', 1.0, 1.1, 0.70, 0.75, 0.50, 'Operational efficiency, supply chain complexity'),
  ('other', 1.0, 1.0, 0.70, 0.75, 0.50, 'Default baseline for unclassified verticals')
ON CONFLICT (vertical_category) DO NOTHING;
