-- Migration: Create learning_decisions table for LEO Protocol Self-Improvement
-- Date: 2026-01-09
-- Description: Tracks surfaced learnings, user decisions, and rollback metadata.

CREATE TABLE IF NOT EXISTS learning_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_mode TEXT NOT NULL, -- 'learn', 'learn_insights'
    sd_id TEXT REFERENCES strategic_directives_v2(id), -- VARCHAR to match SD table

    -- Snapshot of what was shown to the user
    surfaced_patterns JSONB DEFAULT '[]',
    surfaced_lessons JSONB DEFAULT '[]',
    surfaced_improvements JSONB DEFAULT '[]',

    -- Decisions and outcomes
    user_decisions JSONB DEFAULT '{}', -- { improvement_id: 'APPROVED' | 'REJECTED', reason: '...' }
    rejection_feedback JSONB DEFAULT '{}', -- Detailed feedback on why items were rejected

    -- Execution and Rollback
    improvements_applied JSONB DEFAULT '[]', -- List of improvement IDs that were actually executed
    execution_log JSONB DEFAULT '[]', -- Step-by-step log of what was changed
    rollback_payload JSONB DEFAULT '{}', -- Data required to undo the changes

    status TEXT DEFAULT 'PENDING', -- PENDING, COMPLETED, ROLLED_BACK
    confidence_score INTEGER, -- 0-100 score of relevance

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for searching decisions by SD
CREATE INDEX IF NOT EXISTS idx_learning_decisions_sd_id ON learning_decisions(sd_id);

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_learning_decisions_status ON learning_decisions(status);

-- View for insights: approval rates by category
CREATE OR REPLACE VIEW v_learning_decision_stats AS
SELECT
    command_mode,
    status,
    COUNT(*) as decision_count,
    AVG(confidence_score) as avg_confidence,
    DATE_TRUNC('day', created_at) as decision_date
FROM learning_decisions
GROUP BY command_mode, status, DATE_TRUNC('day', created_at);

COMMENT ON TABLE learning_decisions IS 'Tracks all /learn command actions, findings, and user approvals to close the feedback loop on organizational learning.';
