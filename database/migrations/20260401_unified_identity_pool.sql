-- Migration: Unified Identity Pool — Extend specialist_registry for Dynamic Board Seats
-- SD: SD-LEO-INFRA-INTELLIGENT-DYNAMIC-BOARD-001-A
-- Purpose: Add authority scoring, governance floor, legacy lineage, expertise domains,
--          and outcome tracking columns. Seed 6 founding C-suite identities.

BEGIN;

-- ============================================================
-- 1. Schema Extensions (idempotent — IF NOT EXISTS / safe ADD)
-- ============================================================

-- Authority score: 0-100, used by panel selector to weight identity selection
ALTER TABLE specialist_registry
  ADD COLUMN IF NOT EXISTS authority_score NUMERIC(5,2) DEFAULT 50.00;

-- Governance floor: identities that MUST be included in every panel regardless of topic
ALTER TABLE specialist_registry
  ADD COLUMN IF NOT EXISTS is_governance_floor BOOLEAN DEFAULT false;

-- Legacy agent code: maps to historical debate_arguments.agent_code for memory continuity
ALTER TABLE specialist_registry
  ADD COLUMN IF NOT EXISTS legacy_agent_code TEXT;

-- Expertise domains: array of topic keywords for relevance matching
ALTER TABLE specialist_registry
  ADD COLUMN IF NOT EXISTS expertise_domains TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Outcome tracking columns for authority feedback loop
ALTER TABLE specialist_registry
  ADD COLUMN IF NOT EXISTS total_deliberations INTEGER DEFAULT 0;

ALTER TABLE specialist_registry
  ADD COLUMN IF NOT EXISTS outcome_wins INTEGER DEFAULT 0;

ALTER TABLE specialist_registry
  ADD COLUMN IF NOT EXISTS outcome_losses INTEGER DEFAULT 0;

ALTER TABLE specialist_registry
  ADD COLUMN IF NOT EXISTS last_selected_at TIMESTAMPTZ;

-- ============================================================
-- 2. Seed 6 Founding C-Suite Identities
-- ============================================================
-- Uses UPSERT on role to be idempotent. Founding identities get
-- elevated authority_score (70 vs default 50) for initial selection advantage.

INSERT INTO specialist_registry (name, role, expertise, context, metadata, authority_score, is_governance_floor, legacy_agent_code, expertise_domains)
VALUES
  (
    'CSO', 'cso',
    'Portfolio alignment, strategic timing, vision fit',
    'Chief Strategy Officer — evaluates brainstorm topics through the lens of strategic alignment, timing, portfolio balance, and opportunity cost.',
    '{"source": "founding-identity", "topicDomain": "strategy"}'::jsonb,
    70.00, false, 'CSO',
    ARRAY['strategy', 'portfolio', 'timing', 'vision', 'alignment']
  ),
  (
    'CRO', 'cro',
    'Financial, technical, regulatory risk exposure',
    'Chief Risk Officer — evaluates blast radius, cascading failures, financial exposure, and regulatory risk.',
    '{"source": "founding-identity", "topicDomain": "risk"}'::jsonb,
    70.00, true, 'CRO',
    ARRAY['risk', 'financial', 'regulatory', 'compliance', 'exposure']
  ),
  (
    'CTO', 'cto',
    'Architecture, feasibility, capability graph',
    'Chief Technology Officer — evaluates existing capabilities, real build cost, architecture fit, and technical debt.',
    '{"source": "founding-identity", "topicDomain": "technology"}'::jsonb,
    70.00, false, 'CTO',
    ARRAY['architecture', 'feasibility', 'capability', 'technical-debt', 'build-cost']
  ),
  (
    'CISO', 'ciso',
    'Data safety, compliance, agent behavior governance',
    'Chief Information Security Officer — evaluates attack surface, data exposure, RLS, agent behavior, and constitutional compliance.',
    '{"source": "founding-identity", "topicDomain": "security"}'::jsonb,
    70.00, true, 'CISO',
    ARRAY['security', 'data-safety', 'agent-governance', 'constitutional', 'compliance']
  ),
  (
    'COO', 'coo',
    'Execution health, velocity, resource allocation',
    'Chief Operating Officer — evaluates current workload, delivery capacity, execution complexity, and operational dependencies.',
    '{"source": "founding-identity", "topicDomain": "operations"}'::jsonb,
    70.00, false, 'COO',
    ARRAY['execution', 'velocity', 'resource-allocation', 'delivery', 'operations']
  ),
  (
    'CFO', 'cfo',
    'Cost analysis, ROI, budget constraints, unit economics',
    'Chief Financial Officer — evaluates compute cost, development time, maintenance burden, ROI, and unit economics.',
    '{"source": "founding-identity", "topicDomain": "finance"}'::jsonb,
    70.00, false, 'CFO',
    ARRAY['cost', 'roi', 'budget', 'unit-economics', 'financial-analysis']
  )
ON CONFLICT (role) DO UPDATE SET
  authority_score = EXCLUDED.authority_score,
  is_governance_floor = EXCLUDED.is_governance_floor,
  legacy_agent_code = EXCLUDED.legacy_agent_code,
  expertise_domains = EXCLUDED.expertise_domains,
  context = EXCLUDED.context,
  metadata = EXCLUDED.metadata;

COMMIT;
