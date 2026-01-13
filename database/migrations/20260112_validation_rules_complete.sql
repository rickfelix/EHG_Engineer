-- Migration: Complete Validation Rules Registration
-- SD-VALIDATION-REGISTRY-001
-- Created: 2026-01-12
--
-- Purpose: Register all validation rules from existing codebase validators
--          Adds Gate L (LEAD pre-approval) and comprehensive rules for all phases
--
-- Validator file mapping:
--   sd-creation-validator.js -> Gate L
--   prd-quality-validation.js -> Gate 1
--   user-story-quality-validation.js -> Gate 1
--   design-database-gates-validation.js -> Gate 1
--   bmad-validation.js -> Gate 1
--   implementation-fidelity-validation.js -> Gates 2A-2D
--   traceability-validation.js -> Gate 3

BEGIN;

-- ============================================================================
-- STEP 1: Add new columns for validator mapping
-- ============================================================================

ALTER TABLE leo_validation_rules
  ADD COLUMN IF NOT EXISTS handoff_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS validator_module VARCHAR(200),
  ADD COLUMN IF NOT EXISTS validator_function VARCHAR(100),
  ADD COLUMN IF NOT EXISTS execution_order INTEGER DEFAULT 50;

COMMENT ON COLUMN leo_validation_rules.handoff_type IS 'Handoff type this rule applies to: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD';
COMMENT ON COLUMN leo_validation_rules.validator_module IS 'Path to validator module relative to scripts/modules/';
COMMENT ON COLUMN leo_validation_rules.validator_function IS 'Export function name to call';
COMMENT ON COLUMN leo_validation_rules.execution_order IS 'Order of execution within gate (lower = earlier)';

-- Create index for handoff lookups
CREATE INDEX IF NOT EXISTS idx_leo_validation_rules_handoff
  ON leo_validation_rules(handoff_type, active);

-- ============================================================================
-- STEP 2: Update CHECK constraint to add Gate L (LEAD pre-approval)
-- ============================================================================

-- Drop existing constraint if it exists
DO $$
BEGIN
  ALTER TABLE leo_validation_rules DROP CONSTRAINT IF EXISTS leo_validation_rules_gate_check;
EXCEPTION WHEN undefined_object THEN
  NULL; -- Constraint doesn't exist, continue
END $$;

-- Add updated constraint with Gate L
ALTER TABLE leo_validation_rules
ADD CONSTRAINT leo_validation_rules_gate_check
CHECK (gate = ANY (ARRAY['L'::text, '0'::text, '1'::text, 'Q'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text]));

-- ============================================================================
-- STEP 3: Gate L - SD Creation Validation (LEAD pre-approval)
-- Validator: sd-creation-validator.js
-- Weight: 1.000
-- ============================================================================

DELETE FROM leo_validation_rules WHERE gate = 'L';

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order) VALUES
(
  'L',
  'sdExistenceCheck',
  0.150,
  '{"description": "Strategic Directive exists and is active", "checks": ["id_exists", "status_active", "not_archived"]}'::jsonb,
  true,
  true,
  'LEAD-TO-PLAN',
  'sd-creation-validator.js',
  'validateSDCreation',
  10
),
(
  'L',
  'sdObjectivesDefined',
  0.250,
  '{"description": "Strategic objectives defined with measurable outcomes", "min_items": 2, "required_fields": ["strategic_objectives", "success_metrics"]}'::jsonb,
  true,
  true,
  'LEAD-TO-PLAN',
  'handoff/validators/sd-objectives-validator.js',
  'validateSDObjectives',
  20
),
(
  'L',
  'sdPrioritySet',
  0.200,
  '{"description": "Priority is set to critical, high, medium, or low", "valid_values": ["critical", "high", "medium", "low"]}'::jsonb,
  true,
  true,
  'LEAD-TO-PLAN',
  'handoff/validators/sd-priority-validator.js',
  'validateSDPriority',
  30
),
(
  'L',
  'sdSuccessCriteria',
  0.250,
  '{"description": "Success criteria defined with measurable items", "min_items": 3}'::jsonb,
  true,
  true,
  'LEAD-TO-PLAN',
  'sd-creation-validator.js',
  'validateSDCreation',
  40
),
(
  'L',
  'sdRisksIdentified',
  0.150,
  '{"description": "Risks array is defined (can be empty for low-risk SDs)", "allow_empty": true}'::jsonb,
  false,
  true,
  'LEAD-TO-PLAN',
  'sd-creation-validator.js',
  'validateSDCreation',
  50
);

-- ============================================================================
-- STEP 4: Gate 0 - Static Analysis (existing, add metadata)
-- ============================================================================

UPDATE leo_validation_rules
SET handoff_type = 'PLAN-TO-EXEC',
    validator_module = 'qa/build-validator.js',
    execution_order = 10
WHERE gate = '0' AND rule_name = 'hasESLintPass';

UPDATE leo_validation_rules
SET handoff_type = 'PLAN-TO-EXEC',
    validator_module = 'qa/build-validator.js',
    execution_order = 20
WHERE gate = '0' AND rule_name = 'hasTypeScriptPass';

UPDATE leo_validation_rules
SET handoff_type = 'PLAN-TO-EXEC',
    validator_module = 'qa/build-validator.js',
    execution_order = 30
WHERE gate = '0' AND rule_name = 'hasImportsPass';

-- ============================================================================
-- STEP 5: Gate 1 - PLAN to EXEC Validation
-- Validators: prd-quality, user-story-quality, design-database-gates, bmad
-- Weight: 1.000
-- ============================================================================

DELETE FROM leo_validation_rules WHERE gate = '1';

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order) VALUES
-- PRD Quality (AI-powered, uses gpt-5-mini)
(
  '1',
  'prdQualityValidation',
  0.150,
  '{"description": "PRD quality validation using AI-powered Russian Judge rubric", "min_score": 65, "uses_ai": true, "model": "gpt-5-mini"}'::jsonb,
  true,
  true,
  'PLAN-TO-EXEC',
  'prd-quality-validation.js',
  'validatePRDQuality',
  10
),
-- User Story Quality (AI-powered)
(
  '1',
  'userStoryQualityValidation',
  0.150,
  '{"description": "User story quality validation using AI-powered rubric", "min_score": 70, "min_stories": 1, "uses_ai": true}'::jsonb,
  true,
  true,
  'PLAN-TO-EXEC',
  'user-story-quality-validation.js',
  'validateUserStoriesForHandoff',
  20
),
-- DESIGN Sub-Agent Execution
(
  '1',
  'designSubAgentExecution',
  0.120,
  '{"description": "DESIGN sub-agent executed and analysis stored", "sub_agent_code": "DESIGN", "checks": ["execution_exists", "verdict_not_fail"]}'::jsonb,
  true,
  true,
  'PLAN-TO-EXEC',
  'design-database-gates-validation.js',
  'validateGate1PlanToExec',
  30
),
-- DATABASE Sub-Agent Execution
(
  '1',
  'databaseSubAgentExecution',
  0.120,
  '{"description": "DATABASE sub-agent executed and informed by DESIGN", "sub_agent_code": "DATABASE", "checks": ["execution_exists", "design_informed"]}'::jsonb,
  true,
  true,
  'PLAN-TO-EXEC',
  'design-database-gates-validation.js',
  'validateGate1PlanToExec',
  40
),
-- BMAD Validation (context engineering)
(
  '1',
  'bmadContextEngineering',
  0.100,
  '{"description": "User story context engineering >= 80% coverage", "min_coverage": 80, "checks": ["implementation_context", "checkpoint_plan"]}'::jsonb,
  true,
  true,
  'PLAN-TO-EXEC',
  'bmad-validation.js',
  'validateBMADForPlanToExec',
  50
),
-- Goal Summary Validation
(
  '1',
  'goalSummaryValidation',
  0.080,
  '{"description": "Goal summary present and <= 300 chars", "max_length": 300}'::jsonb,
  true,
  true,
  'PLAN-TO-EXEC',
  'handoff/validators/goal-summary-validator.js',
  'validateGoalSummary',
  60
),
-- File Scope Validation
(
  '1',
  'fileScopeValidation',
  0.080,
  '{"description": "File scope has create/modify/delete arrays", "required_arrays": ["create", "modify", "delete"]}'::jsonb,
  true,
  true,
  'PLAN-TO-EXEC',
  'handoff/validators/file-scope-validator.js',
  'validateFileScope',
  70
),
-- Execution Plan Validation
(
  '1',
  'executionPlanValidation',
  0.100,
  '{"description": "Execution plan has >= 1 step", "min_steps": 1}'::jsonb,
  true,
  true,
  'PLAN-TO-EXEC',
  'handoff/validators/execution-plan-validator.js',
  'validateExecutionPlan',
  80
),
-- Testing Strategy Validation
(
  '1',
  'testingStrategyValidation',
  0.100,
  '{"description": "Testing strategy defines unit_tests and e2e_tests", "required_sections": ["unit_tests", "e2e_tests"]}'::jsonb,
  true,
  true,
  'PLAN-TO-EXEC',
  'handoff/validators/testing-strategy-validator.js',
  'validateTestingStrategy',
  90
);

-- ============================================================================
-- STEP 6: Gate 2A - Design Implementation Fidelity (Section A)
-- Validator: implementation-fidelity-validation.js
-- ============================================================================

DELETE FROM leo_validation_rules WHERE gate = '2A';

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order) VALUES
(
  '2A',
  'uiComponentsImplemented',
  0.400,
  '{"description": "UI components created matching design specifications", "checks": ["component_files_exist", "naming_conventions"]}'::jsonb,
  true,
  true,
  'EXEC-TO-PLAN',
  'implementation-fidelity-validation.js',
  'validateDesignFidelity',
  10
),
(
  '2A',
  'userWorkflowsImplemented',
  0.350,
  '{"description": "User workflows implemented as designed", "checks": ["workflows_in_deliverables"]}'::jsonb,
  true,
  true,
  'EXEC-TO-PLAN',
  'implementation-fidelity-validation.js',
  'validateDesignFidelity',
  20
),
(
  '2A',
  'userActionsSupported',
  0.250,
  '{"description": "CRUD operations found in code changes", "checks": ["create", "update", "delete", "insert"]}'::jsonb,
  false,
  true,
  'EXEC-TO-PLAN',
  'implementation-fidelity-validation.js',
  'validateDesignFidelity',
  30
);

-- ============================================================================
-- STEP 7: Gate 2B - Database Implementation Fidelity (Section B)
-- ============================================================================

DELETE FROM leo_validation_rules WHERE gate = '2B';

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order) VALUES
(
  '2B',
  'migrationsCreatedAndExecuted',
  0.600,
  '{"description": "CRITICAL: Database migrations exist AND executed in database", "checks": ["migration_files_exist", "migrations_executed"], "critical": true}'::jsonb,
  true,
  true,
  'EXEC-TO-PLAN',
  'implementation-fidelity-validation.js',
  'validateDatabaseFidelity',
  10
),
(
  '2B',
  'rlsPoliciesImplemented',
  0.200,
  '{"description": "RLS policies created for new tables", "checks": ["CREATE_POLICY", "ALTER_POLICY"]}'::jsonb,
  false,
  true,
  'EXEC-TO-PLAN',
  'implementation-fidelity-validation.js',
  'validateDatabaseFidelity',
  20
),
(
  '2B',
  'migrationComplexityAligned',
  0.200,
  '{"description": "Migration complexity matches design requirements", "checks": ["line_count", "complexity_appropriate"]}'::jsonb,
  false,
  true,
  'EXEC-TO-PLAN',
  'implementation-fidelity-validation.js',
  'validateDatabaseFidelity',
  30
);

-- ============================================================================
-- STEP 8: Gate 2C - Data Flow Alignment (Section C)
-- ============================================================================

DELETE FROM leo_validation_rules WHERE gate = '2C';

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order) VALUES
(
  '2C',
  'databaseQueriesIntegrated',
  0.400,
  '{"description": "Database queries found in code (.select, .insert, .update)", "checks": [".select(", ".insert(", ".update(", ".from("]}'::jsonb,
  true,
  true,
  'EXEC-TO-PLAN',
  'implementation-fidelity-validation.js',
  'validateDataFlowAlignment',
  10
),
(
  '2C',
  'formUiIntegration',
  0.400,
  '{"description": "Form/UI integration found (useState, useForm, onSubmit)", "checks": ["useState", "useForm", "onSubmit", "Input", "Button"]}'::jsonb,
  true,
  true,
  'EXEC-TO-PLAN',
  'implementation-fidelity-validation.js',
  'validateDataFlowAlignment',
  20
),
(
  '2C',
  'dataValidationImplemented',
  0.200,
  '{"description": "Data validation found (zod, schema, required)", "checks": ["zod", "validate", "schema", ".required()"]}'::jsonb,
  false,
  true,
  'EXEC-TO-PLAN',
  'implementation-fidelity-validation.js',
  'validateDataFlowAlignment',
  30
);

-- ============================================================================
-- STEP 9: Gate 2D - Enhanced Testing (Section D)
-- ============================================================================

DELETE FROM leo_validation_rules WHERE gate = '2D';

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order) VALUES
(
  '2D',
  'e2eTestCoverage',
  0.400,
  '{"description": "CRITICAL: E2E tests exist for this SD", "checks": ["e2e_test_files_exist"], "test_dirs": ["tests/e2e", "tests/integration", "playwright/tests"], "critical": true}'::jsonb,
  true,
  true,
  'EXEC-TO-PLAN',
  'implementation-fidelity-validation.js',
  'validateEnhancedTesting',
  10
),
(
  '2D',
  'testingSubAgentVerified',
  0.300,
  '{"description": "TESTING sub-agent executed with PASS verdict", "sub_agent_code": "TESTING", "expected_verdict": "PASS"}'::jsonb,
  true,
  true,
  'EXEC-TO-PLAN',
  'implementation-fidelity-validation.js',
  'validateEnhancedTesting',
  20
),
(
  '2D',
  'screenshotEvidenceExists',
  0.150,
  '{"description": "E2E test screenshots exist", "checks": ["screenshot_url_valid"]}'::jsonb,
  false,
  true,
  'EXEC-TO-PLAN',
  'handoff/validators/screenshot-evidence-validator.js',
  'validateScreenshotEvidence',
  30
),
(
  '2D',
  'playwrightReportExists',
  0.150,
  '{"description": "Playwright report URL exists and valid", "checks": ["playwright_report_url_valid"]}'::jsonb,
  false,
  true,
  'EXEC-TO-PLAN',
  'handoff/validators/playwright-report-validator.js',
  'validatePlaywrightReport',
  40
);

-- ============================================================================
-- STEP 10: Gate 3 - Traceability Validation (PLAN to LEAD)
-- Validator: traceability-validation.js
-- ============================================================================

DELETE FROM leo_validation_rules WHERE gate = '3';

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order) VALUES
-- Section A: Recommendation Adherence (30%)
(
  '3',
  'recommendationAdherence',
  0.300,
  '{"description": "CRITICAL: EXEC delivered what PLAN designed", "checks": ["design_adherence_percent", "database_adherence_percent"], "min_adherence": 80}'::jsonb,
  true,
  true,
  'PLAN-TO-LEAD',
  'traceability-validation.js',
  'validateRecommendationAdherence',
  10
),
-- Section B: Implementation Quality (30%)
(
  '3',
  'implementationQuality',
  0.300,
  '{"description": "CRITICAL: Gate 2 passed with acceptable score", "checks": ["gate2_score", "test_coverage_documented"], "min_gate2_score": 70}'::jsonb,
  true,
  true,
  'PLAN-TO-LEAD',
  'traceability-validation.js',
  'validateImplementationQuality',
  20
),
-- Section C: Traceability Mapping (25%)
(
  '3',
  'traceabilityMapping',
  0.250,
  '{"description": "PRD->Implementation, Design->Code, DB->Schema tracing", "checks": ["commits_reference_sd", "design_code_mapping", "database_schema_mapping"]}'::jsonb,
  true,
  true,
  'PLAN-TO-LEAD',
  'traceability-validation.js',
  'validateTraceabilityMapping',
  30
),
-- Section D: Sub-Agent Effectiveness (10%)
(
  '3',
  'subAgentEffectiveness',
  0.100,
  '{"description": "Sub-agents executed with substantial recommendations", "checks": ["sub_agents_executed", "substantial_recommendations"]}'::jsonb,
  false,
  true,
  'PLAN-TO-LEAD',
  'traceability-validation.js',
  'validateSubAgentEffectiveness',
  40
),
-- Section E: Lessons Captured (5%)
(
  '3',
  'lessonsCaptured',
  0.050,
  '{"description": "Retrospective preparation and workflow notes", "checks": ["retrospective_prepared", "workflow_effectiveness_noted"]}'::jsonb,
  false,
  true,
  'PLAN-TO-LEAD',
  'traceability-validation.js',
  'validateLessonsCaptured',
  50
);

-- ============================================================================
-- STEP 11: Gate Q - Quality Gate (add 7-element validators)
-- ============================================================================

-- Add 7-element handoff content validators
INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT 'Q', 'executiveSummaryComplete', 0.000,
  '{"description": "Executive summary is complete and specific", "min_length": 100}'::jsonb,
  false, true, NULL,
  'handoff/validators/executive-summary-validator.js',
  'validateExecutiveSummary',
  10
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = 'Q' AND rule_name = 'executiveSummaryComplete');

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT 'Q', 'keyDecisionsDocumented', 0.000,
  '{"description": "Key decisions documented with rationale", "check_decision_language": true}'::jsonb,
  false, true, NULL,
  'handoff/validators/key-decisions-validator.js',
  'validateKeyDecisions',
  20
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = 'Q' AND rule_name = 'keyDecisionsDocumented');

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT 'Q', 'knownIssuesTracked', 0.000,
  '{"description": "Known issues tracked or explicitly none", "allow_none": true}'::jsonb,
  false, true, NULL,
  'handoff/validators/known-issues-validator.js',
  'validateKnownIssues',
  30
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = 'Q' AND rule_name = 'knownIssuesTracked');

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT 'Q', 'actionItemsPresent', 0.000,
  '{"description": "Action items for next phase >= 3", "min_items": 3}'::jsonb,
  false, true, NULL,
  'handoff/validators/action-items-validator.js',
  'validateActionItems',
  40
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = 'Q' AND rule_name = 'actionItemsPresent');

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT 'Q', 'completenessReportValid', 0.000,
  '{"description": "Completeness report has phase, score, status", "required_fields": ["phase", "score", "status"]}'::jsonb,
  false, true, NULL,
  'handoff/validators/completeness-report-validator.js',
  'validateCompletenessReport',
  50
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = 'Q' AND rule_name = 'completenessReportValid');

-- ============================================================================
-- STEP 12: Gate 4 - Strategic Value Validation (LEAD Final Approval)
-- Validator: workflow-roi-validation.js
-- ============================================================================

-- Gate 4 needs to be added to the constraint if not already there
DO $$
BEGIN
  ALTER TABLE leo_validation_rules DROP CONSTRAINT IF EXISTS leo_validation_rules_gate_check;
  ALTER TABLE leo_validation_rules
  ADD CONSTRAINT leo_validation_rules_gate_check
  CHECK (gate = ANY (ARRAY['L'::text, '0'::text, '1'::text, 'Q'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text, '4'::text]));
EXCEPTION WHEN others THEN
  NULL; -- Constraint already updated
END $$;

DELETE FROM leo_validation_rules WHERE gate = '4';

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order) VALUES
-- Section A: Value Delivered (35%)
(
  '4',
  'valueDelivered',
  0.350,
  '{"description": "Strategic value delivered: solves real business problem", "questions": ["Does this solve a real business problem?", "Is this the simplest solution?", "Are we building whats needed vs nice-to-have?"]}'::jsonb,
  true,
  true,
  'LEAD-FINAL-APPROVAL',
  'workflow-roi-validation.js',
  'validateStrategicValue',
  10
),
-- Section B: Pattern Effectiveness (30%)
(
  '4',
  'patternEffectiveness',
  0.300,
  '{"description": "Pattern effectiveness: no over-engineering, good ROI", "questions": ["Did EXEC over-engineer this?", "Whats the ROI/complexity ratio?"]}'::jsonb,
  true,
  true,
  'LEAD-FINAL-APPROVAL',
  'workflow-roi-validation.js',
  'validatePatternEffectiveness',
  20
),
-- Section C: Executive Validation (25%)
(
  '4',
  'executiveValidation',
  0.250,
  '{"description": "Executive validation: PR merged, user stories complete", "checks": ["pr_merged", "user_stories_complete", "retrospective_exists"]}'::jsonb,
  true,
  true,
  'LEAD-FINAL-APPROVAL',
  'workflow-roi-validation.js',
  'validateExecutiveChecklist',
  30
),
-- Section D: Process Adherence (10%)
(
  '4',
  'processAdherence',
  0.100,
  '{"description": "Process adherence: all gates passed, protocol followed", "checks": ["all_gates_passed", "protocol_followed"]}'::jsonb,
  false,
  true,
  'LEAD-FINAL-APPROVAL',
  'workflow-roi-validation.js',
  'validateProcessAdherence',
  40
);

-- ============================================================================
-- STEP 13: Additional Gates from Handoff System Guide
-- These are referenced in the executors but not in the database
-- ============================================================================

-- LEAD-TO-PLAN additional gates
INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT 'L', 'sdTransitionReadiness', 0.000,
  '{"description": "SD transition readiness check", "checks": ["status_valid", "not_blocked"]}'::jsonb,
  true, true, 'LEAD-TO-PLAN',
  'handoff/executors/LeadToPlanExecutor.js',
  'validateSDTransitionReadiness',
  5
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = 'L' AND rule_name = 'sdTransitionReadiness');

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT 'L', 'targetApplicationValidation', 0.000,
  '{"description": "Target application is valid and accessible", "valid_targets": ["EHG", "EHG_Engineer"]}'::jsonb,
  true, true, 'LEAD-TO-PLAN',
  'handoff/executors/LeadToPlanExecutor.js',
  'validateTargetApplication',
  6
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = 'L' AND rule_name = 'targetApplicationValidation');

-- PLAN-TO-EXEC additional gates
INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT '1', 'architectureVerification', 0.000,
  '{"description": "Architecture verification gate", "checks": ["adr_exists", "interfaces_defined"]}'::jsonb,
  false, true, 'PLAN-TO-EXEC',
  'handoff/executors/PlanToExecExecutor.js',
  'validateArchitecture',
  15
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = '1' AND rule_name = 'architectureVerification');

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT '1', 'explorationAudit', 0.000,
  '{"description": "Exploration audit - codebase understanding verified", "checks": ["files_explored", "patterns_identified"]}'::jsonb,
  false, true, 'PLAN-TO-EXEC',
  'handoff/executors/PlanToExecExecutor.js',
  'validateExplorationAudit',
  25
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = '1' AND rule_name = 'explorationAudit');

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT '1', 'branchEnforcement', 0.000,
  '{"description": "Git branch enforcement - feature branch created", "checks": ["branch_exists", "branch_naming_valid"]}'::jsonb,
  true, true, 'PLAN-TO-EXEC',
  'handoff/executors/PlanToExecExecutor.js',
  'validateBranchEnforcement',
  95
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = '1' AND rule_name = 'branchEnforcement');

-- PLAN-TO-LEAD additional gates
INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT '3', 'subAgentOrchestration', 0.000,
  '{"description": "Sub-agent orchestration complete", "required_agents": ["DESIGN", "DATABASE", "TESTING"]}'::jsonb,
  true, true, 'PLAN-TO-LEAD',
  'handoff/executors/PlanToLeadExecutor.js',
  'validateSubAgentOrchestration',
  5
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = '3' AND rule_name = 'subAgentOrchestration');

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT '3', 'retrospectiveQualityGate', 0.000,
  '{"description": "Retrospective quality gate - lessons captured", "min_quality_score": 70}'::jsonb,
  false, true, 'PLAN-TO-LEAD',
  'handoff/executors/PlanToLeadExecutor.js',
  'validateRetrospectiveQuality',
  55
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = '3' AND rule_name = 'retrospectiveQualityGate');

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT '3', 'gitCommitEnforcement', 0.000,
  '{"description": "Git commits reference SD ID", "checks": ["commits_exist", "commits_reference_sd"]}'::jsonb,
  true, true, 'PLAN-TO-LEAD',
  'handoff/executors/PlanToLeadExecutor.js',
  'validateGitCommitEnforcement',
  60
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = '3' AND rule_name = 'gitCommitEnforcement');

-- LEAD-FINAL-APPROVAL gates
INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT '4', 'planToLeadHandoffExists', 0.000,
  '{"description": "PLAN-TO-LEAD handoff exists and accepted", "status": "accepted"}'::jsonb,
  true, true, 'LEAD-FINAL-APPROVAL',
  'handoff/executors/LeadFinalApprovalExecutor.js',
  'validatePlanToLeadExists',
  5
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = '4' AND rule_name = 'planToLeadHandoffExists');

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT '4', 'userStoriesComplete', 0.000,
  '{"description": "All user stories validated and complete", "coverage": 100}'::jsonb,
  true, true, 'LEAD-FINAL-APPROVAL',
  'handoff/executors/LeadFinalApprovalExecutor.js',
  'validateUserStoriesComplete',
  15
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = '4' AND rule_name = 'userStoriesComplete');

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT '4', 'retrospectiveExists', 0.000,
  '{"description": "Retrospective exists for this SD", "required": true}'::jsonb,
  true, true, 'LEAD-FINAL-APPROVAL',
  'handoff/executors/LeadFinalApprovalExecutor.js',
  'validateRetrospectiveExists',
  25
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = '4' AND rule_name = 'retrospectiveExists');

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, handoff_type, validator_module, validator_function, execution_order)
SELECT '4', 'prMergeVerification', 0.000,
  '{"description": "PR merged to main branch", "checks": ["pr_exists", "pr_merged"]}'::jsonb,
  true, true, 'LEAD-FINAL-APPROVAL',
  'handoff/executors/LeadFinalApprovalExecutor.js',
  'validatePRMerge',
  35
WHERE NOT EXISTS (SELECT 1 FROM leo_validation_rules WHERE gate = '4' AND rule_name = 'prMergeVerification');

-- ============================================================================
-- STEP 14: Validation - Ensure weights sum to 1.000 per gate
-- ============================================================================

DO $$
DECLARE
  v_gate TEXT;
  v_total NUMERIC;
BEGIN
  FOR v_gate IN SELECT DISTINCT gate FROM leo_validation_rules WHERE active = true AND gate NOT IN ('Q')
  LOOP
    SELECT COALESCE(SUM(weight), 0) INTO v_total
    FROM leo_validation_rules
    WHERE gate = v_gate AND active = true;

    IF ABS(v_total - 1.000) > 0.001 THEN
      RAISE WARNING 'Gate % weights sum to %, expected 1.000', v_gate, v_total;
    ELSE
      RAISE NOTICE 'Gate % weights valid (sum = %)', v_gate, v_total;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- STEP 13: Summary
-- ============================================================================

DO $$
DECLARE
  v_count INTEGER;
  v_gate_counts TEXT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM leo_validation_rules WHERE active = true;

  SELECT string_agg(gate || ': ' || cnt::text, ', ' ORDER BY gate)
  INTO v_gate_counts
  FROM (
    SELECT gate, COUNT(*) as cnt
    FROM leo_validation_rules
    WHERE active = true
    GROUP BY gate
  ) subq;

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'LEO Validation Rules Migration Complete (SD-VALIDATION-REGISTRY-001)';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Total active rules: %', v_count;
  RAISE NOTICE 'Per gate: %', v_gate_counts;
  RAISE NOTICE '';
  RAISE NOTICE 'Gate L: SD Creation (LEAD pre-approval) - 5 rules';
  RAISE NOTICE 'Gate 0: Static Analysis - 3 rules (existing)';
  RAISE NOTICE 'Gate 1: PLAN->EXEC Readiness - 9 rules';
  RAISE NOTICE 'Gate 2A: Design Fidelity - 3 rules';
  RAISE NOTICE 'Gate 2B: Database Fidelity - 3 rules';
  RAISE NOTICE 'Gate 2C: Data Flow Alignment - 3 rules';
  RAISE NOTICE 'Gate 2D: Enhanced Testing - 4 rules';
  RAISE NOTICE 'Gate 3: Traceability - 5 rules';
  RAISE NOTICE 'Gate Q: Quality Gate - 5+ rules (7-element validators)';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;

COMMIT;
