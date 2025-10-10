-- LEO Protocol Enhancement #5: Mandatory Sub-Agent Verification
-- Purpose: Prevent PLAN->LEAD handoff without required sub-agent verifications
-- Root Cause Fixed: No sub-agent verifications (no requirement)
-- Date: 2025-10-10
-- Related SD: SD-AGENT-MIGRATION-001 had zero sub-agent executions

-- ============================================================================
-- FUNCTION: Check required sub-agents based on SD scope
-- ============================================================================

CREATE OR REPLACE FUNCTION check_required_sub_agents(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  missing_agents JSONB := '[]'::jsonb;
  verified_agents JSONB := '[]'::jsonb;
  agent_record RECORD;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'SD not found',
      'can_proceed', false
    );
  END IF;

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
      'confidence', confidence_score,
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
      'reason', 'Always required for all SDs',
      'trigger_keywords', ARRAY['test', 'coverage', 'quality'],
      'priority', 'CRITICAL'
    );
  END IF;

  -- ============================================================================
  -- AGENT 2: Database Architect (if database/migration keywords)
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
        'confidence', confidence_score,
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
        'priority', 'HIGH'
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 3: Design Agent (if UI/UX/component keywords)
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
        'confidence', confidence_score,
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
        'priority', 'HIGH'
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 4: Security Architect (if authentication/security keywords)
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
        'confidence', confidence_score,
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
        'priority', 'CRITICAL'
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 5: Performance Lead (if performance/optimization keywords)
  -- ============================================================================
  IF sd.scope ILIKE '%performance%' OR sd.scope ILIKE '%optimization%' OR sd.scope ILIKE '%load%' OR
     sd.scope ILIKE '%scale%' OR sd.priority IN ('critical', 'high') THEN -- High priority SDs need performance review
    IF EXISTS (
      SELECT 1 FROM sub_agent_execution_results
      WHERE sd_id = sd_id_param AND sub_agent_code = 'PERFORMANCE'
    ) THEN
      SELECT jsonb_build_object(
        'code', 'PERFORMANCE',
        'name', 'Performance Lead',
        'verdict', verdict,
        'confidence', confidence_score,
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
        'priority', 'MEDIUM'
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 6: Systems Analyst (if integration/existing code keywords)
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
        'confidence', confidence_score,
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
        'priority', 'MEDIUM'
      );
    END IF;
  END IF;

  -- ============================================================================
  -- AGENT 7: Continuous Improvement Coach (ALWAYS REQUIRED at end)
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
      'priority', 'CRITICAL'
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
-- FUNCTION: Get sub-agent trigger recommendations
-- ============================================================================

CREATE OR REPLACE FUNCTION get_subagent_recommendations(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  verification_status JSONB;
  recommendations JSONB := '[]'::jsonb;
  agent JSONB;
BEGIN
  verification_status := check_required_sub_agents(sd_id_param);

  -- Generate CLI commands for missing agents
  FOR agent IN SELECT * FROM jsonb_array_elements(verification_status->'missing_agents')
  LOOP
    recommendations := recommendations || jsonb_build_object(
      'agent_code', agent->>'code',
      'agent_name', agent->>'name',
      'command', format('node scripts/trigger-%s-subagent.js %s', lower(agent->>'code'), sd_id_param),
      'priority', agent->>'priority',
      'reason', agent->>'reason'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'has_missing', jsonb_array_length(verification_status->'missing_agents') > 0,
    'recommendations', recommendations,
    'verification_status', verification_status
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION check_required_sub_agents IS 'Checks if all required sub-agents have verified the SD based on scope keywords - returns list of missing/verified agents';
COMMENT ON FUNCTION get_subagent_recommendations IS 'Returns CLI commands to trigger missing sub-agents - useful for automated execution';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'LEO Protocol Enhancement #5 applied successfully';
  RAISE NOTICE 'Function created: check_required_sub_agents(sd_id)';
  RAISE NOTICE 'Function created: get_subagent_recommendations(sd_id)';
  RAISE NOTICE 'Enforcement: PLAN->LEAD handoff blocked if missing_agents > 0';
  RAISE NOTICE 'Always required: QA Director, Continuous Improvement Coach';
  RAISE NOTICE 'Conditionally required: Database Architect, Design Agent, Security Architect, Performance Lead, Systems Analyst';
END $$;
