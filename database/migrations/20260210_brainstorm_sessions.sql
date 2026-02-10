-- Migration: Brainstorm Sessions and Question Effectiveness Tracking
-- SD: SD-LEO-FEAT-EXPAND-BRAINSTORM-COMMAND-001
-- Created: 2026-02-10
-- Purpose: Create schema for brainstorm session tracking, question interaction analytics, and outcome classification
-- Tables: brainstorm_sessions, brainstorm_question_interactions, brainstorm_question_effectiveness
--
-- Context: This migration supports the expansion of the /brainstorm CLI command to track:
-- - Multi-domain brainstorming (venture, protocol, integration, architecture)
-- - Question-answer interaction patterns for effectiveness measurement
-- - Session outcomes (SD creation, quick-fix, consideration-only, etc.)
-- - Cross-venture capability matching
-- - Quality scoring and crystallization metrics for retrospective analysis

-- ============================================================================
-- Table: brainstorm_sessions
-- Purpose: Track brainstorming sessions across all domains with outcome classification
-- ============================================================================
CREATE TABLE IF NOT EXISTS brainstorm_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Session classification
    domain TEXT NOT NULL CHECK (domain IN ('venture', 'protocol', 'integration', 'architecture')),
    topic TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'conversational' CHECK (mode IN ('conversational', 'structured')),

    -- Venture-specific context (only for domain='venture')
    stage TEXT CHECK (stage IN ('ideation', 'validation', 'mvp', 'growth', 'scale')),
    venture_ids UUID[] DEFAULT '{}',
    cross_venture BOOLEAN DEFAULT false,

    -- Capability matching results
    capabilities_status TEXT NOT NULL DEFAULT 'not_checked'
        CHECK (capabilities_status IN ('matched', 'unavailable', 'not_checked', 'empty')),
    matched_capabilities JSONB DEFAULT '[]',
    new_capability_candidates JSONB DEFAULT '[]',

    -- Outcome classification
    outcome_type TEXT CHECK (outcome_type IN (
        'sd_created',               -- Resulted in Strategic Directive creation
        'quick_fix',                -- Resulted in quick-fix ticket
        'no_action',                -- Informational/research only
        'consideration_only',       -- Idea captured for future consideration
        'needs_triage',             -- Requires further evaluation
        'conflict',                 -- Conflicts with existing plans/architecture
        'significant_departure'     -- Requires architectural/strategic review
    )),
    outcome_auto_classified BOOLEAN DEFAULT false,
    conflict_flag BOOLEAN DEFAULT false,

    -- Quality metrics for retrospective analysis
    session_quality_score NUMERIC(4,3) CHECK (session_quality_score BETWEEN 0 AND 1),
    crystallization_score NUMERIC(4,3) CHECK (crystallization_score BETWEEN 0 AND 1),

    -- Retrospective integration
    retrospective_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (retrospective_status IN ('pending', 'completed', 'queued', 'failed')),

    -- Artifacts and references
    document_path TEXT,
    created_sd_id TEXT,  -- References strategic_directives_v2.sd_key if SD was created

    -- Metadata (extensible for future fields)
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for brainstorm_sessions
CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_domain ON brainstorm_sessions(domain);
CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_outcome ON brainstorm_sessions(outcome_type);
CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_conflict ON brainstorm_sessions(conflict_flag) WHERE conflict_flag = true;
CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_retro_pending ON brainstorm_sessions(retrospective_status) WHERE retrospective_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_venture_ids ON brainstorm_sessions USING GIN (venture_ids);
CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_created_sd ON brainstorm_sessions(created_sd_id) WHERE created_sd_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_created_at ON brainstorm_sessions(created_at DESC);

-- Comment explaining purpose
COMMENT ON TABLE brainstorm_sessions IS 'Tracks brainstorming sessions across domains (venture, protocol, integration, architecture) with outcome classification, quality metrics, and capability matching. Used for question effectiveness analysis and retrospective integration.';

-- ============================================================================
-- Table: brainstorm_question_interactions
-- Purpose: Track user responses to individual questions for effectiveness measurement
-- ============================================================================
CREATE TABLE IF NOT EXISTS brainstorm_question_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign key to session
    session_id UUID NOT NULL REFERENCES brainstorm_sessions(id) ON DELETE CASCADE,

    -- Question identification
    question_id TEXT NOT NULL,  -- e.g., 'protocol.discovery.problem', 'venture.ideation.market'
    domain TEXT NOT NULL,
    phase TEXT NOT NULL,        -- Phase within domain workflow

    -- Interaction outcome
    outcome TEXT NOT NULL CHECK (outcome IN ('answered', 'skipped', 'revised')),
    answer_length INTEGER DEFAULT 0,
    revised_count INTEGER DEFAULT 0,  -- Number of times user revised their answer

    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for brainstorm_question_interactions
CREATE INDEX IF NOT EXISTS idx_brainstorm_q_interactions_session ON brainstorm_question_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_brainstorm_q_interactions_question ON brainstorm_question_interactions(question_id);
CREATE INDEX IF NOT EXISTS idx_brainstorm_q_interactions_outcome ON brainstorm_question_interactions(outcome);
CREATE INDEX IF NOT EXISTS idx_brainstorm_q_interactions_domain ON brainstorm_question_interactions(domain);

COMMENT ON TABLE brainstorm_question_interactions IS 'Tracks individual question-answer interactions during brainstorm sessions. Used to measure question effectiveness (skip rates, answer quality, revision patterns) and optimize question flows.';

-- ============================================================================
-- Table: brainstorm_question_effectiveness
-- Purpose: Aggregate effectiveness metrics per question across all sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS brainstorm_question_effectiveness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Question identification
    domain TEXT NOT NULL,
    question_id TEXT NOT NULL,

    -- Effectiveness metrics
    effectiveness_score NUMERIC(5,3) DEFAULT 0.5 CHECK (effectiveness_score BETWEEN 0 AND 1),
    total_sessions INTEGER DEFAULT 0,
    answered_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    avg_answer_length NUMERIC(8,1) DEFAULT 0,
    led_to_action_count INTEGER DEFAULT 0,  -- Sessions where outcome was sd_created or quick_fix

    -- Timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Unique constraint
    UNIQUE(domain, question_id)
);

-- Indexes for brainstorm_question_effectiveness
CREATE INDEX IF NOT EXISTS idx_brainstorm_q_effectiveness_domain ON brainstorm_question_effectiveness(domain);
CREATE INDEX IF NOT EXISTS idx_brainstorm_q_effectiveness_score ON brainstorm_question_effectiveness(effectiveness_score DESC);
CREATE INDEX IF NOT EXISTS idx_brainstorm_q_effectiveness_skip_rate ON brainstorm_question_effectiveness((CASE WHEN total_sessions > 0 THEN skipped_count::NUMERIC / total_sessions ELSE 0 END) DESC);

COMMENT ON TABLE brainstorm_question_effectiveness IS 'Aggregates question effectiveness metrics across all sessions. Used to identify high-value vs low-value questions, optimize question ordering, and refine domain-specific brainstorm workflows.';

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- brainstorm_sessions
ALTER TABLE brainstorm_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_brainstorm_sessions ON brainstorm_sessions;
DROP POLICY IF EXISTS manage_brainstorm_sessions ON brainstorm_sessions;
CREATE POLICY select_brainstorm_sessions ON brainstorm_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY manage_brainstorm_sessions ON brainstorm_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- brainstorm_question_interactions
ALTER TABLE brainstorm_question_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_brainstorm_q_interactions ON brainstorm_question_interactions;
DROP POLICY IF EXISTS manage_brainstorm_q_interactions ON brainstorm_question_interactions;
CREATE POLICY select_brainstorm_q_interactions ON brainstorm_question_interactions FOR SELECT TO authenticated USING (true);
CREATE POLICY manage_brainstorm_q_interactions ON brainstorm_question_interactions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- brainstorm_question_effectiveness
ALTER TABLE brainstorm_question_effectiveness ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_brainstorm_q_effectiveness ON brainstorm_question_effectiveness;
DROP POLICY IF EXISTS manage_brainstorm_q_effectiveness ON brainstorm_question_effectiveness;
CREATE POLICY select_brainstorm_q_effectiveness ON brainstorm_question_effectiveness FOR SELECT TO authenticated USING (true);
CREATE POLICY manage_brainstorm_q_effectiveness ON brainstorm_question_effectiveness FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Trigger Function for updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_brainstorm_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for brainstorm_sessions.updated_at
DROP TRIGGER IF EXISTS trg_brainstorm_sessions_updated ON brainstorm_sessions;
CREATE TRIGGER trg_brainstorm_sessions_updated
  BEFORE UPDATE ON brainstorm_sessions
  FOR EACH ROW EXECUTE FUNCTION update_brainstorm_updated_at();

-- Trigger for brainstorm_question_effectiveness.updated_at
DROP TRIGGER IF EXISTS trg_brainstorm_q_effectiveness_updated ON brainstorm_question_effectiveness;
CREATE TRIGGER trg_brainstorm_q_effectiveness_updated
  BEFORE UPDATE ON brainstorm_question_effectiveness
  FOR EACH ROW EXECUTE FUNCTION update_brainstorm_updated_at();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- 1. Created brainstorm_sessions table with multi-domain support (venture/protocol/integration/architecture)
-- 2. Added outcome classification (sd_created, quick_fix, consideration_only, etc.)
-- 3. Added capability matching fields (matched_capabilities, new_capability_candidates)
-- 4. Added quality metrics (session_quality_score, crystallization_score)
-- 5. Created brainstorm_question_interactions table for per-question tracking
-- 6. Created brainstorm_question_effectiveness table for aggregate question analytics
-- 7. Added appropriate indexes for common query patterns
-- 8. Added RLS policies (SELECT for authenticated, ALL for service_role)
-- 9. Created updated_at triggers for brainstorm_sessions and brainstorm_question_effectiveness
-- 10. Added table comments explaining purpose and usage
