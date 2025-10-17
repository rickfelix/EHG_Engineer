-- Seed Data for User Story Testing
-- Run this AFTER the compatibility script

-- ========================================
-- 1. Create or update test SD
-- ========================================

-- Insert SD-2025-09-EMB if it doesn't exist
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
    'SD-2025-09-EMB',  -- Using ID as the key since that's the PK
    'SD-2025-09-EMB',  -- Also set legacy_id for consistency
    'EHG Backlog Import and Story Management',
    '1.0',
    'active',
    'engineering',
    'high',
    'Comprehensive backlog import system with user story verification and release gates',
    'Enable automated story generation and verification tracking for release readiness',
    'Backlog import, story generation, verification tracking, release gate calculations',
    '["Implement comprehensive backlog management", "Enable story verification", "Automate release gates"]'::jsonb,
    '["All stories tracked", "80% test coverage", "Release gates functional"]'::jsonb,
    'seed-script',
    '{"test": true, "purpose": "story-demo"}'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET
    status = 'active',
    priority = 'high',
    metadata = strategic_directives_v2.metadata || jsonb_build_object('updated', NOW()::text)
RETURNING id;

-- ========================================
-- 2. Create PRD with acceptance criteria
-- ========================================

-- Create a PRD for the SD with proper acceptance criteria
-- Note: product_requirements_v2 uses 'directive_id' not 'strategic_directive_id'
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
    test_scenarios,
    acceptance_criteria,
    validation_checklist,
    phase,
    created_by,
    metadata
) VALUES (
    'PRD-EMB-001',
    'SD-2025-09-EMB',  -- References the SD id
    'Backlog Import and Story Management System',
    '1.0',
    'approved',
    'engineering',
    'high',
    'Complete system for importing, managing, and verifying backlog items with automated story generation',
    '[
        "Import backlog items from CSV",
        "Generate stories from acceptance criteria",
        "Track verification status",
        "Calculate release gates"
    ]'::jsonb,
    '[]'::jsonb,  -- Empty test scenarios (we'll use acceptance_criteria)
    '[
        "User can import backlog items from CSV with validation",
        "System detects and prevents duplicate backlog items",
        "Real-time import progress is displayed to users",
        "Users can export backlog to CSV, JSON, and PDF formats",
        "Story verification status is tracked and displayed",
        "Automated story generation creates unique deterministic keys",
        "Release gate shows percentage of stories passing",
        "Dashboard displays real-time verification metrics"
    ]'::jsonb,
    '[]'::jsonb,  -- Empty validation checklist
    'planning',
    'seed-script',
    '{"test": true, "for_demo": "story-generation"}'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET
    acceptance_criteria = EXCLUDED.acceptance_criteria,
    metadata = product_requirements_v2.metadata || jsonb_build_object('updated', NOW()::text)
RETURNING id;

-- ========================================
-- 3. Display what we created
-- ========================================

-- Show the PRD we created
SELECT
    'Test PRD Created' as status,
    id as prd_id,
    directive_id as sd_id,
    title,
    jsonb_array_length(acceptance_criteria) as criteria_count
FROM product_requirements_v2
WHERE id = 'PRD-EMB-001';

-- Verify the mapping views work
SELECT
    'SD Mapping' as check_type,
    sd_id,
    sd_key,
    title
FROM v_sd_keys
WHERE sd_key = 'SD-2025-09-EMB';

-- Verify PRD acceptance view
SELECT
    'PRD Acceptance' as check_type,
    prd_id,
    sd_key,
    prd_title,
    jsonb_array_length(acceptance_jsonb) as criteria_count
FROM v_prd_acceptance
WHERE prd_id = 'PRD-EMB-001';

-- ========================================
-- Instructions for next steps
-- ========================================
/*
NEXT STEPS:
-----------

1. DRY RUN - Preview story generation:

SELECT * FROM fn_generate_stories_from_prd(
    'SD-2025-09-EMB',
    'PRD-EMB-001',
    'dry_run'
);

2. UPSERT - Actually create the stories:

SELECT * FROM fn_generate_stories_from_prd(
    'SD-2025-09-EMB',
    'PRD-EMB-001',
    'upsert'
);

3. VERIFY - Check what was created:

-- View generated stories
SELECT * FROM v_story_verification_status
WHERE sd_key = 'SD-2025-09-EMB'
ORDER BY sequence_no
LIMIT 10;

-- Check release gate
SELECT * FROM v_sd_release_gate
WHERE sd_key = 'SD-2025-09-EMB';

-- Check for duplicates
SELECT sd_id, COUNT(*) c, COUNT(DISTINCT backlog_id) d
FROM sd_backlog_map
WHERE sd_id = 'SD-2025-09-EMB'
GROUP BY sd_id
HAVING COUNT(*) <> COUNT(DISTINCT backlog_id);

4. UPDATE VERIFICATION - Simulate test results:

-- Mark some stories as passing
UPDATE sd_backlog_map
SET
    verification_status = 'passing',
    last_verified_at = NOW(),
    coverage_pct = 85,
    verification_source = '{"test_run": "manual", "build": "123"}'::jsonb
WHERE sd_id = 'SD-2025-09-EMB'
AND story_key IS NOT NULL
AND sequence_no <= 3;

-- Check gate again
SELECT * FROM v_sd_release_gate
WHERE sd_key = 'SD-2025-09-EMB';

*/