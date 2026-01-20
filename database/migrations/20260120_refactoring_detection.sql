-- Migration: Add Refactoring Detection to Pattern System
-- SD: SD-LEO-INFRA-ADD-REFACTORING-DETECTION-001
-- Created: 2026-01-20
--
-- Purpose: Add proactive refactoring detection capabilities:
--   1. Gate Q complexity rule (advisory, non-blocking)
--   2. Refactoring pattern category with seed patterns
--   3. Connect RISK technical_complexity to pattern creation
--
-- Scope:
--   - Add hasAcceptableComplexity to Gate Q (advisory)
--   - Add PAT-REF-001, PAT-REF-002, PAT-REF-003 seed patterns
--   - No blocking changes - all advisory

BEGIN;

-- ============================================================================
-- STEP 1: Add Gate Q Complexity Rule (Advisory)
-- ============================================================================

-- Insert complexity check rule (advisory, not required)
INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, created_at)
VALUES (
  'Q',
  'hasAcceptableComplexity',
  0.100,  -- 10% weight (adjust existing weights if needed)
  jsonb_build_object(
    'description', 'Code complexity within acceptable thresholds (advisory)',
    'metrics', jsonb_build_object(
      'max_file_lines', 500,
      'max_cyclomatic_complexity', 15,
      'max_function_lines', 50,
      'max_nesting_depth', 4
    ),
    'thresholds', jsonb_build_object(
      'warn_file_lines', 300,
      'warn_cyclomatic', 10,
      'warn_function_lines', 30
    ),
    'successCriteria', 'Files analyzed for complexity (advisory - does not block)',
    'advisory', true
  ),
  false,  -- NOT required (advisory only)
  true,   -- active
  'EXEC-TO-PLAN',
  NOW()
)
ON CONFLICT (gate, rule_name) DO UPDATE SET
  weight = EXCLUDED.weight,
  criteria = EXCLUDED.criteria,
  required = EXCLUDED.required,
  active = EXCLUDED.active;

-- ============================================================================
-- STEP 2: Add Refactoring Pattern Category Seeds
-- ============================================================================

-- PAT-REF-001: Large File Detection
INSERT INTO issue_patterns (
  pattern_id,
  category,
  severity,
  issue_summary,
  occurrence_count,
  proven_solutions,
  prevention_checklist,
  related_sub_agents,
  trend,
  status
) VALUES (
  'PAT-REF-001',
  'refactoring',
  'medium',
  'File exceeds 500 lines of code, indicating potential need for decomposition',
  0,
  '[
    {
      "solution": "Split file into logical modules/components based on responsibility",
      "times_applied": 0,
      "times_successful": 0,
      "success_rate": 0,
      "avg_resolution_time_minutes": 120
    },
    {
      "solution": "Extract helper functions into separate utility file",
      "times_applied": 0,
      "times_successful": 0,
      "success_rate": 0,
      "avg_resolution_time_minutes": 60
    }
  ]'::jsonb,
  '["Check file line count before adding new code", "Consider extraction when file exceeds 300 lines", "Review file responsibilities periodically"]'::jsonb,
  ARRAY['REGRESSION', 'RISK'],
  'stable',
  'active'
)
ON CONFLICT (pattern_id) DO NOTHING;

-- PAT-REF-002: High Cyclomatic Complexity
INSERT INTO issue_patterns (
  pattern_id,
  category,
  severity,
  issue_summary,
  occurrence_count,
  proven_solutions,
  prevention_checklist,
  related_sub_agents,
  trend,
  status
) VALUES (
  'PAT-REF-002',
  'refactoring',
  'medium',
  'Function/method has cyclomatic complexity > 15, making it difficult to test and maintain',
  0,
  '[
    {
      "solution": "Extract conditional branches into separate functions",
      "times_applied": 0,
      "times_successful": 0,
      "success_rate": 0,
      "avg_resolution_time_minutes": 90
    },
    {
      "solution": "Replace nested conditionals with early returns or guard clauses",
      "times_applied": 0,
      "times_successful": 0,
      "success_rate": 0,
      "avg_resolution_time_minutes": 45
    },
    {
      "solution": "Use strategy pattern for complex branching logic",
      "times_applied": 0,
      "times_successful": 0,
      "success_rate": 0,
      "avg_resolution_time_minutes": 180
    }
  ]'::jsonb,
  '["Keep functions under 10 cyclomatic complexity", "Use early returns to reduce nesting", "Consider polymorphism for type-based branching"]'::jsonb,
  ARRAY['REGRESSION', 'RISK', 'TESTING'],
  'stable',
  'active'
)
ON CONFLICT (pattern_id) DO NOTHING;

-- PAT-REF-003: Technical Debt Accumulation (RISK score > 7)
INSERT INTO issue_patterns (
  pattern_id,
  category,
  severity,
  issue_summary,
  occurrence_count,
  proven_solutions,
  prevention_checklist,
  related_sub_agents,
  trend,
  status
) VALUES (
  'PAT-REF-003',
  'refactoring',
  'high',
  'RISK sub-agent detected technical_complexity score > 7/10, indicating significant refactoring need',
  0,
  '[
    {
      "solution": "Create dedicated refactoring SD with REGRESSION sub-agent validation",
      "times_applied": 0,
      "times_successful": 0,
      "success_rate": 0,
      "avg_resolution_time_minutes": 240
    },
    {
      "solution": "Implement incremental refactoring alongside feature work",
      "times_applied": 0,
      "times_successful": 0,
      "success_rate": 0,
      "avg_resolution_time_minutes": 180
    }
  ]'::jsonb,
  '["Monitor RISK technical_complexity scores in retrospectives", "Address complexity before it exceeds 8/10", "Include refactoring in sprint planning when score > 7"]'::jsonb,
  ARRAY['RISK', 'REGRESSION', 'RETRO'],
  'stable',
  'active'
)
ON CONFLICT (pattern_id) DO NOTHING;

-- PAT-REF-004: DRY Violation (Duplicate Code)
INSERT INTO issue_patterns (
  pattern_id,
  category,
  severity,
  issue_summary,
  occurrence_count,
  proven_solutions,
  prevention_checklist,
  related_sub_agents,
  trend,
  status
) VALUES (
  'PAT-REF-004',
  'refactoring',
  'low',
  'Similar code blocks detected in multiple locations (3+ occurrences)',
  0,
  '[
    {
      "solution": "Extract common logic into shared utility function",
      "times_applied": 0,
      "times_successful": 0,
      "success_rate": 0,
      "avg_resolution_time_minutes": 30
    },
    {
      "solution": "Create reusable component/hook for shared UI logic",
      "times_applied": 0,
      "times_successful": 0,
      "success_rate": 0,
      "avg_resolution_time_minutes": 60
    }
  ]'::jsonb,
  '["Search for existing utilities before implementing", "Use code review to catch duplication", "Document shared patterns in codebase"]'::jsonb,
  ARRAY['REGRESSION', 'VALIDATION'],
  'stable',
  'active'
)
ON CONFLICT (pattern_id) DO NOTHING;

-- PAT-REF-005: Long Function (> 50 lines)
INSERT INTO issue_patterns (
  pattern_id,
  category,
  severity,
  issue_summary,
  occurrence_count,
  proven_solutions,
  prevention_checklist,
  related_sub_agents,
  trend,
  status
) VALUES (
  'PAT-REF-005',
  'refactoring',
  'low',
  'Function exceeds 50 lines, likely doing too much and harder to test',
  0,
  '[
    {
      "solution": "Extract logical sections into named helper functions",
      "times_applied": 0,
      "times_successful": 0,
      "success_rate": 0,
      "avg_resolution_time_minutes": 45
    },
    {
      "solution": "Apply single responsibility principle - one function, one purpose",
      "times_applied": 0,
      "times_successful": 0,
      "success_rate": 0,
      "avg_resolution_time_minutes": 60
    }
  ]'::jsonb,
  '["Keep functions under 30 lines when possible", "Name functions by what they do, not how", "If function needs comments to explain sections, extract those sections"]'::jsonb,
  ARRAY['REGRESSION', 'TESTING'],
  'stable',
  'active'
)
ON CONFLICT (pattern_id) DO NOTHING;

-- ============================================================================
-- STEP 3: Add trigger for RISK -> Pattern connection (when technical_complexity > 7)
-- ============================================================================

-- Function to create refactoring pattern when RISK detects high complexity
CREATE OR REPLACE FUNCTION create_refactoring_pattern_from_risk()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger for high technical complexity scores
  IF NEW.technical_complexity >= 7 THEN
    -- Update PAT-REF-003 occurrence count and last_seen_sd_id
    UPDATE issue_patterns
    SET
      occurrence_count = occurrence_count + 1,
      last_seen_sd_id = NEW.sd_id,
      updated_at = NOW()
    WHERE pattern_id = 'PAT-REF-003';

    -- Log the connection
    RAISE NOTICE 'Refactoring pattern PAT-REF-003 updated: SD % has technical_complexity %',
      NEW.sd_id, NEW.technical_complexity;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on risk_assessments table (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'risk_assessments'
  ) THEN
    DROP TRIGGER IF EXISTS trg_risk_to_refactoring_pattern ON risk_assessments;
    CREATE TRIGGER trg_risk_to_refactoring_pattern
      AFTER INSERT OR UPDATE ON risk_assessments
      FOR EACH ROW
      EXECUTE FUNCTION create_refactoring_pattern_from_risk();
    RAISE NOTICE 'Created trigger trg_risk_to_refactoring_pattern on risk_assessments';
  ELSE
    RAISE NOTICE 'risk_assessments table not found - trigger not created';
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Verification
-- ============================================================================

-- Verify Gate Q rule exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM leo_validation_rules
    WHERE gate = 'Q' AND rule_name = 'hasAcceptableComplexity'
  ) THEN
    RAISE WARNING 'Gate Q complexity rule not created';
  ELSE
    RAISE NOTICE 'Gate Q complexity rule verified';
  END IF;
END $$;

-- Verify refactoring patterns exist
DO $$
DECLARE
  pattern_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO pattern_count
  FROM issue_patterns
  WHERE category = 'refactoring';

  IF pattern_count < 3 THEN
    RAISE WARNING 'Expected at least 3 refactoring patterns, found %', pattern_count;
  ELSE
    RAISE NOTICE 'Verified % refactoring patterns', pattern_count;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Summary of changes:
-- ============================================================================
-- 1. Added hasAcceptableComplexity rule to Gate Q (advisory, 10% weight)
--    - Thresholds: 500 LOC, 15 cyclomatic, 50 lines/function
--    - Non-blocking - provides visibility only
--
-- 2. Added 5 refactoring seed patterns:
--    - PAT-REF-001: Large file (>500 LOC)
--    - PAT-REF-002: High cyclomatic complexity (>15)
--    - PAT-REF-003: RISK technical_complexity > 7
--    - PAT-REF-004: DRY violations
--    - PAT-REF-005: Long functions (>50 lines)
--
-- 3. Added trigger to connect RISK assessments to PAT-REF-003
--    - When technical_complexity >= 7, pattern is updated
--
-- All changes are advisory/non-blocking per SD requirements
