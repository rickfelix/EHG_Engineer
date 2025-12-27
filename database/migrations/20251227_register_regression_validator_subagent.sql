-- Migration: Register REGRESSION-VALIDATOR Sub-Agent
-- Created: 2025-12-27
-- Purpose: Register sub-agent for refactoring backward compatibility validation
--
-- REGRESSION-VALIDATOR Sub-Agent:
-- - Validates refactoring changes maintain backward compatibility
-- - Captures baseline test results before refactoring
-- - Compares test results after refactoring
-- - Validates API signatures unchanged
-- - Checks import path resolution
--
-- SD: SD-REFACTOR-WORKFLOW-001 (Refactoring Workflow Enhancement)
--
-- UUID: b2c3d4e5-1234-4567-8901-0123456789ab
-- NOTE: Original UUID was changed from a1b2c3d4-9999-4999-8999-999999999999
--       to avoid collision with VALUATION sub-agent (registered in
--       20251220_register_industrial_subagents.sql)

BEGIN;

-- ============================================================================
-- REGRESSION-VALIDATOR SUB-AGENT
-- ============================================================================

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, script_path, context_file, active, metadata)
VALUES (
  'b2c3d4e5-1234-4567-8901-0123456789ab'::uuid,
  'Regression Validator Sub-Agent',
  'REGRESSION',
  'Validates that refactoring changes maintain backward compatibility. Captures baseline test results, compares before/after states, validates API signatures unchanged, and checks import path resolution. Essential for structural and architectural refactoring SDs.',
  'automatic',
  95,  -- High priority for refactoring SDs
  'lib/sub-agents/regression.js',
  'CLAUDE-REGRESSION.md',
  true,
  jsonb_build_object(
    'version', '1.0.0',
    'category', 'quality_assurance',
    'applicable_sd_types', ARRAY['refactor'],
    'required_for_intensities', ARRAY['structural', 'architectural'],
    'optional_for_intensities', ARRAY['cosmetic'],
    'artifacts_produced', ARRAY['regression_analysis', 'baseline_snapshot', 'comparison_report'],
    'success_patterns', ARRAY[
      'Capture baseline test results before any changes',
      'Document public API signatures (exports, function parameters)',
      'Track import dependency graph',
      'Compare test coverage before/after',
      'Verify all public APIs maintain signatures',
      'Check import paths resolve correctly after moves'
    ],
    'failure_patterns', ARRAY[
      'Skipping baseline test capture',
      'Not documenting current API signatures',
      'Ignoring import path changes',
      'Changing function signatures without deprecation',
      'Removing exports without migration path',
      'Breaking circular dependency in unexpected ways'
    ],
    'integration_points', ARRAY[
      'DependencyAnalyzer for import graph',
      'Test runner for baseline/comparison',
      'TypeScript compiler for type checking',
      'ESLint for code quality validation'
    ]
  )
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  priority = EXCLUDED.priority,
  script_path = EXCLUDED.script_path,
  context_file = EXCLUDED.context_file,
  active = EXCLUDED.active,
  metadata = EXCLUDED.metadata;

-- ============================================================================
-- REGRESSION SUB-AGENT TRIGGERS
-- ============================================================================

-- Primary triggers: Refactoring keywords
INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
  -- High priority: Direct refactoring triggers
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'refactor', 'keyword', 'SD', 95),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'refactoring', 'keyword', 'SD', 95),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'restructure', 'keyword', 'SD', 90),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'reorganize', 'keyword', 'SD', 85),

  -- Medium priority: Compatibility-focused triggers
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'backward compatibility', 'pattern', 'PRD', 95),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'backwards compatible', 'pattern', 'PRD', 95),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'no behavior change', 'pattern', 'PRD', 90),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'no functional change', 'pattern', 'PRD', 90),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'regression', 'keyword', 'PRD', 90),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'regression test', 'pattern', 'PRD', 85),

  -- Structural change triggers
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'extract method', 'pattern', 'SD', 85),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'extract function', 'pattern', 'SD', 85),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'extract component', 'pattern', 'SD', 85),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'consolidate', 'keyword', 'SD', 80),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'move file', 'pattern', 'SD', 80),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'rename', 'keyword', 'SD', 75),

  -- API change triggers
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'api signature', 'pattern', 'PRD', 90),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'public api', 'pattern', 'PRD', 85),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'breaking change', 'pattern', 'PRD', 95),
  ('b2c3d4e5-1234-4567-8901-0123456789ab'::uuid, 'deprecate', 'keyword', 'PRD', 85)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- REGRESSION SUB-AGENT HANDOFF TEMPLATE
-- ============================================================================
-- NOTE: sub_agent_id is VARCHAR (not UUID) and version is INTEGER in this table
-- Delete existing if any, then insert

DELETE FROM leo_sub_agent_handoffs WHERE sub_agent_id = 'b2c3d4e5-1234-4567-8901-0123456789ab';

INSERT INTO leo_sub_agent_handoffs (sub_agent_id, handoff_template, validation_rules, required_outputs, success_criteria, version, active)
VALUES (
  'b2c3d4e5-1234-4567-8901-0123456789ab',  -- VARCHAR, not UUID
  jsonb_build_object(
    'template_type', 'regression_validation',
    'sections', ARRAY[
      'baseline_capture',
      'change_analysis',
      'comparison_results',
      'verdict'
    ],
    'baseline_capture_format', jsonb_build_object(
      'test_results', 'Object with test suite name -> {passed, failed, skipped}',
      'api_signatures', 'Array of {file, exports: [{name, type, parameters}]}',
      'import_graph', 'Object with file -> [imported_files]',
      'coverage_metrics', 'Object with {lines, branches, functions, statements}'
    ),
    'comparison_format', jsonb_build_object(
      'tests_unchanged', 'Boolean - all tests pass same as before',
      'api_compatible', 'Boolean - no breaking API changes',
      'imports_resolved', 'Boolean - all imports still resolve',
      'coverage_maintained', 'Boolean - coverage not decreased'
    )
  ),
  jsonb_build_array(
    'baseline_captured_before_changes',
    'comparison_run_after_changes',
    'all_tests_passing',
    'no_breaking_api_changes',
    'imports_resolve_correctly'
  ),
  jsonb_build_array(
    'regression_analysis',
    'baseline_snapshot',
    'comparison_report'
  ),
  jsonb_build_object(
    'PASS', 'All tests pass, no API changes, all imports resolve',
    'CONDITIONAL_PASS', 'Tests pass, minor documented API changes with migration path',
    'FAIL', 'Tests fail OR undocumented API changes OR broken imports'
  ),
  1,  -- version is INTEGER
  true
);

-- ============================================================================
-- VALIDATION
-- ============================================================================

COMMIT;

DO $$
DECLARE
  trigger_count INT;
BEGIN
  SELECT COUNT(*) INTO trigger_count
  FROM leo_sub_agent_triggers
  WHERE sub_agent_id = 'b2c3d4e5-1234-4567-8901-0123456789ab'::uuid;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'REGRESSION-VALIDATOR Sub-Agent Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Sub-agent code: REGRESSION';
  RAISE NOTICE 'Priority: 95 (high - always runs for refactoring SDs)';
  RAISE NOTICE 'Triggers registered: %', trigger_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Trigger contexts:';
  RAISE NOTICE '  SD context:  refactor, restructure, reorganize, extract, consolidate';
  RAISE NOTICE '  PRD context: backward compatibility, regression, breaking change';
  RAISE NOTICE '';
  RAISE NOTICE 'Required for intensities: structural, architectural';
  RAISE NOTICE 'Optional for intensities: cosmetic';
  RAISE NOTICE '';
  RAISE NOTICE 'Validation checklist:';
  RAISE NOTICE '  1. Capture baseline (tests, API signatures, imports)';
  RAISE NOTICE '  2. Perform refactoring';
  RAISE NOTICE '  3. Compare results (tests, API, imports)';
  RAISE NOTICE '  4. Verdict: PASS | CONDITIONAL_PASS | FAIL';
  RAISE NOTICE '';
  RAISE NOTICE 'Implementation: lib/sub-agents/regression.js';
  RAISE NOTICE 'Context file:   CLAUDE-REGRESSION.md';
  RAISE NOTICE '============================================================';
END $$;
