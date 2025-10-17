-- Migration: Add GitHub/DevOps Sub-Agent Enforcement
-- Date: 2025-10-12
-- Issue: SD-SUBAGENT-IMPROVE-001 and prior SDs never verified CI/CD pipelines
--        GitHub sub-agent (DevOps Platform Architect) exists but not enforced
-- Solution: Add GITHUB sub-agent to check_required_sub_agents() function
--           Make it MANDATORY after EXEC implementation (when handoff exists)

-- ============================================================================
-- ENHANCED FUNCTION: Check required sub-agents (with GITHUB enforcement)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_required_sub_agents(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  missing_agents JSONB := '[]'::jsonb;
  verified_agents JSONB := '[]'::jsonb;
  agent_record RECORD;
  has_exec_handoff BOOLEAN;
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
  IF EXISTS (
    SELECT 1 FROM sub_agent_execution_results
    WHERE sd_id = sd_id_param
    AND sub_agent_code = 'TESTING'
    AND verdict IN ('PASS', 'CONDITIONAL_PASS')
  ) THEN
    SELECT jsonb_build_object(
      'code', 'TESTING',
      'name', 'QA Engineering Director',
      'verdict', verdict,
      'confidence', confidence,
      'executed_at', created_at
    ) INTO agent_record
    FROM sub_agent_execution_results
    WHERE sd_id = sd_id_param AND sub_agent_code = 'TESTING'
    ORDER BY created_at DESC
    LIMIT 1;

    verified_agents := verified_agents || agent_record;
  ELSE
    missing_agents := missing_agents || jsonb_build_object(
      'code', 'TESTING',
      'name', 'QA Engineering Director',
      'reason', 'Always required for all SDs - E2E testing mandatory',
      'trigger_keywords', ARRAY['test', 'coverage', 'quality', 'e2e', 'playwright'],
      'priority', 'CRITICAL',
      'command', format('node scripts/qa-engineering-director-enhanced.js %s --full-e2e', sd_id_param)
    );
  END IF;

  -- ============================================================================
  -- AGENT 2: GitHub/DevOps Platform Architect (MANDATORY after EXEC)
  -- NEW: Critical gap - CI/CD verification was missing from all SDs
  -- ============================================================================
  IF has_exec_handoff THEN
    IF EXISTS (
      SELECT 1 FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param
      AND sub_agent_code = 'GITHUB'
      AND verdict IN ('PASS', 'CONDITIONAL_PASS')
    ) THEN
      SELECT jsonb_build_object(
        'code', 'GITHUB',
        'name', 'DevOps Platform Architect',
        'verdict', verdict,
        'confidence', confidence,
        'executed_at', created_at
      ) INTO agent_record
      FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param AND sub_agent_code = 'GITHUB'
      ORDER BY created_at DESC
      LIMIT 1;

      verified_agents := verified_agents || agent_record;
    ELSE
      missing_agents := missing_agents || jsonb_build_object(
        'code', 'GITHUB',
        'name', 'DevOps Platform Architect',
        'reason', 'Required after EXEC implementation to verify CI/CD pipelines, GitHub Actions, and deployment status',
        'trigger_keywords', ARRAY['github', 'ci/cd', 'pipeline', 'actions', 'deployment'],
        'priority', 'CRITICAL',
        'command', format('node scripts/github-actions-verifier.js %s', sd_id_param),
        'manual_check', 'gh run list --limit 5 && gh run view [run-id]'
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 3: Database Architect (if database/migration keywords)
  -- ============================================================================
  IF sd.scope ILIKE '%database%' OR sd.scope ILIKE '%migration%' OR sd.scope ILIKE '%schema%' OR sd.scope ILIKE '%table%' THEN
    IF EXISTS (
      SELECT 1 FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param AND sub_agent_code = 'DATABASE'
    ) THEN
      SELECT jsonb_build_object(
        'code', 'DATABASE',
        'name', 'Database Architect',
        'verdict', verdict,
        'confidence', confidence,
        'executed_at', created_at
      ) INTO agent_record
      FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param AND sub_agent_code = 'DATABASE'
      ORDER BY created_at DESC
      LIMIT 1;

      verified_agents := verified_agents || agent_record;
    ELSE
      missing_agents := missing_agents || jsonb_build_object(
        'code', 'DATABASE',
        'name', 'Database Architect',
        'reason', 'Required because scope mentions database operations',
        'trigger_keywords', ARRAY['database', 'migration', 'schema', 'table'],
        'priority', 'HIGH',
        'command', format('node scripts/database-architect-schema-review.js %s', sd_id_param)
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 4: Design Agent (if UI/UX/component keywords)
  -- ============================================================================
  IF sd.scope ILIKE '%UI%' OR sd.scope ILIKE '%component%' OR sd.scope ILIKE '%design%' OR
     sd.scope ILIKE '%interface%' OR sd.scope ILIKE '%page%' OR sd.scope ILIKE '%view%' THEN
    IF EXISTS (
      SELECT 1 FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param AND sub_agent_code = 'DESIGN'
    ) THEN
      SELECT jsonb_build_object(
        'code', 'DESIGN',
        'name', 'Design Agent',
        'verdict', verdict,
        'confidence', confidence,
        'executed_at', created_at
      ) INTO agent_record
      FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param AND sub_agent_code = 'DESIGN'
      ORDER BY created_at DESC
      LIMIT 1;

      verified_agents := verified_agents || agent_record;
    ELSE
      missing_agents := missing_agents || jsonb_build_object(
        'code', 'DESIGN',
        'name', 'Design Agent',
        'reason', 'Required because scope mentions UI/UX features',
        'trigger_keywords', ARRAY['UI', 'component', 'design', 'interface', 'page'],
        'priority', 'HIGH',
        'command', format('node scripts/design-subagent-evaluation.js %s', sd_id_param)
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 5: Security Architect (if authentication/security keywords)
  -- ============================================================================
  IF sd.scope ILIKE '%auth%' OR sd.scope ILIKE '%security%' OR sd.scope ILIKE '%permission%' OR
     sd.scope ILIKE '%RLS%' OR sd.scope ILIKE '%encryption%' THEN
    IF EXISTS (
      SELECT 1 FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param AND sub_agent_code = 'SECURITY'
    ) THEN
      SELECT jsonb_build_object(
        'code', 'SECURITY',
        'name', 'Security Architect',
        'verdict', verdict,
        'confidence', confidence,
        'executed_at', created_at
      ) INTO agent_record
      FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param AND sub_agent_code = 'SECURITY'
      ORDER BY created_at DESC
      LIMIT 1;

      verified_agents := verified_agents || agent_record;
    ELSE
      missing_agents := missing_agents || jsonb_build_object(
        'code', 'SECURITY',
        'name', 'Security Architect',
        'reason', 'Required because scope mentions security features',
        'trigger_keywords', ARRAY['auth', 'security', 'permission', 'RLS'],
        'priority', 'CRITICAL',
        'command', format('node scripts/security-architect-assessment.js %s', sd_id_param)
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 6: Performance Lead (if performance/optimization keywords)
  -- ============================================================================
  IF sd.scope ILIKE '%performance%' OR sd.scope ILIKE '%optimization%' OR sd.scope ILIKE '%load%' OR
     sd.scope ILIKE '%scale%' OR sd.priority >= 70 THEN -- High priority SDs need performance review
    IF EXISTS (
      SELECT 1 FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param AND sub_agent_code = 'PERFORMANCE'
    ) THEN
      SELECT jsonb_build_object(
        'code', 'PERFORMANCE',
        'name', 'Performance Lead',
        'verdict', verdict,
        'confidence', confidence,
        'executed_at', created_at
      ) INTO agent_record
      FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param AND sub_agent_code = 'PERFORMANCE'
      ORDER BY created_at DESC
      LIMIT 1;

      verified_agents := verified_agents || agent_record;
    ELSE
      missing_agents := missing_agents || jsonb_build_object(
        'code', 'PERFORMANCE',
        'name', 'Performance Lead',
        'reason', 'Required because scope mentions performance or SD priority is high',
        'trigger_keywords', ARRAY['performance', 'optimization', 'load', 'scale'],
        'priority', 'MEDIUM',
        'command', format('node scripts/performance-lead-requirements.js %s', sd_id_param)
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 7: Systems Analyst (if integration/existing code keywords)
  -- ============================================================================
  IF sd.scope ILIKE '%integration%' OR sd.scope ILIKE '%existing%' OR sd.scope ILIKE '%refactor%' THEN
    IF EXISTS (
      SELECT 1 FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param AND sub_agent_code = 'VALIDATION'
    ) THEN
      SELECT jsonb_build_object(
        'code', 'VALIDATION',
        'name', 'Systems Analyst',
        'verdict', verdict,
        'confidence', confidence,
        'executed_at', created_at
      ) INTO agent_record
      FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param AND sub_agent_code = 'VALIDATION'
      ORDER BY created_at DESC
      LIMIT 1;

      verified_agents := verified_agents || agent_record;
    ELSE
      missing_agents := missing_agents || jsonb_build_object(
        'code', 'VALIDATION',
        'name', 'Systems Analyst',
        'reason', 'Required because scope mentions integration with existing systems',
        'trigger_keywords', ARRAY['integration', 'existing', 'refactor'],
        'priority', 'MEDIUM',
        'command', format('node scripts/systems-analyst-codebase-audit.js %s', sd_id_param)
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 8: Continuous Improvement Coach (ALWAYS REQUIRED at end)
  -- ============================================================================
  IF EXISTS (
    SELECT 1 FROM retrospectives
    WHERE sd_id = sd_id_param
    AND quality_score >= 70
  ) THEN
    SELECT jsonb_build_object(
      'code', 'RETRO',
      'name', 'Continuous Improvement Coach',
      'verdict', 'PASS',
      'quality_score', quality_score,
      'executed_at', conducted_date
    ) INTO agent_record
    FROM retrospectives
    WHERE sd_id = sd_id_param
    ORDER BY conducted_date DESC
    LIMIT 1;

    verified_agents := verified_agents || agent_record;
  ELSE
    missing_agents := missing_agents || jsonb_build_object(
      'code', 'RETRO',
      'name', 'Continuous Improvement Coach',
      'reason', 'Always required to generate retrospective at SD completion',
      'trigger_keywords', ARRAY['retrospective', 'lessons', 'improvement'],
      'priority', 'CRITICAL',
      'command', format('node scripts/generate-comprehensive-retrospective.js %s', sd_id_param)
    );
  END IF;

  RETURN jsonb_build_object(
    'all_verified', jsonb_array_length(missing_agents) = 0,
    'verified_agents', verified_agents,
    'missing_agents', missing_agents,
    'total_required', jsonb_array_length(missing_agents) + jsonb_array_length(verified_agents),
    'verified_count', jsonb_array_length(verified_agents),
    'missing_count', jsonb_array_length(missing_agents),
    'can_proceed', jsonb_array_length(missing_agents) = 0
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION check_required_sub_agents IS 'Enhanced to include GITHUB sub-agent enforcement after EXEC implementation. Checks if all required sub-agents have verified the SD based on scope keywords and phase. Returns list of missing/verified agents with commands to execute them.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'LEO Protocol Enhancement: GitHub Sub-Agent Enforcement';
  RAISE NOTICE 'Function updated: check_required_sub_agents(sd_id)';
  RAISE NOTICE 'New agent: GITHUB (DevOps Platform Architect) - MANDATORY after EXEC';
  RAISE NOTICE 'Priority: CRITICAL';
  RAISE NOTICE 'Trigger: Automatically after EXEC->PLAN handoff created';
  RAISE NOTICE 'Verification: gh run list --limit 5 && gh run view [run-id]';
END $$;
