-- Migration: Add identity columns to specialist_registry for dynamic board seats
-- SD: SD-LEO-INFRA-INTELLIGENT-DYNAMIC-BOARD-001-A
-- Purpose: Unified identity schema — merge board seat data into specialist_registry

-- Step 1: Add new columns (IF NOT EXISTS for idempotency)
ALTER TABLE specialist_registry ADD COLUMN IF NOT EXISTS authority_score NUMERIC(5,2) DEFAULT 50.00;
ALTER TABLE specialist_registry ADD COLUMN IF NOT EXISTS is_governance_floor BOOLEAN DEFAULT false;
ALTER TABLE specialist_registry ADD COLUMN IF NOT EXISTS legacy_agent_code TEXT;
ALTER TABLE specialist_registry ADD COLUMN IF NOT EXISTS expertise_domains TEXT[] DEFAULT '{}';
ALTER TABLE specialist_registry ADD COLUMN IF NOT EXISTS total_deliberations INTEGER DEFAULT 0;
ALTER TABLE specialist_registry ADD COLUMN IF NOT EXISTS outcome_wins INTEGER DEFAULT 0;
ALTER TABLE specialist_registry ADD COLUMN IF NOT EXISTS outcome_losses INTEGER DEFAULT 0;
ALTER TABLE specialist_registry ADD COLUMN IF NOT EXISTS last_selected_at TIMESTAMPTZ;

-- Step 2: Seed 6 founding C-suite identities
-- Uses ON CONFLICT (role) DO UPDATE to be idempotent and preserve existing data
INSERT INTO specialist_registry (name, role, expertise, legacy_agent_code, expertise_domains, is_governance_floor, authority_score, metadata)
VALUES
  (
    'Chief Strategy Officer',
    'CSO',
    'Portfolio alignment, timing, vision fit',
    'CSO',
    ARRAY['strategy', 'portfolio', 'vision', 'okrs', 'timing'],
    false,
    50.00,
    '{"source": "board-seats", "standing_question": "Does this move EHG forward or sideways?"}'::jsonb
  ),
  (
    'Chief Risk Officer',
    'CRO',
    'Financial, technical, regulatory exposure',
    'CRO',
    ARRAY['risk', 'financial', 'regulatory', 'compliance', 'exposure'],
    true,
    50.00,
    '{"source": "board-seats", "standing_question": "What''s the blast radius if this fails?"}'::jsonb
  ),
  (
    'Chief Technology Officer',
    'CTO',
    'Architecture, feasibility, capability graph',
    'CTO',
    ARRAY['architecture', 'feasibility', 'infrastructure', 'build-cost', 'tech-debt'],
    false,
    50.00,
    '{"source": "board-seats", "standing_question": "What do we already have? What''s the real build cost?"}'::jsonb
  ),
  (
    'Chief Information Security Officer',
    'CISO',
    'Data safety, compliance, agent behavior',
    'CISO',
    ARRAY['security', 'data-safety', 'rls', 'compliance', 'agent-governance'],
    true,
    50.00,
    '{"source": "board-seats", "standing_question": "What attack surface does this create?"}'::jsonb
  ),
  (
    'Chief Operating Officer',
    'COO',
    'Execution health, velocity, resource allocation',
    'COO',
    ARRAY['operations', 'execution', 'velocity', 'capacity', 'delivery'],
    false,
    50.00,
    '{"source": "board-seats", "standing_question": "Can we actually deliver this given current load?"}'::jsonb
  ),
  (
    'Chief Financial Officer',
    'CFO',
    'Cost, ROI, budget constraints, unit economics',
    'CFO',
    ARRAY['finance', 'roi', 'cost', 'budget', 'unit-economics'],
    false,
    50.00,
    '{"source": "board-seats", "standing_question": "What does this cost and what''s the return?"}'::jsonb
  )
ON CONFLICT (role) DO UPDATE SET
  legacy_agent_code = EXCLUDED.legacy_agent_code,
  expertise_domains = EXCLUDED.expertise_domains,
  is_governance_floor = EXCLUDED.is_governance_floor,
  metadata = specialist_registry.metadata || EXCLUDED.metadata,
  updated_at = NOW();

COMMENT ON COLUMN specialist_registry.authority_score IS 'Specialist credibility score (0-100), used for panel selection weighting';
COMMENT ON COLUMN specialist_registry.is_governance_floor IS 'When true, specialist must always participate in deliberations';
COMMENT ON COLUMN specialist_registry.legacy_agent_code IS 'Maps to original BOARD_SEATS code (CSO, CRO, CTO, CISO, COO, CFO)';
COMMENT ON COLUMN specialist_registry.expertise_domains IS 'Searchable domain tags for topic-based panel selection';
COMMENT ON COLUMN specialist_registry.total_deliberations IS 'Count of deliberations this specialist has participated in';
COMMENT ON COLUMN specialist_registry.outcome_wins IS 'Count of deliberations where specialist position was adopted';
COMMENT ON COLUMN specialist_registry.outcome_losses IS 'Count of deliberations where specialist position was not adopted';
COMMENT ON COLUMN specialist_registry.last_selected_at IS 'Timestamp of last panel selection for recency-based balancing';
