-- ============================================================
-- Migration: Stage 0 - Intelligent Venture Entry Engine Schema
-- SD: SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-A
-- Date: 2026-02-09
-- Description: Creates database schema for the Stage 0 venture
--   entry process including venture briefs, nursery, blueprints,
--   chairman constraints, archetypes, modeling requests, and
--   discovery strategies.
-- ============================================================

-- ============================================================
-- 1. VENTURE BRIEFS - Stage 0 Output Contract
-- The structured brief produced by the synthesis step that
-- becomes the Stage 1 input.
-- ============================================================

CREATE TABLE IF NOT EXISTS venture_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,

  -- Core fields
  name TEXT NOT NULL,
  problem_statement TEXT NOT NULL,
  raw_chairman_intent TEXT NOT NULL,
  solution TEXT,
  target_market TEXT,

  -- Entry path tracking
  origin_type TEXT NOT NULL CHECK (origin_type IN ('competitor_teardown', 'competitor_clone', 'blueprint', 'discovery', 'manual')),
  competitor_ref JSONB,        -- Array of competitor URLs analyzed
  blueprint_id UUID,           -- References venture_blueprints if applicable
  discovery_strategy TEXT,     -- Which discovery strategy was used

  -- Synthesis outputs
  archetype TEXT,              -- Recognized venture archetype
  moat_strategy JSONB,         -- { type, mechanism, compounding_description, portfolio_connection }
  portfolio_synergy_score NUMERIC(3,2) CHECK (portfolio_synergy_score >= 0 AND portfolio_synergy_score <= 1),
  portfolio_evaluation JSONB,  -- Full portfolio-aware evaluation details
  time_horizon_classification TEXT CHECK (time_horizon_classification IN ('build_now', 'park_later', 'window_closing')),
  build_estimate JSONB,        -- { estimated_loc, estimated_sds, token_budget_profile, infra_requirements, comparable_ventures }
  cross_references JSONB,      -- { intellectual_capital: [], outcome_history: [] }
  chairman_constraint_scores JSONB,  -- { constraint_name: { score, pass, notes } }
  problem_reframings JSONB,    -- Array of alternative problem framings with rankings

  -- Maturity and disposition
  maturity TEXT NOT NULL DEFAULT 'ready' CHECK (maturity IN ('seed', 'sprout', 'ready')),

  -- Metadata
  created_by TEXT DEFAULT 'stage0_engine',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE venture_briefs IS 'Stage 0 output contract - structured brief produced by the synthesis engine that becomes Stage 1 input';
COMMENT ON COLUMN venture_briefs.raw_chairman_intent IS 'Immutable original chairman vision - never modified after creation';
COMMENT ON COLUMN venture_briefs.maturity IS 'seed = raw thought, sprout = partially structured, ready = enters Stage 1';

-- Index for venture lookups
CREATE INDEX IF NOT EXISTS idx_venture_briefs_venture_id ON venture_briefs(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_briefs_maturity ON venture_briefs(maturity);
CREATE INDEX IF NOT EXISTS idx_venture_briefs_origin_type ON venture_briefs(origin_type);
CREATE INDEX IF NOT EXISTS idx_venture_briefs_created_at ON venture_briefs(created_at DESC);

-- ============================================================
-- 2. VENTURE NURSERY - Ideas not ready for Stage 1
-- Stores venture ideas at various maturity levels with
-- trigger conditions for re-evaluation.
-- ============================================================

CREATE TABLE IF NOT EXISTS venture_nursery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id UUID REFERENCES venture_briefs(id) ON DELETE CASCADE,

  -- Core
  name TEXT NOT NULL,
  description TEXT,

  -- Maturity tracking
  maturity_level TEXT NOT NULL DEFAULT 'seed' CHECK (maturity_level IN ('seed', 'sprout', 'ready')),

  -- Re-evaluation triggers (stored as JSONB array)
  trigger_conditions JSONB DEFAULT '[]'::jsonb,
  -- Example: [{ "type": "capability_added", "capability": "real-time-processing", "description": "..." }]

  -- Scoring
  current_score NUMERIC(5,2),
  score_history JSONB DEFAULT '[]'::jsonb,
  -- Example: [{ "date": "2026-02-09", "score": 72.5, "reason": "market_shift", "details": "..." }]

  last_evaluated_at TIMESTAMPTZ,
  next_evaluation_at TIMESTAMPTZ,
  evaluation_interval_days INTEGER DEFAULT 30,

  -- Promotion tracking
  promoted_to_venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,
  promoted_at TIMESTAMPTZ,

  -- Source tracking
  source_type TEXT CHECK (source_type IN ('brainstorm', 'todoist', 'youtube', 'competitor_analysis', 'discovery_mode', 'manual')),
  source_ref JSONB,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE venture_nursery IS 'Stores venture ideas not ready for Stage 1 at seed/sprout/ready maturity levels with trigger conditions for automatic re-evaluation';

CREATE INDEX IF NOT EXISTS idx_venture_nursery_maturity ON venture_nursery(maturity_level);
CREATE INDEX IF NOT EXISTS idx_venture_nursery_next_eval ON venture_nursery(next_evaluation_at) WHERE promoted_to_venture_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_venture_nursery_brief ON venture_nursery(brief_id);

-- ============================================================
-- 3. VENTURE BLUEPRINTS - Pre-made venture templates
-- Categorized templates for the Blueprint Browse path.
-- ============================================================

CREATE TABLE IF NOT EXISTS venture_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  blueprint_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,

  -- Template content
  template JSONB NOT NULL,
  -- Structure: { problem_template, solution_template, target_market_template,
  --              recommended_archetype, moat_hints, typical_build_estimate,
  --              customizable_params: [{ name, type, default, description }] }

  -- Classification
  tags TEXT[] DEFAULT '{}',
  archetype_hint TEXT,

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  success_rate NUMERIC(3,2),  -- Ratio of ventures using this blueprint that graduated

  -- Versioning
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE venture_blueprints IS 'Pre-made venture templates for the Blueprint Browse entry path in Stage 0';

CREATE INDEX IF NOT EXISTS idx_venture_blueprints_category ON venture_blueprints(category);
CREATE INDEX IF NOT EXISTS idx_venture_blueprints_active ON venture_blueprints(is_active) WHERE is_active = true;

-- ============================================================
-- 4. CHAIRMAN CONSTRAINTS - Auto-applied strategic filters
-- Strategic constraints extracted from the chairman's thinking,
-- applied to every venture evaluation.
-- ============================================================

CREATE TABLE IF NOT EXISTS chairman_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  constraint_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Filter logic
  filter_type TEXT NOT NULL CHECK (filter_type IN ('hard_reject', 'score_modifier', 'score_bonus', 'advisory')),
  filter_logic JSONB NOT NULL,
  -- Structure varies by type:
  -- hard_reject: { condition: "...", rejection_reason: "..." }
  -- score_modifier: { condition: "...", modifier: -0.15, reason: "..." }
  -- score_bonus: { condition: "...", bonus: 0.10, reason: "..." }
  -- advisory: { guidance: "...", context: "..." }

  -- Weight and priority
  weight NUMERIC(3,2) DEFAULT 1.0,
  priority_order INTEGER DEFAULT 100,

  -- Versioning (constraints evolve from learnings)
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,

  -- Source tracking
  source TEXT CHECK (source IN ('todoist', 'brainstorm', 'kill_gate', 'retrospective', 'manual')),
  source_ref TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE chairman_constraints IS 'Strategic constraints from the chairman applied to every venture during Stage 0 synthesis. Evolves over time from kill gate outcomes and retrospectives.';

CREATE INDEX IF NOT EXISTS idx_chairman_constraints_active ON chairman_constraints(is_active, priority_order) WHERE is_active = true;

-- Seed initial constraints from the vision document
INSERT INTO chairman_constraints (constraint_key, name, description, filter_type, filter_logic, source, priority_order)
VALUES
  ('MUST_BE_AUTOMATABLE', 'Must be fully automatable', 'Reject ventures requiring sustained manual effort', 'hard_reject',
   '{"condition": "requires_manual_effort", "rejection_reason": "Venture requires sustained manual effort - EHG ventures must be fully automatable"}'::jsonb,
   'todoist', 10),
  ('PROPRIETARY_DATA', 'Proprietary data advantage', 'Score higher if venture generates or requires proprietary data', 'score_bonus',
   '{"condition": "generates_proprietary_data", "bonus": 0.15, "reason": "Proprietary data creates defensibility"}'::jsonb,
   'todoist', 20),
  ('NARROW_SPECIALIZATION', 'Narrow specialization', 'Reject ventures that are too broad', 'hard_reject',
   '{"condition": "market_scope_too_broad", "rejection_reason": "Venture scope is too broad - taste needs to be narrow to specialize and exceed expectations"}'::jsonb,
   'todoist', 30),
  ('NICHE_OVER_CROWDED', 'Niche over crowded', 'Penalty for high-competition markets', 'score_modifier',
   '{"condition": "high_competition_market", "modifier": -0.20, "reason": "High competition reduces likelihood of sustainable advantage"}'::jsonb,
   'todoist', 40),
  ('TWO_YEAR_POSITIONING', '2-year positioning', 'Evaluate against 2-year market trajectory', 'advisory',
   '{"guidance": "Position this venture for where the market will be in 2 years, not where it is today", "context": "Chairman thinks in 2-year horizons for strategic positioning"}'::jsonb,
   'todoist', 50),
  ('PORTFOLIO_INTEGRATION', 'Portfolio integration', 'Score higher for cross-venture synergies', 'score_bonus',
   '{"condition": "portfolio_synergy_detected", "bonus": 0.10, "reason": "Ventures should appear separate but form an integrated system where each feeds the other"}'::jsonb,
   'todoist', 60),
  ('DATA_FLYWHEEL', 'Data collection built-in', 'Every venture must have a data flywheel', 'hard_reject',
   '{"condition": "no_data_flywheel", "rejection_reason": "Every venture must have a built-in data collection mechanism that compounds over time"}'::jsonb,
   'todoist', 70),
  ('MOAT_FIRST', 'Moat-first', 'Must articulate defensibility before proceeding', 'hard_reject',
   '{"condition": "no_moat_strategy", "rejection_reason": "Cannot proceed without articulated moat strategy and defensibility plan"}'::jsonb,
   'todoist', 80),
  ('VALUES_ALIGNMENT', 'Values alignment', 'Filter against EHG constitutional principles', 'hard_reject',
   '{"condition": "violates_ehg_values", "rejection_reason": "Venture conflicts with EHG constitutional principles"}'::jsonb,
   'manual', 90),
  ('VIRAL_POTENTIAL', 'Viral potential', 'Score for growth mechanics', 'score_bonus',
   '{"condition": "has_viral_mechanics", "bonus": 0.08, "reason": "Growth mechanics reduce customer acquisition costs"}'::jsonb,
   'todoist', 100)
ON CONFLICT (constraint_key) DO NOTHING;

-- ============================================================
-- 5. VENTURE ARCHETYPES - Extend existing table
-- The venture_archetypes table already exists (visual themes).
-- We add Stage 0 columns for pattern recognition and
-- historical performance tracking.
-- ============================================================

DO $$
BEGIN
  -- archetype_key: Unique key for pattern matching
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='archetype_key') THEN
    ALTER TABLE venture_archetypes ADD COLUMN archetype_key TEXT UNIQUE;
  END IF;

  -- detection_keywords: Keywords for auto-detection
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='detection_keywords') THEN
    ALTER TABLE venture_archetypes ADD COLUMN detection_keywords TEXT[] DEFAULT '{}';
  END IF;

  -- detection_patterns: Complex detection patterns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='detection_patterns') THEN
    ALTER TABLE venture_archetypes ADD COLUMN detection_patterns JSONB;
  END IF;

  -- Historical performance columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='total_ventures') THEN
    ALTER TABLE venture_archetypes ADD COLUMN total_ventures INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='graduated_count') THEN
    ALTER TABLE venture_archetypes ADD COLUMN graduated_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='killed_count') THEN
    ALTER TABLE venture_archetypes ADD COLUMN killed_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='avg_completion_stages') THEN
    ALTER TABLE venture_archetypes ADD COLUMN avg_completion_stages NUMERIC(4,1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='common_kill_stages') THEN
    ALTER TABLE venture_archetypes ADD COLUMN common_kill_stages INTEGER[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='common_kill_reasons') THEN
    ALTER TABLE venture_archetypes ADD COLUMN common_kill_reasons TEXT[] DEFAULT '{}';
  END IF;

  -- Archetype-specific guidance
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='recommended_strategies') THEN
    ALTER TABLE venture_archetypes ADD COLUMN recommended_strategies JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='known_pitfalls') THEN
    ALTER TABLE venture_archetypes ADD COLUMN known_pitfalls JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='benchmark_metrics') THEN
    ALTER TABLE venture_archetypes ADD COLUMN benchmark_metrics JSONB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_archetypes' AND column_name='is_active') THEN
    ALTER TABLE venture_archetypes ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

COMMENT ON TABLE venture_archetypes IS 'Recurring venture patterns with visual themes and historical performance data. Stage 0 uses archetype recognition to trigger specific benchmarks, pitfalls, and strategies.';

-- Seed Stage 0 archetypes (only insert if archetype_key not already set)
INSERT INTO venture_archetypes (name, description, archetype_key, detection_keywords)
SELECT v.name, v.description, v.archetype_key, v.detection_keywords
FROM (VALUES
  ('Democratizer', 'Premium service made accessible via automation', 'democratizer', ARRAY['democratize', 'accessible', 'premium', 'affordable', 'average individual']),
  ('Automator', 'Manual process replaced by AI agents', 'automator', ARRAY['automate', 'manual process', 'ai agent', 'replace human', 'workflow']),
  ('Capability Productizer', 'Existing tech capability wrapped in a product', 'capability_productizer', ARRAY['productize', 'capability', 'existing tech', 'wrap', 'package']),
  ('First Principles Rebuilder', 'Competitor deconstructed and rebuilt cheaper/faster', 'first_principles_rebuilder', ARRAY['first principles', 'rebuild', 'deconstruct', 'competitor', 'cheaper', 'faster']),
  ('Vertical Specialist', 'Deep niche requiring domain expertise', 'vertical_specialist', ARRAY['vertical', 'niche', 'domain expertise', 'specialized', 'deep knowledge']),
  ('Portfolio Connector', 'Value comes from integrating with existing ventures', 'portfolio_connector', ARRAY['portfolio', 'integration', 'cross-venture', 'synergy', 'connector'])
) AS v(name, description, archetype_key, detection_keywords)
WHERE NOT EXISTS (SELECT 1 FROM venture_archetypes va WHERE va.archetype_key = v.archetype_key);

-- ============================================================
-- 6. DISCOVERY STRATEGIES - Discovery Mode configuration
-- Strategies for the "Find Me Opportunities" entry path.
-- ============================================================

CREATE TABLE IF NOT EXISTS discovery_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  strategy_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Configuration
  prompt_template TEXT,           -- AI prompt template for this strategy
  data_sources JSONB DEFAULT '[]'::jsonb,  -- External data sources to query
  scoring_criteria JSONB,        -- How to rank discovered opportunities

  -- Constraints
  min_revenue_target NUMERIC(10,2),
  automation_required BOOLEAN DEFAULT true,

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  avg_ventures_generated NUMERIC(4,1),

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE discovery_strategies IS 'Configuration for the Find Me Opportunities discovery mode entry path in Stage 0';

-- Seed discovery strategies from the vision document
INSERT INTO discovery_strategies (strategy_key, name, description, min_revenue_target, automation_required)
VALUES
  ('trend_scanner', 'Trend Scanner', 'Scan trending products, emerging markets, undermarketed products. Find opportunities that can generate $1K+/month and be fully automated.', 1000.00, true),
  ('democratization_finder', 'Democratization Finder', 'Identify premium services available to the wealthy that can be made accessible to average individuals through automation.', NULL, true),
  ('capability_overhang', 'Capability Overhang Exploit', 'Scan for existing AI/tech capabilities that have not been productized. Find the gap between what is possible and what is available.', NULL, true),
  ('nursery_reeval', 'Nursery Re-evaluation', 'Re-score parked ideas from the Venture Nursery whose conditions may have changed - market shifted, new capabilities available, portfolio gap emerged.', NULL, false)
ON CONFLICT (strategy_key) DO NOTHING;

-- ============================================================
-- 7. MODELING REQUESTS - Horizontal forecasting infrastructure
-- Shared forecasting and modeling engine that serves
-- multiple Stage 0 components.
-- ============================================================

CREATE TABLE IF NOT EXISTS modeling_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request
  subject TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN (
    'time_horizon', 'build_cost', 'market_trend', 'portfolio_synergy',
    'kill_gate_prediction', 'nursery_reeval', 'competitive_density'
  )),
  time_horizon_months INTEGER,
  data_sources JSONB DEFAULT '[]'::jsonb,
  input_parameters JSONB,

  -- Response
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  projections JSONB,
  confidence_interval JSONB,  -- { lower: 0.6, upper: 0.85, confidence_level: 0.95 }

  -- Calibration
  actual_outcome JSONB,       -- Filled in when reality is known
  prediction_accuracy NUMERIC(3,2),  -- Calculated after actual_outcome is set

  -- Context
  venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,
  brief_id UUID REFERENCES venture_briefs(id) ON DELETE SET NULL,
  nursery_id UUID REFERENCES venture_nursery(id) ON DELETE SET NULL,

  -- Metadata
  requested_by TEXT DEFAULT 'stage0_engine',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE modeling_requests IS 'Horizontal forecasting and modeling engine serving Stage 0 components including time-horizon positioning, build cost estimation, and market analysis';

CREATE INDEX IF NOT EXISTS idx_modeling_requests_status ON modeling_requests(status) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_modeling_requests_venture ON modeling_requests(venture_id);
CREATE INDEX IF NOT EXISTS idx_modeling_requests_type ON modeling_requests(request_type);

-- ============================================================
-- 8. EXTEND VENTURES TABLE - Add Stage 0 output fields
-- New columns for fields not already present on ventures.
-- ============================================================

-- Add Stage 0 output fields to ventures (only if not exists)
DO $$
BEGIN
  -- problem_statement: Actively reframed problem statement
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ventures' AND column_name='problem_statement') THEN
    ALTER TABLE ventures ADD COLUMN problem_statement TEXT;
    COMMENT ON COLUMN ventures.problem_statement IS 'Actively reframed problem statement from Stage 0 synthesis';
  END IF;

  -- raw_chairman_intent: Immutable original chairman vision
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ventures' AND column_name='raw_chairman_intent') THEN
    ALTER TABLE ventures ADD COLUMN raw_chairman_intent TEXT;
    COMMENT ON COLUMN ventures.raw_chairman_intent IS 'Immutable original chairman vision captured at Stage 0 entry - never modified';
  END IF;

  -- target_market
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ventures' AND column_name='target_market') THEN
    ALTER TABLE ventures ADD COLUMN target_market TEXT;
  END IF;

  -- moat_strategy
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ventures' AND column_name='moat_strategy') THEN
    ALTER TABLE ventures ADD COLUMN moat_strategy JSONB;
    COMMENT ON COLUMN ventures.moat_strategy IS 'Moat type, compounding mechanism, and portfolio connection from Stage 0 moat architecture step';
  END IF;

  -- portfolio_synergy_score
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ventures' AND column_name='portfolio_synergy_score') THEN
    ALTER TABLE ventures ADD COLUMN portfolio_synergy_score NUMERIC(3,2) CHECK (portfolio_synergy_score >= 0 AND portfolio_synergy_score <= 1);
  END IF;

  -- time_horizon_classification
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ventures' AND column_name='time_horizon_classification') THEN
    ALTER TABLE ventures ADD COLUMN time_horizon_classification TEXT CHECK (time_horizon_classification IN ('build_now', 'park_later', 'window_closing'));
  END IF;

  -- build_estimate
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ventures' AND column_name='build_estimate') THEN
    ALTER TABLE ventures ADD COLUMN build_estimate JSONB;
  END IF;

  -- brief_id: Links to the Stage 0 output brief
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ventures' AND column_name='brief_id') THEN
    ALTER TABLE ventures ADD COLUMN brief_id UUID REFERENCES venture_briefs(id) ON DELETE SET NULL;
  END IF;

  -- discovery_strategy
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ventures' AND column_name='discovery_strategy') THEN
    ALTER TABLE ventures ADD COLUMN discovery_strategy TEXT;
  END IF;
END $$;

-- Extend venture_origin_type ENUM with Stage 0 origin types
-- NOTE: ALTER TYPE ... ADD VALUE must run outside a transaction block
-- Execute these separately if running in a transaction:
--   ALTER TYPE venture_origin_type ADD VALUE IF NOT EXISTS 'competitor_teardown';
--   ALTER TYPE venture_origin_type ADD VALUE IF NOT EXISTS 'discovery';
-- These values were added during migration execution.

-- ============================================================
-- 9. NURSERY RE-EVALUATION LOG - Audit trail
-- Tracks every nursery item re-evaluation for transparency.
-- ============================================================

CREATE TABLE IF NOT EXISTS nursery_evaluation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id UUID NOT NULL REFERENCES venture_nursery(id) ON DELETE CASCADE,

  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'capability_added', 'market_shift', 'portfolio_gap',
    'related_outcome', 'periodic_review', 'manual'
  )),
  trigger_details JSONB,

  previous_score NUMERIC(5,2),
  new_score NUMERIC(5,2),
  previous_maturity TEXT,
  new_maturity TEXT,

  evaluation_notes TEXT,
  evaluated_by TEXT DEFAULT 'stage0_engine',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nursery_evaluation_log IS 'Audit trail of nursery item re-evaluations triggered by capability additions, market shifts, portfolio gaps, and related outcomes';

CREATE INDEX IF NOT EXISTS idx_nursery_eval_log_nursery ON nursery_evaluation_log(nursery_id);
CREATE INDEX IF NOT EXISTS idx_nursery_eval_log_trigger ON nursery_evaluation_log(trigger_type);

-- ============================================================
-- 10. RLS POLICIES
-- ============================================================

-- Enable RLS on all new tables
ALTER TABLE venture_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_nursery ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE chairman_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_archetypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE modeling_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE nursery_evaluation_log ENABLE ROW LEVEL SECURITY;

-- Service role full access (for server-side operations)
-- Drop existing policies first to avoid conflicts
DO $$
DECLARE
  tbl RECORD;
  policy_name TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'venture_briefs', 'venture_nursery', 'venture_blueprints',
      'chairman_constraints', 'venture_archetypes', 'discovery_strategies',
      'modeling_requests', 'nursery_evaluation_log'
    ]) AS table_name
  LOOP
    policy_name := tbl.table_name || '_service_all';
    -- Use exception handling for policy names that differ
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, tbl.table_name);
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true)', policy_name, tbl.table_name);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Policy % on %: %', policy_name, tbl.table_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================
-- 11. HELPER VIEWS
-- ============================================================

-- View: Active nursery items needing evaluation
CREATE OR REPLACE VIEW v_nursery_pending_evaluation AS
SELECT
  vn.*,
  vb.name AS brief_name,
  vb.problem_statement,
  vb.archetype,
  vb.origin_type
FROM venture_nursery vn
LEFT JOIN venture_briefs vb ON vb.id = vn.brief_id
WHERE vn.promoted_to_venture_id IS NULL
  AND (vn.next_evaluation_at IS NULL OR vn.next_evaluation_at <= NOW())
ORDER BY vn.current_score DESC NULLS LAST;

COMMENT ON VIEW v_nursery_pending_evaluation IS 'Nursery items that are due for re-evaluation (not yet promoted and past their evaluation date)';

-- View: Venture brief summary with archetype performance
CREATE OR REPLACE VIEW v_venture_brief_summary AS
SELECT
  vb.*,
  va.graduated_count AS archetype_graduated,
  va.killed_count AS archetype_killed,
  va.avg_completion_stages AS archetype_avg_stages,
  va.known_pitfalls AS archetype_pitfalls
FROM venture_briefs vb
LEFT JOIN venture_archetypes va ON va.archetype_key = vb.archetype
ORDER BY vb.created_at DESC;

COMMENT ON VIEW v_venture_brief_summary IS 'Venture briefs enriched with archetype performance data for informed decision making';

-- View: Modeling request accuracy tracking
CREATE OR REPLACE VIEW v_modeling_accuracy AS
SELECT
  request_type,
  COUNT(*) AS total_requests,
  COUNT(actual_outcome) AS calibrated_count,
  AVG(prediction_accuracy) AS avg_accuracy,
  MIN(prediction_accuracy) AS min_accuracy,
  MAX(prediction_accuracy) AS max_accuracy
FROM modeling_requests
WHERE prediction_accuracy IS NOT NULL
GROUP BY request_type;

COMMENT ON VIEW v_modeling_accuracy IS 'Tracks prediction accuracy by modeling request type for continuous calibration improvement';
