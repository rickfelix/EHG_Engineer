-- Migration: Add gate2_exempt_sections column to sd_type_validation_profiles
-- Purpose: Allow SD types to declare which Gate 2 sections are exempt (not applicable)
-- This enables UI-only features to skip database validation sections without penalty

-- Add the column
ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS gate2_exempt_sections TEXT[] DEFAULT '{}';

-- Add comment explaining the column
COMMENT ON COLUMN sd_type_validation_profiles.gate2_exempt_sections IS
'Array of Gate 2 section codes that are exempt for this SD type. Exempt sections award full points without validation. Valid codes: B1_migrations, B2_rls, B3_complexity, C1_queries, D2_migration_tests';

-- Create the frontend SD type with database exemptions
INSERT INTO sd_type_validation_profiles (
  sd_type,
  lead_weight,
  plan_weight,
  exec_weight,
  verify_weight,
  final_weight,
  requires_prd,
  requires_deliverables,
  requires_e2e_tests,
  requires_retrospective,
  requires_sub_agents,
  min_handoffs,
  description,
  gate2_exempt_sections,
  requires_user_stories,
  requires_human_verifiable_outcome,
  human_verification_type,
  requires_uat_execution
) VALUES (
  'frontend',
  20, 20, 30, 15, 15,
  true, true, true, true, true, 4,
  'Pure frontend/UI work - no database migrations required. Focus on component implementation and E2E tests. Database validation sections (B1, B2, C1, D2) are exempt.',
  ARRAY['B1_migrations', 'B2_rls', 'C1_queries', 'D2_migration_tests'],
  true, true, 'ui_smoke_test', true
)
ON CONFLICT (sd_type) DO UPDATE SET
  gate2_exempt_sections = EXCLUDED.gate2_exempt_sections,
  description = EXCLUDED.description;

-- Update existing bugfix type to also have exemptions (typically no migrations)
UPDATE sd_type_validation_profiles
SET gate2_exempt_sections = ARRAY['B1_migrations', 'B2_rls', 'D2_migration_tests']
WHERE sd_type = 'bugfix';

-- Update infrastructure type - may have migrations but no UI
UPDATE sd_type_validation_profiles
SET gate2_exempt_sections = ARRAY['A_design', 'C2_form_integration']
WHERE sd_type = 'infrastructure';

-- Verify the changes
SELECT sd_type, gate2_exempt_sections, description
FROM sd_type_validation_profiles
WHERE gate2_exempt_sections IS NOT NULL AND array_length(gate2_exempt_sections, 1) > 0;
