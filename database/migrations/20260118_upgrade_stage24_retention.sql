-- SD-LIFECYCLE-GAP-001: Customer Success & Retention Engineering
-- Upgrade Stage 24 from artifact_only to sd_required with retention infrastructure

-- =============================================================================
-- MIGRATION: Upgrade Stage 24 - Analytics, Feedback & Retention
-- =============================================================================
-- Purpose: Address missing customer success infrastructure in 25-stage model
-- Author: LEO Protocol EXEC Agent
-- Date: 2026-01-18
-- SD Reference: SD-LIFECYCLE-GAP-001
-- Parent SD: SD-LIFECYCLE-GAP-000 (Venture Lifecycle Gap Remediation)
-- =============================================================================

BEGIN;

-- Step 1: Update Stage 24 work_type from artifact_only to sd_required
-- This ensures ventures must complete a retention infrastructure SD before Stage 24
UPDATE lifecycle_stage_config
SET
    stage_name = 'Analytics, Feedback & Retention',
    description = 'Analytics implementation, feedback collection, metric tracking, and customer retention infrastructure. Ventures must implement health scoring, churn prediction triggers, and retention programs.',
    work_type = 'sd_required',
    sd_required = true,
    sd_suffix = 'RETENTION',
    required_artifacts = ARRAY['analytics_dashboard', 'health_scoring_system', 'churn_triggers', 'retention_playbook'],
    metadata = jsonb_build_object(
        'retention_requirements', jsonb_build_object(
            'health_scoring', jsonb_build_object(
                'required', true,
                'description', 'Customer health score calculation (0-100)',
                'inputs', ARRAY['usage_frequency', 'feature_adoption', 'support_tickets', 'payment_history']
            ),
            'churn_triggers', jsonb_build_object(
                'required', true,
                'description', 'Automated alerts when customer health drops',
                'minimum_triggers', 5,
                'example_triggers', ARRAY['usage_drop_30pct', 'no_login_14days', 'support_ticket_spike', 'payment_fail', 'downgrade_request']
            ),
            'retention_playbook', jsonb_build_object(
                'required', true,
                'description', 'Intervention procedures for at-risk customers',
                'sections', ARRAY['early_warning', 'escalation_paths', 'win_back_campaigns']
            )
        ),
        'success_metrics', jsonb_build_object(
            'target_nrr', '>120%',
            'target_monthly_churn', '<5%',
            'health_coverage', '100%'
        ),
        'upgraded_by_sd', 'SD-LIFECYCLE-GAP-001',
        'upgraded_at', NOW()
    ),
    updated_at = NOW()
WHERE stage_number = 24;

-- Step 2: Verify the update
DO $$
DECLARE
    v_work_type TEXT;
    v_sd_required BOOLEAN;
BEGIN
    SELECT work_type, sd_required INTO v_work_type, v_sd_required
    FROM lifecycle_stage_config
    WHERE stage_number = 24;

    IF v_work_type != 'sd_required' OR v_sd_required != true THEN
        RAISE EXCEPTION 'Stage 24 upgrade verification failed: work_type=%, sd_required=%', v_work_type, v_sd_required;
    END IF;

    RAISE NOTICE 'Stage 24 successfully upgraded to sd_required';
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERY (Run after migration)
-- =============================================================================
-- SELECT
--     stage_number,
--     stage_name,
--     work_type,
--     sd_required,
--     sd_suffix,
--     required_artifacts,
--     metadata->'retention_requirements' as retention_requirements
-- FROM lifecycle_stage_config
-- WHERE stage_number = 24;
