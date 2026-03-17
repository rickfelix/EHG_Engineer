-- =============================================================================
-- Migration: Create Missing Venture Database Tables
-- SD: SD-LEO-INFRA-MISSING-VENTURE-DB-TABLES-001
-- Date: 2026-03-17
-- Author: Claude Code (LEO Protocol)
--
-- OBJECTIVE:
--   Create 4 missing venture tables referenced in stage documentation
--   and archived pipeline scripts. Apply SERVICE-ONLY RLS pattern.
--
-- TABLES:
--   1. venture_milestones - Stage milestone tracking (stages 1-40)
--   2. venture_market_analysis - TAM/SAM/SOM market sizing (Stage 3)
--   3. venture_financial_projections - Financial forecasting (Stage 5)
--   4. venture_competitive_analysis - Competitive intelligence (Stage 4)
--
-- RLS: SERVICE-ONLY pattern (service_role SELECT+INSERT+UPDATE+DELETE only)
-- SAFETY: All operations are idempotent (IF NOT EXISTS / IF EXISTS)
-- =============================================================================

BEGIN;

-- =============================================================================
-- TABLE 1: venture_milestones
-- Purpose: Track milestones across 40 venture stages with status and dependencies
-- Referenced in: SD-047a archived handoff scripts, stage documentation
-- =============================================================================

CREATE TABLE IF NOT EXISTS venture_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL CHECK (stage_number >= 1 AND stage_number <= 40),
  milestone_name TEXT NOT NULL,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  dependencies INTEGER[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id, stage_number)
);

CREATE INDEX IF NOT EXISTS idx_venture_milestones_venture_id
  ON venture_milestones(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_milestones_status
  ON venture_milestones(status);

-- RLS: SERVICE-ONLY
ALTER TABLE venture_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_venture_milestones" ON venture_milestones
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- TABLE 2: venture_market_analysis
-- Purpose: Store TAM/SAM/SOM market sizing data for Stage 3
-- Referenced in: engage-lead-subagents-venture-mvp.js, stage-03 docs
-- =============================================================================

CREATE TABLE IF NOT EXISTS venture_market_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  tam_estimate NUMERIC,
  sam_estimate NUMERIC,
  som_estimate NUMERIC,
  market_trends JSONB DEFAULT '[]'::jsonb,
  methodology TEXT,
  confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 100),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id)
);

CREATE INDEX IF NOT EXISTS idx_venture_market_analysis_venture_id
  ON venture_market_analysis(venture_id);

-- RLS: SERVICE-ONLY
ALTER TABLE venture_market_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_venture_market_analysis" ON venture_market_analysis
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- TABLE 3: venture_financial_projections
-- Purpose: Store financial projection models for Stage 5
-- Complements venture_financial_contract (canonical metrics)
-- Referenced in: stage-05-profitability-forecasting.md
-- =============================================================================

CREATE TABLE IF NOT EXISTS venture_financial_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  projection_type TEXT NOT NULL,
  time_horizon_months INTEGER,
  revenue_projection NUMERIC,
  cost_projection NUMERIC,
  assumptions JSONB DEFAULT '{}'::jsonb,
  model_version TEXT DEFAULT '1.0',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venture_financial_projections_venture_id
  ON venture_financial_projections(venture_id);

-- RLS: SERVICE-ONLY
ALTER TABLE venture_financial_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_venture_financial_projections" ON venture_financial_projections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- TABLE 4: venture_competitive_analysis
-- Purpose: Store competitive intelligence data for Stage 4
-- Referenced in: stage-04-competitive-intelligence.md
-- =============================================================================

CREATE TABLE IF NOT EXISTS venture_competitive_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  market_position TEXT,
  strengths JSONB DEFAULT '[]'::jsonb,
  weaknesses JSONB DEFAULT '[]'::jsonb,
  threat_level TEXT DEFAULT 'medium'
    CHECK (threat_level IN ('low', 'medium', 'high', 'critical')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venture_competitive_analysis_venture_id
  ON venture_competitive_analysis(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_competitive_analysis_threat_level
  ON venture_competitive_analysis(threat_level);

-- RLS: SERVICE-ONLY
ALTER TABLE venture_competitive_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_venture_competitive_analysis" ON venture_competitive_analysis
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
