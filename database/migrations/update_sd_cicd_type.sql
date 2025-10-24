-- ============================================================================
-- UPDATE SD-CICD-WORKFLOW-FIX TO sd_type='infrastructure'
-- ============================================================================
-- Purpose: Mark SD-CICD-WORKFLOW-FIX as infrastructure SD for testing
-- SD: SD-INFRA-VALIDATION
-- Date: 2025-10-22
-- ============================================================================
-- MIGRATION: Update specific SD to infrastructure type for regression testing
-- RATIONALE: SD-CICD-WORKFLOW-FIX is a CI/CD infrastructure SD (no UI/E2E tests)
-- ============================================================================

-- Update SD-CICD-WORKFLOW-FIX to infrastructure type
UPDATE strategic_directives_v2
SET sd_type = 'infrastructure',
    updated_at = NOW()
WHERE id = 'SD-CICD-WORKFLOW-FIX';

-- Add comment documenting the change
COMMENT ON TABLE strategic_directives_v2 IS 'Strategic Directives with type classification. SD-CICD-WORKFLOW-FIX marked as infrastructure (no UI components, CI/CD only).';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Verify SD-CICD-WORKFLOW-FIX has infrastructure type:
-- SELECT id, title, sd_type, updated_at
-- FROM strategic_directives_v2
-- WHERE id = 'SD-CICD-WORKFLOW-FIX';
--
-- Expected: sd_type = 'infrastructure'
-- ============================================================================
