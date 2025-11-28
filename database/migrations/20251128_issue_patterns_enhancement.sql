-- LEO Protocol v4.3.2 - Issue Patterns Enhancement Migration
-- SD: Continuation of LEO v4.3.2 development work
--
-- This migration adds:
-- 1. resolution_date and resolution_notes columns to issue_patterns
-- 2. pattern_subagent_mapping table for bidirectional tracking
-- 3. Additional indexes for pattern lifecycle management

BEGIN;

-- ============================================================================
-- PHASE 1: ADD RESOLUTION COLUMNS TO ISSUE_PATTERNS
-- ============================================================================

-- Add resolution_date column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'issue_patterns' AND column_name = 'resolution_date'
    ) THEN
        ALTER TABLE issue_patterns ADD COLUMN resolution_date TIMESTAMPTZ;
        COMMENT ON COLUMN issue_patterns.resolution_date IS 'Date when the pattern root cause was resolved';
    END IF;
END $$;

-- Add resolution_notes column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'issue_patterns' AND column_name = 'resolution_notes'
    ) THEN
        ALTER TABLE issue_patterns ADD COLUMN resolution_notes TEXT;
        COMMENT ON COLUMN issue_patterns.resolution_notes IS 'Notes explaining how the root cause was resolved';
    END IF;
END $$;

-- ============================================================================
-- PHASE 2: CREATE PATTERN-SUBAGENT MAPPING TABLE
-- ============================================================================

-- Create pattern_subagent_mapping table for explicit bidirectional tracking
-- Note: trigger_id references leo_sub_agent_triggers.id which is UUID (not SERIAL)
CREATE TABLE IF NOT EXISTS pattern_subagent_mapping (
    id SERIAL PRIMARY KEY,
    pattern_id VARCHAR(50) NOT NULL, -- e.g., PAT-RETROACTIVE-001
    sub_agent_code VARCHAR(50) NOT NULL, -- e.g., qa-engineering-director
    mapping_type VARCHAR(20) NOT NULL CHECK (mapping_type IN ('category', 'keyword', 'manual')),
    trigger_phrase VARCHAR(500), -- If this mapping creates a trigger, what phrase?
    trigger_id UUID, -- References leo_sub_agent_triggers(id) - UUID type, soft reference for flexibility
    confidence DECIMAL(3,2) DEFAULT 1.0, -- How confident is this mapping (0.0-1.0)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(pattern_id, sub_agent_code)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pattern_subagent_mapping_pattern ON pattern_subagent_mapping(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_subagent_mapping_subagent ON pattern_subagent_mapping(sub_agent_code);
CREATE INDEX IF NOT EXISTS idx_pattern_subagent_mapping_type ON pattern_subagent_mapping(mapping_type);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_pattern_subagent_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pattern_subagent_mapping_updated ON pattern_subagent_mapping;
CREATE TRIGGER trigger_pattern_subagent_mapping_updated
    BEFORE UPDATE ON pattern_subagent_mapping
    FOR EACH ROW
    EXECUTE FUNCTION update_pattern_subagent_mapping_updated_at();

-- RLS policies for pattern_subagent_mapping
ALTER TABLE pattern_subagent_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon users can read pattern_subagent_mapping"
    ON pattern_subagent_mapping FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "Authenticated users can manage pattern_subagent_mapping"
    ON pattern_subagent_mapping FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- PHASE 3: ADD ADDITIONAL INDEX FOR LIFECYCLE MANAGEMENT
-- ============================================================================

-- Index for staleness detection (updated_at + status)
CREATE INDEX IF NOT EXISTS idx_issue_patterns_lifecycle
    ON issue_patterns(updated_at, status) WHERE status != 'resolved';

-- Index for resolution queries
CREATE INDEX IF NOT EXISTS idx_issue_patterns_resolution
    ON issue_patterns(resolution_date) WHERE resolution_date IS NOT NULL;

-- ============================================================================
-- PHASE 4: CREATE VIEW FOR PATTERN-SUBAGENT RELATIONSHIPS
-- ============================================================================

CREATE OR REPLACE VIEW pattern_subagent_summary AS
SELECT
    ip.pattern_id,
    ip.category,
    ip.severity,
    ip.issue_summary,
    ip.status,
    ip.trend,
    ip.occurrence_count,
    ip.related_sub_agents,
    COALESCE(
        (SELECT array_agg(DISTINCT psm.sub_agent_code)
         FROM pattern_subagent_mapping psm
         WHERE psm.pattern_id = ip.pattern_id),
        ip.related_sub_agents
    ) AS all_related_subagents,
    (SELECT COUNT(*) FROM pattern_subagent_mapping psm WHERE psm.pattern_id = ip.pattern_id) AS mapping_count,
    (SELECT COUNT(*) FROM pattern_subagent_mapping psm WHERE psm.pattern_id = ip.pattern_id AND psm.trigger_id IS NOT NULL) AS trigger_count
FROM issue_patterns ip
WHERE ip.status = 'active'
ORDER BY ip.occurrence_count DESC;

COMMENT ON VIEW pattern_subagent_summary IS 'Summary of patterns with their related sub-agents and trigger mappings';

-- ============================================================================
-- PHASE 5: SEED INITIAL MAPPINGS FROM EXISTING related_sub_agents
-- ============================================================================

-- Populate pattern_subagent_mapping from existing related_sub_agents arrays
INSERT INTO pattern_subagent_mapping (pattern_id, sub_agent_code, mapping_type, confidence)
SELECT DISTINCT
    ip.pattern_id,
    unnest(ip.related_sub_agents) as sub_agent_code,
    'category' as mapping_type,
    0.8 as confidence -- Category-based mappings have 80% confidence
FROM issue_patterns ip
WHERE ip.related_sub_agents IS NOT NULL
  AND array_length(ip.related_sub_agents, 1) > 0
ON CONFLICT (pattern_id, sub_agent_code) DO NOTHING;

-- ============================================================================
-- PHASE 6: VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_resolution_cols INTEGER;
    v_mapping_count INTEGER;
    v_patterns_with_mappings INTEGER;
BEGIN
    -- Check resolution columns
    SELECT COUNT(*) INTO v_resolution_cols
    FROM information_schema.columns
    WHERE table_name = 'issue_patterns'
      AND column_name IN ('resolution_date', 'resolution_notes');

    -- Count mappings
    SELECT COUNT(*) INTO v_mapping_count FROM pattern_subagent_mapping;

    -- Count patterns with mappings
    SELECT COUNT(DISTINCT pattern_id) INTO v_patterns_with_mappings
    FROM pattern_subagent_mapping;

    RAISE NOTICE '======================================';
    RAISE NOTICE 'Issue Patterns Enhancement Migration';
    RAISE NOTICE '======================================';
    RAISE NOTICE 'Resolution columns added: %/2', v_resolution_cols;
    RAISE NOTICE 'Pattern-subagent mappings: %', v_mapping_count;
    RAISE NOTICE 'Patterns with mappings: %', v_patterns_with_mappings;
    RAISE NOTICE '======================================';
END $$;

COMMIT;
