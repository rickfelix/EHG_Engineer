-- Migration: Wire Stage 4 Competitors Enhancement
-- SD: SD-LEO-INFRA-WIRE-STAGE-COMPETITORS-001
-- Date: 2026-03-15
-- Description: Add competitive analysis columns, enforce venture_id NOT NULL,
--              add upsert support via UNIQUE constraint, and composite index.
-- Safety: Table has 0 rows - all changes are safe.
-- Uses CHECK constraints per board decision (allows ALTER without type rewrite).

-- ============================================================================
-- 1. ADD NEW COLUMNS
-- ============================================================================

-- threat_level: High/Medium/Low competitive threat assessment
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS threat_level TEXT;

ALTER TABLE competitors
  ADD CONSTRAINT chk_competitors_threat_level
  CHECK (threat_level IN ('H', 'M', 'L'));

-- pricing_model: How the competitor monetizes
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS pricing_model TEXT;

ALTER TABLE competitors
  ADD CONSTRAINT chk_competitors_pricing_model
  CHECK (pricing_model IN (
    'subscription', 'freemium', 'one_time', 'usage_based',
    'marketplace', 'advertising', 'enterprise', 'hybrid'
  ));

-- market_position: Free-text description of market positioning
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS market_position TEXT;

-- swot: Structured SWOT analysis as JSONB
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS swot JSONB DEFAULT '{}';

-- lifecycle_stage: Where the competitor is in their business lifecycle
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT;

ALTER TABLE competitors
  ADD CONSTRAINT chk_competitors_lifecycle_stage
  CHECK (lifecycle_stage IN ('seed', 'growth', 'mature', 'declining'));

-- ============================================================================
-- 2. ALTER venture_id TO NOT NULL
-- ============================================================================
-- Table has 0 rows, so this is safe with no data to violate the constraint.

ALTER TABLE competitors
  ALTER COLUMN venture_id SET NOT NULL;

-- ============================================================================
-- 3. ADD UNIQUE CONSTRAINT FOR UPSERT SUPPORT
-- ============================================================================
-- Enables ON CONFLICT (venture_id, name) DO UPDATE for upsert operations.

ALTER TABLE competitors
  ADD CONSTRAINT uq_competitors_venture_name UNIQUE (venture_id, name);

-- ============================================================================
-- 4. ADD COMPOSITE INDEX
-- ============================================================================
-- Supports filtering competitors by venture and lifecycle stage.

CREATE INDEX IF NOT EXISTS idx_competitors_venture_stage
  ON competitors (venture_id, lifecycle_stage);

-- ============================================================================
-- 5. COLUMN COMMENTS
-- ============================================================================

COMMENT ON COLUMN competitors.threat_level IS 'Competitive threat level: H(igh), M(edium), L(ow)';
COMMENT ON COLUMN competitors.pricing_model IS 'How the competitor monetizes their product';
COMMENT ON COLUMN competitors.market_position IS 'Free-text description of competitive market positioning';
COMMENT ON COLUMN competitors.swot IS 'Structured SWOT analysis: {strengths:[], weaknesses:[], opportunities:[], threats:[]}';
COMMENT ON COLUMN competitors.lifecycle_stage IS 'Business lifecycle stage: seed, growth, mature, declining';

-- ============================================================================
-- ROLLBACK (manual execution if needed):
-- ============================================================================
-- ALTER TABLE competitors DROP CONSTRAINT IF EXISTS chk_competitors_threat_level;
-- ALTER TABLE competitors DROP CONSTRAINT IF EXISTS chk_competitors_pricing_model;
-- ALTER TABLE competitors DROP CONSTRAINT IF EXISTS chk_competitors_lifecycle_stage;
-- ALTER TABLE competitors DROP CONSTRAINT IF EXISTS uq_competitors_venture_name;
-- DROP INDEX IF EXISTS idx_competitors_venture_stage;
-- ALTER TABLE competitors DROP COLUMN IF EXISTS threat_level;
-- ALTER TABLE competitors DROP COLUMN IF EXISTS pricing_model;
-- ALTER TABLE competitors DROP COLUMN IF EXISTS market_position;
-- ALTER TABLE competitors DROP COLUMN IF EXISTS swot;
-- ALTER TABLE competitors DROP COLUMN IF EXISTS lifecycle_stage;
-- ALTER TABLE competitors ALTER COLUMN venture_id DROP NOT NULL;
