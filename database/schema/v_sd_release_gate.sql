-- View: v_sd_release_gate
-- Purpose: Provides release gate status for Strategic Directives
-- Used by: ReleaseGateWidget component

CREATE OR REPLACE VIEW v_sd_release_gate AS
SELECT
    sd.id,
    sd.sd_key,
    sd.title,
    sd.status,
    sd.priority,
    sd.created_at,
    sd.updated_at,
    -- Gate status calculations
    CASE
        WHEN sd.status = 'completed' THEN 'passed'
        WHEN sd.status IN ('active', 'in_progress', 'pending_approval') THEN 'in_progress'
        WHEN sd.status IN ('blocked', 'failed') THEN 'failed'
        ELSE 'pending'
    END as gate_status,
    -- Release readiness
    CASE
        WHEN sd.status = 'completed' THEN true
        ELSE false
    END as release_ready,
    -- Calculate completion percentage
    COALESCE(
        (SELECT AVG(progress_percentage)
         FROM sd_progress_tracking
         WHERE sd_id = sd.id),
        0
    )::INTEGER as completion_percentage,
    -- Get latest phase
    (SELECT phase_name
     FROM sd_progress_tracking
     WHERE sd_id = sd.id
     ORDER BY updated_at DESC
     LIMIT 1) as current_phase,
    -- Count of associated PRDs
    (SELECT COUNT(*)
     FROM prds
     WHERE strategic_directive_id = sd.id) as prd_count,
    -- Count of completed PRDs
    (SELECT COUNT(*)
     FROM prds
     WHERE strategic_directive_id = sd.id
     AND status IN ('approved', 'completed')) as completed_prd_count,
    -- Metadata for release notes
    jsonb_build_object(
        'implementation_date', sd.updated_at,
        'business_value', sd.business_impact,
        'technical_complexity', sd.technical_complexity,
        'acceptance_criteria', sd.acceptance_criteria,
        'test_coverage', COALESCE(
            (SELECT AVG(COALESCE((metadata->>'test_coverage')::NUMERIC, 0))
             FROM prds
             WHERE strategic_directive_id = sd.id),
            0
        )
    ) as release_metadata
FROM strategic_directives_v2 sd
WHERE sd.status NOT IN ('draft', 'archived')
ORDER BY sd.priority DESC, sd.created_at DESC;

-- Grant appropriate permissions
GRANT SELECT ON v_sd_release_gate TO anon;
GRANT SELECT ON v_sd_release_gate TO authenticated;

-- Add comment
COMMENT ON VIEW v_sd_release_gate IS 'Release gate status view for Strategic Directives, used by the dashboard ReleaseGateWidget component';