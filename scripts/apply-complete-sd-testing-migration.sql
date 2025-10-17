-- =====================================================
-- SD Testing Status - Complete Migration Script
-- SD-TEST-001: Strategic Directive Testing Work-Down Plan
-- Created: 2025-10-05
-- Database: dedlbzhpgkmetvhbkyzq (EHG_Engineer)
-- =====================================================

-- =====================================================
-- STEP 1: CREATE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS sd_testing_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR(50) NOT NULL UNIQUE REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

    -- Testing status
    tested BOOLEAN NOT NULL DEFAULT false,
    test_pass_rate NUMERIC(5,2) CHECK (test_pass_rate >= 0 AND test_pass_rate <= 100),
    test_count INTEGER DEFAULT 0 CHECK (test_count >= 0),
    tests_passed INTEGER DEFAULT 0 CHECK (tests_passed >= 0),
    tests_failed INTEGER DEFAULT 0 CHECK (tests_failed >= 0),

    -- Test execution details
    last_tested_at TIMESTAMP,
    test_duration_seconds INTEGER,
    test_framework VARCHAR(50), -- 'playwright', 'vitest', 'manual', etc.

    -- Test evidence
    screenshot_paths JSONB DEFAULT '[]'::jsonb, -- Array of screenshot file paths
    test_results JSONB DEFAULT '{}'::jsonb, -- Detailed test results
    testing_notes TEXT,

    -- Sub-agent integration
    testing_sub_agent_used BOOLEAN DEFAULT false,
    user_stories_sub_agent_used BOOLEAN DEFAULT false,
    sub_agent_results JSONB DEFAULT '{}'::jsonb,

    -- Prioritization for work-down plan
    testing_priority INTEGER DEFAULT 0, -- Calculated from SD priority + sequence
    next_in_queue BOOLEAN DEFAULT false,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),

    -- Constraints
    CONSTRAINT valid_pass_count CHECK (tests_passed <= test_count),
    CONSTRAINT valid_fail_count CHECK (tests_failed <= test_count),
    CONSTRAINT valid_total_tests CHECK (tests_passed + tests_failed = test_count)
);

-- =====================================================
-- STEP 2: CREATE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_sd_testing_status_sd_id ON sd_testing_status(sd_id);
CREATE INDEX IF NOT EXISTS idx_sd_testing_status_tested ON sd_testing_status(tested);
CREATE INDEX IF NOT EXISTS idx_sd_testing_status_priority ON sd_testing_status(testing_priority DESC);
CREATE INDEX IF NOT EXISTS idx_sd_testing_status_next_in_queue ON sd_testing_status(next_in_queue) WHERE next_in_queue = true;

-- =====================================================
-- STEP 3: CREATE FUNCTIONS
-- =====================================================

-- Function: update_sd_testing_status_updated_at
-- Automatically updates the updated_at timestamp
CREATE OR REPLACE FUNCTION update_sd_testing_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: calculate_testing_priority
-- Calculates numeric testing priority from SD priority and sequence rank
CREATE OR REPLACE FUNCTION calculate_testing_priority(p_sd_id VARCHAR)
RETURNS INTEGER AS $$
DECLARE
    v_priority_score INTEGER := 0;
    v_sd_priority VARCHAR;
    v_sequence_rank INTEGER;
BEGIN
    -- Get SD priority and sequence
    SELECT priority, sequence_rank
    INTO v_sd_priority, v_sequence_rank
    FROM strategic_directives_v2
    WHERE id = p_sd_id;

    -- Priority scoring: critical=100, high=75, medium=50, low=25
    v_priority_score := CASE v_sd_priority
        WHEN 'critical' THEN 100
        WHEN 'high' THEN 75
        WHEN 'medium' THEN 50
        WHEN 'low' THEN 25
        ELSE 0
    END;

    -- Add sequence rank (lower sequence = higher priority)
    -- Invert sequence_rank so lower numbers = higher score
    v_priority_score := v_priority_score + (1000 - COALESCE(v_sequence_rank, 1000));

    RETURN v_priority_score;
END;
$$ LANGUAGE plpgsql;

-- Function: auto_calculate_testing_priority
-- Trigger function to auto-calculate testing_priority on insert/update
CREATE OR REPLACE FUNCTION auto_calculate_testing_priority()
RETURNS TRIGGER AS $$
BEGIN
    NEW.testing_priority := calculate_testing_priority(NEW.sd_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 4: CREATE TRIGGERS
-- =====================================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_update_sd_testing_status_updated_at ON sd_testing_status;
DROP TRIGGER IF EXISTS trigger_auto_calculate_testing_priority ON sd_testing_status;

-- Trigger: update updated_at timestamp
CREATE TRIGGER trigger_update_sd_testing_status_updated_at
    BEFORE UPDATE ON sd_testing_status
    FOR EACH ROW
    EXECUTE FUNCTION update_sd_testing_status_updated_at();

-- Trigger: auto-calculate testing_priority
CREATE TRIGGER trigger_auto_calculate_testing_priority
    BEFORE INSERT OR UPDATE ON sd_testing_status
    FOR EACH ROW
    EXECUTE FUNCTION auto_calculate_testing_priority();

-- =====================================================
-- STEP 5: CREATE VIEW
-- =====================================================

-- View: v_untested_sds
-- Work-down plan showing untested SDs prioritized by priority and sequence rank
CREATE OR REPLACE VIEW v_untested_sds AS
SELECT
    sd.id,
    sd.sd_key,
    sd.title,
    sd.status,
    sd.priority,
    sd.sequence_rank,
    sd.category,
    sd.target_application,
    sd.current_phase,
    sd.progress,
    COALESCE(ts.tested, false) as tested,
    COALESCE(ts.test_pass_rate, 0) as test_pass_rate,
    COALESCE(ts.test_count, 0) as test_count,
    ts.last_tested_at,
    COALESCE(ts.testing_priority, calculate_testing_priority(sd.id)) as testing_priority,
    -- Work-down plan: rank untested SDs by priority
    RANK() OVER (
        PARTITION BY COALESCE(ts.tested, false)
        ORDER BY COALESCE(ts.testing_priority, calculate_testing_priority(sd.id)) DESC
    ) as work_down_rank
FROM strategic_directives_v2 sd
LEFT JOIN sd_testing_status ts ON sd.id = ts.sd_id
WHERE sd.status IN ('active', 'in_progress', 'pending_approval', 'completed')
ORDER BY testing_priority DESC;

-- =====================================================
-- STEP 6: GRANT PERMISSIONS
-- =====================================================

GRANT SELECT ON v_untested_sds TO anon;
GRANT SELECT ON v_untested_sds TO authenticated;
GRANT ALL ON sd_testing_status TO anon;
GRANT ALL ON sd_testing_status TO authenticated;

-- =====================================================
-- STEP 7: ADD COMMENTS (Documentation)
-- =====================================================

COMMENT ON TABLE sd_testing_status IS 'Tracks testing status for Strategic Directives. Prevents duplicate testing and provides work-down plan visualization.';
COMMENT ON VIEW v_untested_sds IS 'Work-down plan view showing untested SDs prioritized by priority and sequence rank.';
COMMENT ON FUNCTION calculate_testing_priority(VARCHAR) IS 'Calculates numeric testing priority from SD priority (critical/high/medium/low) and sequence_rank.';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- To verify this migration worked, run:
-- SELECT COUNT(*) FROM sd_testing_status;
-- SELECT * FROM v_untested_sds LIMIT 5;
