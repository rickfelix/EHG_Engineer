-- Production Pilot Seed Data
-- Creates a pilot SD and PRD for testing story generation
-- Run this AFTER all migrations in production

-- ========================================
-- 1. Create pilot Strategic Directive
-- ========================================

INSERT INTO strategic_directives_v2 (
    id,
    legacy_id,
    title,
    version,
    status,
    category,
    priority,
    description,
    rationale,
    scope,
    strategic_objectives,
    success_criteria,
    created_by,
    metadata
) VALUES (
    'SD-2025-PILOT-001',
    'SD-2025-PILOT-001',
    'Production Pilot: User Story System',
    '1.0',
    'active',
    'infrastructure',
    'high',
    'Production pilot for automated user story generation and verification tracking',
    'Validate story system in production with controlled rollout',
    'Story generation, verification tracking, release gate monitoring',
    '["Test story generation in production", "Validate CI webhook integration", "Monitor release gate accuracy"]'::jsonb,
    '["Stories generated successfully", "CI updates working", "Gates calculating correctly"]'::jsonb,
    'prod-pilot',
    '{"pilot": true, "gates_enabled": false, "created_at": "2025-01-17"}'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET
    status = 'active',
    metadata = strategic_directives_v2.metadata || jsonb_build_object('pilot_updated', NOW()::text)
RETURNING id;

-- ========================================
-- 2. Create pilot PRD with acceptance criteria
-- ========================================

INSERT INTO product_requirements_v2 (
    id,
    directive_id,
    title,
    version,
    status,
    category,
    priority,
    executive_summary,
    functional_requirements,
    acceptance_criteria,
    phase,
    created_by,
    metadata
) VALUES (
    'PRD-PILOT-001',
    'SD-2025-PILOT-001',
    'User Story System Production Pilot',
    '1.0',
    'approved',
    'infrastructure',
    'high',
    'Production pilot to validate story generation and verification pipeline',
    '[
        "Generate stories from PRD acceptance criteria",
        "Track story verification via CI webhooks",
        "Calculate release readiness percentage",
        "Display metrics on dashboard"
    ]'::jsonb,
    '[
        {
            "title": "Story generation creates unique keys",
            "description": "Each story must have a deterministic unique key",
            "priority": "critical"
        },
        {
            "title": "CI webhook updates story status",
            "description": "Webhook endpoint receives and processes CI results",
            "priority": "high"
        },
        {
            "title": "Release gate calculates passing percentage",
            "description": "Gate shows accurate pass/fail ratio",
            "priority": "high"
        },
        {
            "title": "Dashboard displays real-time metrics",
            "description": "UI shows current story verification status",
            "priority": "medium"
        },
        {
            "title": "DLQ processes failed updates",
            "description": "Failed webhook calls are retried from DLQ",
            "priority": "low"
        }
    ]'::jsonb,
    'planning',
    'prod-pilot',
    '{"pilot": true, "expected_stories": 5}'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET
    status = 'approved',
    metadata = product_requirements_v2.metadata || jsonb_build_object('ready_for_generation', true)
RETURNING id;

-- ========================================
-- 3. Verify pilot data
-- ========================================

DO $$
DECLARE
    v_sd_count INTEGER;
    v_prd_count INTEGER;
    v_criteria_count INTEGER;
BEGIN
    -- Check SD created
    SELECT COUNT(*) INTO v_sd_count
    FROM strategic_directives_v2
    WHERE id = 'SD-2025-PILOT-001';

    -- Check PRD created
    SELECT COUNT(*) INTO v_prd_count
    FROM product_requirements_v2
    WHERE id = 'PRD-PILOT-001';

    -- Check acceptance criteria
    SELECT jsonb_array_length(acceptance_criteria) INTO v_criteria_count
    FROM product_requirements_v2
    WHERE id = 'PRD-PILOT-001';

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'PRODUCTION PILOT SEED DATA';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Strategic Directive: % created', CASE WHEN v_sd_count > 0 THEN 'YES' ELSE 'NO' END;
    RAISE NOTICE 'Product Requirements: % created', CASE WHEN v_prd_count > 0 THEN 'YES' ELSE 'NO' END;
    RAISE NOTICE 'Acceptance Criteria: % items', v_criteria_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Ready for story generation:';
    RAISE NOTICE 'SELECT * FROM fn_generate_stories_from_prd(''SD-2025-PILOT-001'', ''PRD-PILOT-001'', ''dry_run'');';
    RAISE NOTICE '========================================';
END $$;