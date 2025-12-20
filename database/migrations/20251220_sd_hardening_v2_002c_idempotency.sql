-- ============================================================================
-- SD-HARDENING-V2-002C: Idempotency & Persistence
-- ============================================================================
-- Applied: 2025-12-20
-- Status: APPLIED (run via psql)
--
-- Changes:
--   1. Added idempotency_key column to venture_stage_transitions
--   2. Added UNIQUE index on (venture_id, idempotency_key)
--   3. Created pending_ceo_handoffs table for persistence
--   4. Created helper functions for handoff management
--   5. Updated fn_advance_venture_stage with idempotency support
-- ============================================================================

-- Note: This migration was applied directly via psql.
-- Documented here for reference.

-- ALTER TABLE venture_stage_transitions ADD COLUMN IF NOT EXISTS idempotency_key UUID;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_venture_stage_transitions_idempotency
--   ON venture_stage_transitions(venture_id, idempotency_key)
--   WHERE idempotency_key IS NOT NULL;

-- CREATE TABLE pending_ceo_handoffs (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
--   handoff_type VARCHAR(50) DEFAULT 'stage_transition',
--   from_stage INTEGER NOT NULL,
--   to_stage INTEGER NOT NULL,
--   vp_agent_id TEXT,
--   handoff_data JSONB DEFAULT '{}'::jsonb,
--   status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),
--   proposed_at TIMESTAMPTZ DEFAULT NOW(),
--   reviewed_by TEXT,
--   reviewed_at TIMESTAMPTZ,
--   review_notes TEXT,
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   updated_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- Helper functions:
-- fn_create_pending_handoff(p_venture_id, p_from_stage, p_to_stage, p_vp_agent_id, p_handoff_data)
-- fn_resolve_pending_handoff(p_handoff_id, p_status, p_reviewed_by, p_review_notes)
-- fn_get_pending_handoffs(p_venture_id)

-- fn_advance_venture_stage updated with p_idempotency_key parameter

-- See venture-state-machine.js for JavaScript implementation
