-- Migration: Create learning_decisions table for LEO Protocol Self-Improvement
-- Date: 2026-01-09
-- Description: Tracks surfaced learnings, user decisions, and rollback metadata.

CREATE TABLE IF NOT EXISTS learning_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_mode TEXT NOT NULL, -- 'learn', 'learn_insights'
    sd_id UUID REFERENCES strategic_directives_v2(id),
    
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

-- View to track recurrence of patterns after an improvement was applied
CREATE OR REPLACE VIEW v_learning_recurrence_monitor AS
SELECT 
    ld.id as decision_id,
    ld.sd_id as application_sd_id,
    pme.pattern_id,
    pme.matched_at as recurrence_at,
    pme.sd_id as recurrence_sd_id
FROM 
    learning_decisions ld,
    jsonb_array_elements(ld.improvements_applied) ia_id,
    pattern_match_events pme
WHERE 
    ld.status = 'COMPLETED'
    AND pme.matched_at > ld.created_at;

COMMENT ON TABLE learning_decisions IS 'Tracks all /learn command actions, findings, and user approvals to close the feedback loop on organizational learning.';
