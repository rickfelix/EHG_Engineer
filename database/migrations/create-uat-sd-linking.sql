-- Create UAT Finding Actions table for linking UAT results to Strategic Directives
-- This table tracks when UAT test failures are converted to Strategic Directives

CREATE TABLE IF NOT EXISTS uat_finding_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uat_result_id UUID,
    uat_case_id TEXT,
    uat_run_id UUID,
    directive_submission_id UUID REFERENCES directive_submissions(id) ON DELETE CASCADE,
    action_type VARCHAR(50), -- 'strategic_directive', 'backlog_item', 'bug_report', etc.
    action_id TEXT, -- SD ID or other identifier
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_uat_finding_actions_result
    ON uat_finding_actions(uat_result_id);

CREATE INDEX IF NOT EXISTS idx_uat_finding_actions_submission
    ON uat_finding_actions(directive_submission_id);

CREATE INDEX IF NOT EXISTS idx_uat_finding_actions_case
    ON uat_finding_actions(uat_case_id);

CREATE INDEX IF NOT EXISTS idx_uat_finding_actions_run
    ON uat_finding_actions(uat_run_id);

CREATE INDEX IF NOT EXISTS idx_uat_finding_actions_created
    ON uat_finding_actions(created_at DESC);

-- Add RLS policies if needed
ALTER TABLE uat_finding_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON uat_finding_actions
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users" ON uat_finding_actions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON uat_finding_actions
    FOR UPDATE USING (true);

-- Add comment to table
COMMENT ON TABLE uat_finding_actions IS 'Links UAT test results to Strategic Directives or other action items generated from test failures';
COMMENT ON COLUMN uat_finding_actions.action_type IS 'Type of action taken: strategic_directive, backlog_item, bug_report, etc.';
COMMENT ON COLUMN uat_finding_actions.action_id IS 'ID of the created item (e.g., SD-2025-001-UAT-A)';
COMMENT ON COLUMN uat_finding_actions.metadata IS 'Additional metadata including AI confidence scores, conversion details, etc.';