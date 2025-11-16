-- SD-LEO-PROTOCOL-V4-4-0: US-003 - Add Adaptive Validation to Progress Breakdown
-- Purpose: Enhance get_progress_breakdown() to include validation_mode, justification, and conditions
-- Date: 2025-11-15
-- Related: US-002 (Sub-Agent Adaptive Validation System)

-- ============================================================================
-- FUNCTION: Enhanced check_required_sub_agents with Adaptive Validation Details
-- ============================================================================

CREATE OR REPLACE FUNCTION check_required_sub_agents(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  missing_agents JSONB := '[]'::jsonb;
  verified_agents JSONB := '[]'::jsonb;
  agent_record RECORD;
  has_exec_handoff BOOLEAN;

  -- Sub-agent result with adaptive validation fields
  testing_result RECORD;
  docmon_result RECORD;
  github_result RECORD;
  design_result RECORD;
  database_result RECORD;
  stories_result RECORD;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'SD not found',
      'can_proceed', false
    );
  END IF;

  -- Check if EXEC->PLAN handoff exists (means implementation is complete)
  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND handoff_type IN ('EXEC-to-PLAN', 'implementation_to_verification')
  ) INTO has_exec_handoff;

  -- ============================================================================
  -- AGENT 1: QA Director (ALWAYS REQUIRED)
  -- ============================================================================
  SELECT
    sub_agent_code,
    verdict,
    confidence,
    validation_mode,
    justification,
    conditions,
    created_at,
    critical_issues,
    warnings,
    recommendations
  INTO testing_result
  FROM sub_agent_execution_results
  WHERE sd_id = sd_id_param AND sub_agent_code = 'TESTING'
  ORDER BY created_at DESC
  LIMIT 1;

  IF testing_result.verdict IN ('PASS', 'CONDITIONAL_PASS') THEN
    verified_agents := verified_agents || jsonb_build_object(
      'code', 'TESTING',
      'name', 'QA Engineering Director',
      'verdict', testing_result.verdict,
      'confidence', testing_result.confidence,
      'validation_mode', testing_result.validation_mode,
      'justification', testing_result.justification,
      'conditions', testing_result.conditions,
      'executed_at', testing_result.created_at,
      'critical_issues_count', COALESCE(jsonb_array_length(testing_result.critical_issues), 0),
      'warnings_count', COALESCE(jsonb_array_length(testing_result.warnings), 0)
    );
  ELSE
    missing_agents := missing_agents || jsonb_build_object(
      'code', 'TESTING',
      'name', 'QA Engineering Director',
      'reason', 'E2E testing validation required',
      'last_verdict', COALESCE(testing_result.verdict, 'NOT_RUN'),
      'last_validation_mode', testing_result.validation_mode
    );
  END IF;

  -- ============================================================================
  -- AGENT 2: Documentation Monitor (ALWAYS REQUIRED)
  -- ============================================================================
  SELECT
    sub_agent_code,
    verdict,
    confidence,
    validation_mode,
    justification,
    conditions,
    created_at,
    critical_issues,
    warnings,
    recommendations
  INTO docmon_result
  FROM sub_agent_execution_results
  WHERE sd_id = sd_id_param AND sub_agent_code = 'DOCMON'
  ORDER BY created_at DESC
  LIMIT 1;

  IF docmon_result.verdict IN ('PASS', 'CONDITIONAL_PASS') THEN
    verified_agents := verified_agents || jsonb_build_object(
      'code', 'DOCMON',
      'name', 'Documentation Monitor',
      'verdict', docmon_result.verdict,
      'confidence', docmon_result.confidence,
      'validation_mode', docmon_result.validation_mode,
      'justification', docmon_result.justification,
      'conditions', docmon_result.conditions,
      'executed_at', docmon_result.created_at,
      'critical_issues_count', COALESCE(jsonb_array_length(docmon_result.critical_issues), 0),
      'warnings_count', COALESCE(jsonb_array_length(docmon_result.warnings), 0)
    );
  ELSE
    missing_agents := missing_agents || jsonb_build_object(
      'code', 'DOCMON',
      'name', 'Documentation Monitor',
      'reason', 'Database-first documentation compliance required',
      'last_verdict', COALESCE(docmon_result.verdict, 'NOT_RUN'),
      'last_validation_mode', docmon_result.validation_mode
    );
  END IF;

  -- ============================================================================
  -- AGENT 3: GitHub CI/CD Platform (CONDITIONALLY REQUIRED)
  -- ============================================================================
  IF has_exec_handoff THEN
    SELECT
      sub_agent_code,
      verdict,
      confidence,
      validation_mode,
      justification,
      conditions,
      created_at,
      critical_issues,
      warnings,
      recommendations
    INTO github_result
    FROM sub_agent_execution_results
    WHERE sd_id = sd_id_param AND sub_agent_code = 'GITHUB'
    ORDER BY created_at DESC
    LIMIT 1;

    IF github_result.verdict IN ('PASS', 'CONDITIONAL_PASS') THEN
      verified_agents := verified_agents || jsonb_build_object(
        'code', 'GITHUB',
        'name', 'DevOps Platform Architect',
        'verdict', github_result.verdict,
        'confidence', github_result.confidence,
        'validation_mode', github_result.validation_mode,
        'justification', github_result.justification,
        'conditions', github_result.conditions,
        'executed_at', github_result.created_at,
        'critical_issues_count', COALESCE(jsonb_array_length(github_result.critical_issues), 0),
        'warnings_count', COALESCE(jsonb_array_length(github_result.warnings), 0)
      );
    ELSE
      missing_agents := missing_agents || jsonb_build_object(
        'code', 'GITHUB',
        'name', 'DevOps Platform Architect',
        'reason', 'GitHub Actions CI/CD validation required (EXEC complete)',
        'last_verdict', COALESCE(github_result.verdict, 'NOT_RUN'),
        'last_validation_mode', github_result.validation_mode
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 4: UI/UX Design Sub-Agent (CONDITIONALLY REQUIRED)
  -- ============================================================================
  -- Only required if SD has UI/UX tag
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(sd.tags) AS tag
    WHERE tag ILIKE '%ui%' OR tag ILIKE '%ux%' OR tag ILIKE '%design%' OR tag ILIKE '%component%'
  ) AND has_exec_handoff THEN
    SELECT
      sub_agent_code,
      verdict,
      confidence,
      validation_mode,
      justification,
      conditions,
      created_at,
      critical_issues,
      warnings,
      recommendations
    INTO design_result
    FROM sub_agent_execution_results
    WHERE sd_id = sd_id_param AND sub_agent_code = 'DESIGN'
    ORDER BY created_at DESC
    LIMIT 1;

    IF design_result.verdict IN ('PASS', 'CONDITIONAL_PASS') THEN
      verified_agents := verified_agents || jsonb_build_object(
        'code', 'DESIGN',
        'name', 'Senior Design Sub-Agent',
        'verdict', design_result.verdict,
        'confidence', design_result.confidence,
        'validation_mode', design_result.validation_mode,
        'justification', design_result.justification,
        'conditions', design_result.conditions,
        'executed_at', design_result.created_at,
        'critical_issues_count', COALESCE(jsonb_array_length(design_result.critical_issues), 0),
        'warnings_count', COALESCE(jsonb_array_length(design_result.warnings), 0)
      );
    ELSE
      missing_agents := missing_agents || jsonb_build_object(
        'code', 'DESIGN',
        'name', 'Senior Design Sub-Agent',
        'reason', 'UI/UX design validation required (UI/UX SD)',
        'last_verdict', COALESCE(design_result.verdict, 'NOT_RUN'),
        'last_validation_mode', design_result.validation_mode
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 5: Database Architect (CONDITIONALLY REQUIRED)
  -- ============================================================================
  -- Only required if SD has database/schema tag
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(sd.tags) AS tag
    WHERE tag ILIKE '%database%' OR tag ILIKE '%schema%' OR tag ILIKE '%migration%' OR tag ILIKE '%sql%'
  ) AND has_exec_handoff THEN
    SELECT
      sub_agent_code,
      verdict,
      confidence,
      validation_mode,
      justification,
      conditions,
      created_at,
      critical_issues,
      warnings,
      recommendations
    INTO database_result
    FROM sub_agent_execution_results
    WHERE sd_id = sd_id_param AND sub_agent_code = 'DATABASE'
    ORDER BY created_at DESC
    LIMIT 1;

    IF database_result.verdict IN ('PASS', 'CONDITIONAL_PASS') THEN
      verified_agents := verified_agents || jsonb_build_object(
        'code', 'DATABASE',
        'name', 'Principal Database Architect',
        'verdict', database_result.verdict,
        'confidence', database_result.confidence,
        'validation_mode', database_result.validation_mode,
        'justification', database_result.justification,
        'conditions', database_result.conditions,
        'executed_at', database_result.created_at,
        'critical_issues_count', COALESCE(jsonb_array_length(database_result.critical_issues), 0),
        'warnings_count', COALESCE(jsonb_array_length(database_result.warnings), 0)
      );
    ELSE
      missing_agents := missing_agents || jsonb_build_object(
        'code', 'DATABASE',
        'name', 'Principal Database Architect',
        'reason', 'Database schema validation required (Database SD)',
        'last_verdict', COALESCE(database_result.verdict, 'NOT_RUN'),
        'last_validation_mode', database_result.validation_mode
      );
    END IF;
  END IF;

  -- ============================================================================
  -- RETURN RESULTS
  -- ============================================================================
  RETURN jsonb_build_object(
    'sd_id', sd_id_param,
    'verified_agents', verified_agents,
    'missing_agents', missing_agents,
    'all_verified', jsonb_array_length(missing_agents) = 0,
    'can_proceed', jsonb_array_length(missing_agents) = 0,
    'total_verified', jsonb_array_length(verified_agents),
    'total_missing', jsonb_array_length(missing_agents),
    'has_conditional_pass', EXISTS (
      SELECT 1 FROM jsonb_array_elements(verified_agents) AS agent
      WHERE agent->>'verdict' = 'CONDITIONAL_PASS'
    ),
    'conditional_pass_count', (
      SELECT COUNT(*)
      FROM jsonb_array_elements(verified_agents) AS agent
      WHERE agent->>'verdict' = 'CONDITIONAL_PASS'
    )
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION check_required_sub_agents IS
'SD-LEO-PROTOCOL-V4-4-0: Enhanced sub-agent verification with adaptive validation support.
Returns detailed agent results including validation_mode, justification, and conditions fields.
Accepts both PASS and CONDITIONAL_PASS verdicts. Includes counts for conditional passes.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'SD-LEO-PROTOCOL-V4-4-0: US-003 - Progress Calculation Enhancement';
  RAISE NOTICE 'Function updated: check_required_sub_agents(sd_id)';
  RAISE NOTICE 'Enhancement: Added validation_mode, justification, conditions to sub-agent results';
  RAISE NOTICE 'Enhancement: Added conditional_pass tracking and counts';
  RAISE NOTICE 'Enhancement: Added critical_issues_count and warnings_count for each agent';
  RAISE NOTICE 'Compatibility: Existing PASS verdicts continue to work as before';
  RAISE NOTICE 'New Feature: CONDITIONAL_PASS verdicts now tracked with full context';
END $$;
