-- Wave 2 Backend Architecture Migration
-- SD-VW-BACKEND-ARCHITECTURE-001
--
-- 1. Add attempt_number to chairman_decisions (immutable decision re-entry)
-- 2. Create stage_config table (single source of truth for stage metadata)
-- 3. Create get_gate_stages() function (returns gate stage numbers)
--
-- Rollback:
--   ALTER TABLE chairman_decisions DROP CONSTRAINT IF EXISTS uq_chairman_decision_attempt;
--   ALTER TABLE chairman_decisions DROP COLUMN IF EXISTS attempt_number;
--   DROP FUNCTION IF EXISTS get_gate_stages();
--   DROP TABLE IF EXISTS stage_config;

BEGIN;

-- =============================================================================
-- 1. Add attempt_number to chairman_decisions
-- =============================================================================

-- Add column with default so existing rows get attempt_number=1
ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN chairman_decisions.attempt_number IS
  'Attempt number for decision re-entry. Enables immutable history — each retry creates a new row instead of updating.';

-- Unique constraint: one decision per (venture, stage, attempt)
-- Using a named constraint for easy rollback
ALTER TABLE chairman_decisions
  ADD CONSTRAINT uq_chairman_decision_attempt
  UNIQUE (venture_id, lifecycle_stage, attempt_number);

-- =============================================================================
-- 2. Create stage_config table
-- =============================================================================

CREATE TABLE IF NOT EXISTS stage_config (
  stage_number  INTEGER PRIMARY KEY,
  stage_name    TEXT    NOT NULL,
  stage_key     TEXT    NOT NULL UNIQUE,
  gate_type     TEXT    NOT NULL DEFAULT 'none'
                        CHECK (gate_type IN ('none', 'kill', 'promotion')),
  review_mode   TEXT    NOT NULL DEFAULT 'auto'
                        CHECK (review_mode IN ('auto', 'review', 'manual')),
  chunk         TEXT    NOT NULL,
  description   TEXT
);

COMMENT ON TABLE stage_config IS
  'Single source of truth for venture pipeline stage metadata. Replaces hardcoded stage config in application code.';

-- Populate all 25 stages
INSERT INTO stage_config (stage_number, stage_name, stage_key, gate_type, review_mode, chunk, description) VALUES
  ( 1, 'Draft Idea',                'draft_idea',                'none',      'auto',   'THE_TRUTH',     'Initial venture idea capture'),
  ( 2, 'AI Review',                 'ai_review',                 'none',      'auto',   'THE_TRUTH',     'Automated AI review of the idea'),
  ( 3, 'Comprehensive Validation',  'comprehensive_validation',  'kill',      'auto',   'THE_TRUTH',     'Deep validation — kill gate filters weak ideas'),
  ( 4, 'Market Analysis',           'market_analysis',           'none',      'auto',   'THE_TRUTH',     'Market sizing, competitors, and opportunity analysis'),
  ( 5, 'Profitability Forecasting', 'profitability_forecasting', 'kill',      'auto',   'THE_TRUTH',     'Financial viability check — kill gate'),
  ( 6, 'Go-to-Market Strategy',     'gtm_strategy',              'none',      'auto',   'THE_ENGINE',    'Go-to-market strategy development'),
  ( 7, 'Revenue Architecture',      'revenue_architecture',      'none',      'review', 'THE_ENGINE',    'Revenue model and pricing architecture'),
  ( 8, 'Business Model Canvas',     'business_model_canvas',     'none',      'review', 'THE_ENGINE',    'Business model canvas creation'),
  ( 9, 'Exit Strategy',             'exit_strategy',             'none',      'review', 'THE_ENGINE',    'Exit strategy and long-term planning'),
  (10, 'Customer & Brand Foundation','customer_brand_foundation', 'promotion', 'auto',   'THE_IDENTITY',  'Customer personas and brand foundation — promotion gate'),
  (11, 'Naming & Visual Identity',  'naming_visual_identity',    'none',      'review', 'THE_IDENTITY',  'Brand naming and visual identity design'),
  (12, 'Go-to-Market Plan',         'gtm_plan',                  'none',      'auto',   'THE_IDENTITY',  'Detailed go-to-market execution plan'),
  (13, 'Product Roadmap',           'product_roadmap',           'kill',      'auto',   'THE_BLUEPRINT', 'Product roadmap and feature prioritization — kill gate'),
  (14, 'Tech Architecture',         'tech_architecture',         'none',      'auto',   'THE_BLUEPRINT', 'Technical architecture and stack decisions'),
  (15, 'Development Plan',          'development_plan',          'none',      'auto',   'THE_BLUEPRINT', 'Development timeline and resource planning'),
  (16, 'Financial Projections',     'financial_projections',     'promotion', 'auto',   'THE_BLUEPRINT', 'Detailed financial projections — promotion gate'),
  (17, 'Build Readiness',           'build_readiness',           'promotion', 'auto',   'THE_BUILD',     'Build readiness assessment — promotion gate'),
  (18, 'MVP Development',           'mvp_development',           'none',      'auto',   'THE_BUILD',     'Minimum viable product development'),
  (19, 'Testing & QA',              'testing_qa',                'none',      'auto',   'THE_BUILD',     'Testing and quality assurance'),
  (20, 'User Testing',              'user_testing',              'none',      'auto',   'THE_BUILD',     'User acceptance testing'),
  (21, 'Pre-Launch Prep',           'pre_launch_prep',           'none',      'auto',   'THE_BUILD',     'Pre-launch preparation and checklist'),
  (22, 'Deployment',                'deployment',                'promotion', 'auto',   'THE_BUILD',     'Deployment to production — promotion gate'),
  (23, 'Production Launch',         'production_launch',         'kill',      'auto',   'THE_LAUNCH',    'Production launch — kill gate (final go/no-go)'),
  (24, 'Post-Launch Review',        'post_launch_review',        'promotion', 'auto',   'THE_LAUNCH',    'Post-launch review and metrics — promotion gate'),
  (25, 'Growth & Scale',            'growth_scale',              'none',      'auto',   'THE_LAUNCH',    'Growth strategy and scaling operations')
ON CONFLICT (stage_number) DO NOTHING;

-- =============================================================================
-- 3. Create get_gate_stages() function
-- =============================================================================

CREATE OR REPLACE FUNCTION get_gate_stages()
RETURNS INTEGER[]
LANGUAGE sql
STABLE
AS $$
  SELECT ARRAY_AGG(stage_number ORDER BY stage_number)
  FROM stage_config
  WHERE gate_type != 'none';
$$;

COMMENT ON FUNCTION get_gate_stages() IS
  'Returns an array of stage numbers that have gates (kill or promotion). Used by advance logic to determine when chairman decisions are required.';

COMMIT;
