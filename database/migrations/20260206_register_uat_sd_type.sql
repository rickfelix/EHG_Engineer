/**
 * Migration: Register UAT SD Type
 * Date: 2026-02-06
 * SD: CORRECTIVE-UAT-TYPE-REGISTRATION
 *
 * ROOT CAUSE: SD-UAT-CAMPAIGN-001 children have sd_type='qa', but 'qa' type
 * was never registered in sd_stream_requirements or 12 other reference points.
 * This caused orchestrator-preflight to default to feature-level requirements.
 *
 * CORRECTIVE ACTION:
 * 1. Add 'uat' to sd_type CHECK constraint
 * 2. Rename all existing 'qa' SDs → 'uat'
 * 3. Add 'uat' rows to sd_stream_requirements with appropriate UAT campaign values
 *
 * PREVENTIVE ACTION: Documented 13 reference points in MEMORY.md for future types
 */

BEGIN;

-- ============================================================================
-- PART 0: Update CHECK constraint to include all existing types plus 'uat'
-- ============================================================================

-- Drop all possible check constraints on sd_type
ALTER TABLE strategic_directives_v2 DROP CONSTRAINT IF EXISTS sd_type_check;
ALTER TABLE strategic_directives_v2 DROP CONSTRAINT IF EXISTS strategic_directives_v2_sd_type_check;

-- Add new constraint including ALL types currently in database plus 'uat'
ALTER TABLE strategic_directives_v2 ADD CONSTRAINT sd_type_check CHECK (
  sd_type IN (
    -- Core types
    'feature', 'bugfix', 'database', 'infrastructure', 'security',
    'refactor', 'documentation', 'orchestrator', 'performance', 'enhancement',
    -- Additional types found in database
    'docs', 'discovery_spike', 'implementation', 'ux_debt',
    -- Transition types (qa will be renamed to uat)
    'qa', 'uat'
  )
);

-- ============================================================================
-- PART 1: Rename existing 'qa' SDs to 'uat'
-- ============================================================================

-- Disable type change governance triggers temporarily for bulk migration
ALTER TABLE strategic_directives_v2 DISABLE TRIGGER trg_enforce_sd_type_change_explanation;
ALTER TABLE strategic_directives_v2 DISABLE TRIGGER trg_enforce_sd_type_change_governance;
ALTER TABLE strategic_directives_v2 DISABLE TRIGGER trg_enforce_sd_type_change_risk;
ALTER TABLE strategic_directives_v2 DISABLE TRIGGER trg_enforce_type_change_timing;

-- Update sd_type from qa → uat
UPDATE strategic_directives_v2
SET
  sd_type = 'uat',
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{type_change_reason}',
    '"Root cause fix: renaming qa → uat for proper SD type registration. UAT campaigns are about test execution, not QA review."'::jsonb
  )
WHERE sd_type = 'qa';

-- Re-enable triggers
ALTER TABLE strategic_directives_v2 ENABLE TRIGGER trg_enforce_sd_type_change_explanation;
ALTER TABLE strategic_directives_v2 ENABLE TRIGGER trg_enforce_sd_type_change_governance;
ALTER TABLE strategic_directives_v2 ENABLE TRIGGER trg_enforce_sd_type_change_risk;
ALTER TABLE strategic_directives_v2 ENABLE TRIGGER trg_enforce_type_change_timing;

-- Expected: 20 rows updated (verified via temp_check_streams.mjs)

-- ============================================================================
-- PART 1.5: Remove 'qa' from CHECK constraint now that all rows are updated
-- ============================================================================

ALTER TABLE strategic_directives_v2 DROP CONSTRAINT sd_type_check;

ALTER TABLE strategic_directives_v2 ADD CONSTRAINT sd_type_check CHECK (
  sd_type IN (
    -- Core types
    'feature', 'bugfix', 'database', 'infrastructure', 'security',
    'refactor', 'documentation', 'orchestrator', 'performance', 'enhancement',
    -- Additional types
    'docs', 'discovery_spike', 'implementation', 'ux_debt',
    -- UAT (renamed from qa)
    'uat'
  )
);

-- ============================================================================
-- PART 2: Register 'uat' in sd_stream_requirements
-- ============================================================================

-- UAT campaigns are about RUNNING manual tests, not building features
-- Key characteristics:
-- - No PRD needed (test scenarios ARE the work product)
-- - E2E not required (these ARE the tests)
-- - Minimal handoffs (1-2)
-- - Lower gate threshold (~70%)
-- - Most streams marked 'skip' or 'optional'

-- Design streams (all skip - UAT campaigns don't design, they execute)
INSERT INTO sd_stream_requirements (sd_type, stream_name, stream_category, requirement_level, minimum_depth, conditional_keywords, validation_sub_agent, description)
VALUES
  ('uat', 'ui_design', 'design', 'skip', NULL, NULL, NULL, 'UAT campaigns execute against existing UI, do not design new UI'),
  ('uat', 'ux_design', 'design', 'skip', NULL, NULL, NULL, 'UAT campaigns execute against existing UX, do not design new UX'),
  ('uat', 'data_models', 'architecture', 'skip', NULL, NULL, NULL, 'UAT campaigns do not create data models'),
  ('uat', 'api_design', 'architecture', 'skip', NULL, NULL, NULL, 'UAT campaigns test existing APIs, do not design new APIs'),
  ('uat', 'security_design', 'architecture', 'skip', NULL, NULL, NULL, 'UAT campaigns test security, do not design security architecture'),
  ('uat', 'performance_design', 'architecture', 'skip', NULL, NULL, NULL, 'UAT campaigns may check performance, but do not design performance systems'),
  ('uat', 'technical_setup', 'architecture', 'skip', NULL, NULL, NULL, 'UAT campaigns use existing technical setup'),
  ('uat', 'information_architecture', 'architecture', 'optional', NULL, NULL, NULL, 'Optional: UAT may document information architecture findings');

-- Expected: 8 rows inserted (one per stream)

COMMIT;
