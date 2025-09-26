-- Progress Reconciliation System
-- Ensures calculated progress and database status stay synchronized
-- Acts as quality gate to catch missing steps (testing, docs, UI quality)

-- Add reconciliation tracking fields to strategic_directives_v2
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT 'synchronized';
-- Values: 'synchronized', 'mismatch_detected', 'remediation_in_progress', 'resolved'

ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS reconciliation_report JSONB;
-- Stores what's missing, what actions were taken, and justifications

-- Add index for quick mismatch queries
CREATE INDEX IF NOT EXISTS idx_sd_reconciliation_status
ON strategic_directives_v2(reconciliation_status)
WHERE reconciliation_status != 'synchronized';

-- Create audit table for reconciliation history
CREATE TABLE IF NOT EXISTS progress_reconciliation_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sd_id TEXT REFERENCES strategic_directives_v2(id),
    detected_at TIMESTAMP DEFAULT NOW(),
    db_status TEXT,
    db_progress INTEGER,
    calculated_progress INTEGER,
    missing_items JSONB,
    actions_taken JSONB,
    resolved_at TIMESTAMP,
    resolved_by TEXT,
    resolution_type TEXT, -- 'auto_remediated', 'manual_override', 'data_fixed'
    justification TEXT
);

-- Function to detect progress mismatches
CREATE OR REPLACE FUNCTION detect_progress_mismatch()
RETURNS TABLE(
    sd_id TEXT,
    sd_title TEXT,
    db_status TEXT,
    db_progress INTEGER,
    mismatch_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.title,
        s.status,
        s.progress,
        CASE
            WHEN s.status IN ('completed', 'archived') AND s.progress < 100 THEN 'incomplete_marked_complete'
            WHEN s.status = 'active' AND s.progress = 100 THEN 'complete_marked_active'
            WHEN s.status = 'archived' AND s.metadata->>'completion_percentage' != s.progress::TEXT THEN 'metadata_mismatch'
            ELSE 'other'
        END as mismatch_type
    FROM strategic_directives_v2 s
    WHERE
        (s.status IN ('completed', 'archived') AND s.progress < 100) OR
        (s.status = 'active' AND s.progress = 100) OR
        (s.metadata->>'completion_percentage' IS NOT NULL
         AND (s.metadata->>'completion_percentage')::INTEGER != s.progress);
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-detect mismatches on status change
CREATE OR REPLACE FUNCTION check_progress_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- If marking as complete but progress < 100, flag for reconciliation
    IF NEW.status IN ('completed', 'archived') AND
       (NEW.progress IS NULL OR NEW.progress < 100) THEN
        NEW.reconciliation_status = 'mismatch_detected';
        NEW.reconciliation_report = jsonb_build_object(
            'detected_at', NOW(),
            'reason', 'Status marked complete but progress not 100%',
            'previous_progress', NEW.progress,
            'requires_review', true
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_check_progress_on_status_change ON strategic_directives_v2;
CREATE TRIGGER trigger_check_progress_on_status_change
    BEFORE UPDATE OF status ON strategic_directives_v2
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION check_progress_on_status_change();

-- View for dashboard to show mismatches
CREATE OR REPLACE VIEW v_progress_mismatches AS
SELECT
    s.id,
    s.title,
    s.status,
    s.progress as db_progress,
    s.reconciliation_status,
    s.reconciliation_report,
    s.target_application,
    p.id as prd_id,
    CASE
        WHEN s.reconciliation_status = 'mismatch_detected' THEN 'warning'
        WHEN s.reconciliation_status = 'remediation_in_progress' THEN 'info'
        WHEN s.reconciliation_status = 'resolved' THEN 'success'
        ELSE 'none'
    END as alert_level
FROM strategic_directives_v2 s
LEFT JOIN prds p ON p.directive_id = s.id
WHERE s.reconciliation_status != 'synchronized'
ORDER BY
    CASE s.reconciliation_status
        WHEN 'mismatch_detected' THEN 1
        WHEN 'remediation_in_progress' THEN 2
        WHEN 'resolved' THEN 3
        ELSE 4
    END,
    s.updated_at DESC;

-- Helper function to mark manual override with justification
CREATE OR REPLACE FUNCTION mark_complete_with_justification(
    p_sd_id TEXT,
    p_justification TEXT,
    p_user TEXT DEFAULT 'system'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_progress INTEGER;
BEGIN
    -- Get current progress
    SELECT progress INTO v_current_progress
    FROM strategic_directives_v2
    WHERE id = p_sd_id;

    -- Update SD with justification
    UPDATE strategic_directives_v2
    SET
        status = 'completed',
        reconciliation_status = 'resolved',
        reconciliation_report = jsonb_build_object(
            'manual_override', true,
            'justification', p_justification,
            'progress_at_override', v_current_progress,
            'override_by', p_user,
            'override_at', NOW()
        ),
        updated_at = NOW()
    WHERE id = p_sd_id;

    -- Log to history
    INSERT INTO progress_reconciliation_history (
        sd_id,
        db_status,
        db_progress,
        calculated_progress,
        resolved_at,
        resolved_by,
        resolution_type,
        justification
    ) VALUES (
        p_sd_id,
        'completed',
        100,
        v_current_progress,
        NOW(),
        p_user,
        'manual_override',
        p_justification
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT SELECT ON v_progress_mismatches TO authenticated;
GRANT SELECT, INSERT ON progress_reconciliation_history TO authenticated;
GRANT EXECUTE ON FUNCTION detect_progress_mismatch() TO authenticated;
GRANT EXECUTE ON FUNCTION mark_complete_with_justification(TEXT, TEXT, TEXT) TO authenticated;