-- Multi-Model Debate System Database Schema
-- SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B (FR-4)
--
-- Creates tables for storing debate transcripts, rounds, and outcomes
-- with proper indexing for queryability

BEGIN;

-- ============================================================================
-- PART 1: Create proposal_debates table
-- ============================================================================

CREATE TABLE IF NOT EXISTS proposal_debates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Debate configuration
  max_rounds INTEGER NOT NULL DEFAULT 3,
  actual_rounds INTEGER DEFAULT 0,
  consensus_threshold INTEGER DEFAULT 15, -- Score delta for consensus

  -- Consensus outcome
  consensus_reached BOOLEAN DEFAULT FALSE,
  consensus_reason TEXT,
  final_verdict TEXT CHECK (final_verdict IN ('approve', 'revise', 'reject')),
  final_score NUMERIC(5,2),

  -- Aggregated results
  top_issues JSONB DEFAULT '[]'::JSONB, -- Array of top 5 issues
  recommended_next_steps JSONB DEFAULT '[]'::JSONB,

  -- CONST-002 validation
  const_002_passed BOOLEAN,
  const_002_result JSONB,

  -- Error handling
  error_code TEXT,
  error_message TEXT,

  -- Correlation for logging
  correlation_id UUID DEFAULT gen_random_uuid(),

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT DEFAULT 'debate_orchestrator'
);

-- Indexes for proposal_debates
CREATE INDEX IF NOT EXISTS idx_proposal_debates_proposal_id ON proposal_debates(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_debates_status ON proposal_debates(status);
CREATE INDEX IF NOT EXISTS idx_proposal_debates_created_at ON proposal_debates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_debates_correlation_id ON proposal_debates(correlation_id);

-- Idempotency index: prevent duplicate debates for same proposal in running/completed state
CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_debates_idempotent
  ON proposal_debates(proposal_id)
  WHERE status IN ('running', 'completed');

-- ============================================================================
-- PART 2: Create proposal_debate_rounds table
-- ============================================================================

CREATE TABLE IF NOT EXISTS proposal_debate_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES proposal_debates(id) ON DELETE CASCADE,
  round_index INTEGER NOT NULL CHECK (round_index >= 0),

  -- Round metadata
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Persona outputs (one per persona per round)
  persona_outputs JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Structure: {
  --   "safety": { "verdict": "approve", "score": 85, "rationale": "...", "change_requests": [...], "provider": "anthropic", "model": "claude-3" },
  --   "value": { "verdict": "revise", "score": 70, "rationale": "...", "change_requests": [...], "provider": "openai", "model": "gpt-4" },
  --   "risk": { "verdict": "approve", "score": 80, "rationale": "...", "change_requests": [...], "provider": "google", "model": "gemini-pro" }
  -- }

  -- Orchestrator summary for this round (fed to next round)
  orchestrator_summary TEXT,

  -- Consensus check for this round
  consensus_check JSONB,
  -- Structure: { "checked": true, "reached": false, "reason": "score delta > 15" }

  -- Provider/model tracking for audit
  provider_calls JSONB DEFAULT '[]'::JSONB,
  -- Array of { "persona": "safety", "provider": "anthropic", "model": "claude-3", "duration_ms": 1234, "tokens_used": {...} }

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for proposal_debate_rounds
CREATE INDEX IF NOT EXISTS idx_debate_rounds_debate_id ON proposal_debate_rounds(debate_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_debate_rounds_debate_round ON proposal_debate_rounds(debate_id, round_index);

-- ============================================================================
-- PART 3: Update trigger for proposal_debates
-- ============================================================================

CREATE OR REPLACE FUNCTION update_proposal_debates_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_debates_updated ON proposal_debates;
CREATE TRIGGER trg_proposal_debates_updated
  BEFORE UPDATE ON proposal_debates
  FOR EACH ROW
  EXECUTE FUNCTION update_proposal_debates_timestamp();

-- ============================================================================
-- PART 4: RLS Policies
-- ============================================================================

ALTER TABLE proposal_debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_debate_rounds ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY proposal_debates_service_all ON proposal_debates
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY proposal_debate_rounds_service_all ON proposal_debate_rounds
  FOR ALL USING (auth.role() = 'service_role');

-- Authenticated users can read
CREATE POLICY proposal_debates_read ON proposal_debates
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY proposal_debate_rounds_read ON proposal_debate_rounds
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 5: Helper functions
-- ============================================================================

-- Function to get latest debate for a proposal
CREATE OR REPLACE FUNCTION get_latest_debate(p_proposal_id UUID)
RETURNS SETOF proposal_debates AS $$
  SELECT * FROM proposal_debates
  WHERE proposal_id = p_proposal_id
  ORDER BY created_at DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Function to check if debate can be created (idempotency)
CREATE OR REPLACE FUNCTION can_create_debate(p_proposal_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_existing proposal_debates%ROWTYPE;
BEGIN
  SELECT * INTO v_existing
  FROM proposal_debates
  WHERE proposal_id = p_proposal_id
    AND status IN ('running', 'completed')
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'can_create', false,
      'reason', 'existing_debate',
      'existing_debate_id', v_existing.id,
      'existing_status', v_existing.status
    );
  ELSE
    RETURN jsonb_build_object(
      'can_create', true,
      'reason', null
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration complete: proposal_debates tables created';
  RAISE NOTICE '  - proposal_debates: Main debate records';
  RAISE NOTICE '  - proposal_debate_rounds: Per-round persona outputs';
  RAISE NOTICE '  - Idempotency index: Prevents duplicate debates';
  RAISE NOTICE '  - RLS: Enabled with service/authenticated policies';
END $$;
