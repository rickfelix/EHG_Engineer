-- ==============================================================================
-- COMPLIANCE EXPERIMENT TRACKING TABLES
-- ==============================================================================
-- SD: SD-LEO-REFAC-COMPLIANCE-EXP-001
-- Date: 2026-01-24
--
-- Creates tables to track LEO Protocol compliance metrics:
-- 1. Protocol file reads (CLAUDE.md files)
-- 2. Context continuity checkpoints
-- 3. Experiment compliance scores
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- TABLE 1: Protocol File Reads
-- Tracks when CLAUDE_*.md files are read during workflow
-- ==============================================================================

CREATE TABLE IF NOT EXISTS protocol_file_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR(50) NOT NULL,
    file_name VARCHAR(100) NOT NULL,  -- e.g., 'CLAUDE_CORE.md', 'CLAUDE_LEAD.md'
    phase VARCHAR(50),                 -- Current phase when file was read
    session_id VARCHAR(100),           -- Claude session identifier
    read_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Index for queries
    CONSTRAINT fk_protocol_file_reads_sd
        FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id)
);

CREATE INDEX IF NOT EXISTS idx_protocol_file_reads_sd_id
    ON protocol_file_reads(sd_id);

CREATE INDEX IF NOT EXISTS idx_protocol_file_reads_file_name
    ON protocol_file_reads(file_name);

-- ==============================================================================
-- TABLE 2: Context Continuity Checkpoints
-- Tracks context state before/after compaction
-- ==============================================================================

CREATE TABLE IF NOT EXISTS context_continuity_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR(50) NOT NULL,
    checkpoint_type VARCHAR(50) NOT NULL,  -- 'pre_compaction', 'post_compaction'
    session_id VARCHAR(100),
    context_summary TEXT,                   -- Summarized context
    preserved_fields JSONB,                 -- Key fields that should be preserved
    verified BOOLEAN DEFAULT FALSE,         -- Was continuity verified?
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_context_checkpoints_sd
        FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id)
);

CREATE INDEX IF NOT EXISTS idx_context_checkpoints_sd_id
    ON context_continuity_checkpoints(sd_id);

-- ==============================================================================
-- TABLE 3: Compliance Scores
-- Stores calculated compliance scores for each SD
-- ==============================================================================

CREATE TABLE IF NOT EXISTS compliance_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR(50) NOT NULL UNIQUE,
    experiment_id VARCHAR(50),            -- Parent orchestrator
    protocol_files_score INTEGER DEFAULT 0,  -- /20
    handoffs_score INTEGER DEFAULT 0,        -- /25
    context_score INTEGER DEFAULT 0,         -- /20
    sub_agents_score INTEGER DEFAULT 0,      -- /20
    workflow_score INTEGER DEFAULT 0,        -- /15
    total_score INTEGER GENERATED ALWAYS AS (
        protocol_files_score + handoffs_score + context_score +
        sub_agents_score + workflow_score
    ) STORED,
    rating VARCHAR(20) GENERATED ALWAYS AS (
        CASE
            WHEN protocol_files_score + handoffs_score + context_score +
                 sub_agents_score + workflow_score >= 90 THEN 'Excellent'
            WHEN protocol_files_score + handoffs_score + context_score +
                 sub_agents_score + workflow_score >= 80 THEN 'Good'
            WHEN protocol_files_score + handoffs_score + context_score +
                 sub_agents_score + workflow_score >= 70 THEN 'Fair'
            WHEN protocol_files_score + handoffs_score + context_score +
                 sub_agents_score + workflow_score >= 60 THEN 'Poor'
            ELSE 'Critical'
        END
    ) STORED,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,

    CONSTRAINT fk_compliance_scores_sd
        FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_scores_experiment_id
    ON compliance_scores(experiment_id);

-- ==============================================================================
-- VIEW: Experiment Compliance Summary
-- ==============================================================================

CREATE OR REPLACE VIEW v_experiment_compliance_summary AS
SELECT
    cs.experiment_id,
    COUNT(*) as child_count,
    AVG(cs.total_score) as avg_score,
    COUNT(*) FILTER (WHERE cs.total_score >= 80) as passing_count,
    SUM(cs.handoffs_score) / 6.25 as total_handoffs,
    MIN(cs.total_score) as min_score,
    MAX(cs.total_score) as max_score,
    CASE
        WHEN AVG(cs.total_score) >= 85 AND
             COUNT(*) FILTER (WHERE cs.total_score >= 80) = COUNT(*)
        THEN 'EXPERIMENT_PASSED'
        ELSE 'EXPERIMENT_FAILED'
    END as experiment_result
FROM compliance_scores cs
WHERE cs.experiment_id IS NOT NULL
GROUP BY cs.experiment_id;

-- ==============================================================================
-- RLS Policies
-- ==============================================================================

ALTER TABLE protocol_file_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_continuity_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_scores ENABLE ROW LEVEL SECURITY;

-- Service role access
CREATE POLICY service_role_all_protocol_file_reads ON protocol_file_reads
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_context_checkpoints ON context_continuity_checkpoints
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_compliance_scores ON compliance_scores
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated read access
CREATE POLICY authenticated_read_protocol_file_reads ON protocol_file_reads
    FOR SELECT TO authenticated USING (true);

CREATE POLICY authenticated_read_context_checkpoints ON context_continuity_checkpoints
    FOR SELECT TO authenticated USING (true);

CREATE POLICY authenticated_read_compliance_scores ON compliance_scores
    FOR SELECT TO authenticated USING (true);

DO $$ BEGIN RAISE NOTICE '✓ Compliance experiment tracking tables created'; END $$;

COMMIT;
