-- ============================================================================
-- FIX: Update all database functions to use sd_key instead of legacy_id
-- Date: 2026-01-25
-- Issue: PAT-LEGACYID-001 - legacy_id column was removed from strategic_directives_v2
-- Replacement: Use sd_key column instead
-- ============================================================================

-- ============================================================================
-- STEP 0: Drop functions/views with changed return types (required before recreation)
-- ============================================================================
DROP FUNCTION IF EXISTS get_sd_children_depth_first(text) CASCADE;
DROP FUNCTION IF EXISTS get_unaligned_sds() CASCADE;
DROP FUNCTION IF EXISTS lead_preflight_kr_check(varchar) CASCADE;

-- Drop views that will be recreated
DROP VIEW IF EXISTS v_sd_execution_status CASCADE;
DROP VIEW IF EXISTS v_sd_next_candidates CASCADE;
DROP VIEW IF EXISTS v_sd_okr_context CASCADE;
DROP VIEW IF EXISTS v_sd_hierarchy CASCADE;
DROP VIEW IF EXISTS v_sd_alignment_warnings CASCADE;

-- ============================================================================
-- 1. assess_sd_type_change_risk - Fix return value
-- ============================================================================
CREATE OR REPLACE FUNCTION assess_sd_type_change_risk(
  p_sd_id VARCHAR(100),
  p_from_type VARCHAR(50),
  p_to_type VARCHAR(50)
)
RETURNS JSONB AS $$
DECLARE
  risk_score INTEGER := 0;
  risk_factors JSONB := '[]'::jsonb;
  risk_level VARCHAR(20);
  sd RECORD;
  from_profile RECORD;
  to_profile RECORD;
  user_story_count INTEGER;
  deliverable_count INTEGER;
  completed_deliverables INTEGER;
  handoff_count INTEGER;
  requirement_reduction INTEGER := 0;
BEGIN
  -- Get SD details
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = p_sd_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'SD not found',
      'sd_id', p_sd_id
    );
  END IF;

  -- Get validation profiles
  SELECT * INTO from_profile FROM sd_type_validation_profiles WHERE sd_type = p_from_type;
  SELECT * INTO to_profile FROM sd_type_validation_profiles WHERE sd_type = p_to_type;

  -- Count existing work
  SELECT COUNT(*) INTO user_story_count FROM user_stories WHERE sd_id = sd.id;
  SELECT COUNT(*) INTO deliverable_count FROM sd_scope_deliverables WHERE sd_id = sd.id;
  SELECT COUNT(*) INTO completed_deliverables FROM sd_scope_deliverables
    WHERE sd_id = sd.id AND completion_status = 'completed';
  SELECT COUNT(DISTINCT handoff_type) INTO handoff_count FROM sd_phase_handoffs
    WHERE sd_id = p_sd_id AND status = 'accepted';

  -- ============================================================================
  -- RISK FACTOR 1: Requirement Reduction (0-40 points)
  -- ============================================================================
  IF COALESCE(from_profile.requires_e2e_tests, false) AND NOT COALESCE(to_profile.requires_e2e_tests, false) THEN
    risk_score := risk_score + 20;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'E2E Test Requirement Dropped',
      'points', 20,
      'description', 'Changing from type requiring E2E tests to type without E2E requirement'
    );
  END IF;

  IF COALESCE(from_profile.requires_user_stories, from_profile.requires_e2e_tests, false)
     AND NOT COALESCE(to_profile.requires_user_stories, to_profile.requires_e2e_tests, false) THEN
    risk_score := risk_score + 15;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'User Story Requirement Dropped',
      'points', 15,
      'description', 'Changing from type requiring user stories to type without story requirement'
    );
  END IF;

  IF COALESCE(from_profile.requires_deliverables, false) AND NOT COALESCE(to_profile.requires_deliverables, false) THEN
    risk_score := risk_score + 10;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Deliverables Requirement Dropped',
      'points', 10,
      'description', 'Changing from type requiring deliverables to type without deliverable tracking'
    );
  END IF;

  IF COALESCE(from_profile.requires_retrospective, false) AND NOT COALESCE(to_profile.requires_retrospective, false) THEN
    risk_score := risk_score + 5;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Retrospective Requirement Dropped',
      'points', 5,
      'description', 'Changing from type requiring retrospective to type without retrospective'
    );
  END IF;

  -- ============================================================================
  -- RISK FACTOR 2: Phase Timing (0-25 points)
  -- ============================================================================
  IF sd.current_phase = 'EXEC' THEN
    risk_score := risk_score + 15;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Change During EXEC Phase',
      'points', 15,
      'description', 'SD is currently in EXEC phase - type change may invalidate in-progress work'
    );
  END IF;

  IF sd.current_phase = 'LEAD_FINAL' THEN
    risk_score := risk_score + 25;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Change During Final Approval',
      'points', 25,
      'description', 'SD is in LEAD_FINAL phase - type change at this stage is highly suspicious'
    );
  END IF;

  IF sd.status = 'pending_approval' THEN
    risk_score := risk_score + 10;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Change While Pending Approval',
      'points', 10,
      'description', 'SD is pending approval - type change may be attempt to bypass review'
    );
  END IF;

  -- ============================================================================
  -- RISK FACTOR 3: Existing Work Impact (0-25 points)
  -- ============================================================================
  IF user_story_count > 0 AND NOT COALESCE(to_profile.requires_user_stories, to_profile.requires_e2e_tests, true) THEN
    risk_score := risk_score + (LEAST(user_story_count, 5) * 5);
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'User Stories May Be Orphaned',
      'points', LEAST(user_story_count, 5) * 5,
      'description', format('%s user stories exist but new type does not require stories', user_story_count)
    );
  END IF;

  IF completed_deliverables > 0 AND NOT COALESCE(to_profile.requires_deliverables, true) THEN
    risk_score := risk_score + 15;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Completed Deliverables May Be Orphaned',
      'points', 15,
      'description', format('%s completed deliverables exist but new type does not track deliverables', completed_deliverables)
    );
  END IF;

  -- ============================================================================
  -- RISK FACTOR 4: Pattern Detection (0-20 points)
  -- ============================================================================
  IF p_from_type = 'feature' AND p_to_type = 'infrastructure' THEN
    risk_score := risk_score + 10;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Feature-to-Infrastructure Pattern',
      'points', 10,
      'description', 'Changing from feature to infrastructure - common validation bypass pattern'
    );
  END IF;

  IF p_from_type = 'feature' AND p_to_type = 'docs' AND (user_story_count > 0 OR deliverable_count > 0) THEN
    risk_score := risk_score + 15;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Feature-to-Docs With Existing Work',
      'points', 15,
      'description', 'Changing from feature to docs when user stories or deliverables exist'
    );
  END IF;

  -- Multiple type changes check
  DECLARE
    recent_changes INTEGER;
  BEGIN
    SELECT COUNT(*) INTO recent_changes
    FROM sd_type_change_audit
    WHERE sd_id = p_sd_id
    AND created_at > NOW() - INTERVAL '7 days';

    IF recent_changes >= 2 THEN
      risk_score := risk_score + 20;
      risk_factors := risk_factors || jsonb_build_object(
        'factor', 'Multiple Recent Type Changes',
        'points', 20,
        'description', format('%s type changes in last 7 days - pattern suggests gaming the system', recent_changes + 1)
      );
    END IF;
  END;

  -- Cap score at 100
  risk_score := LEAST(risk_score, 100);

  IF risk_score <= 30 THEN
    risk_level := 'LOW';
  ELSIF risk_score <= 60 THEN
    risk_level := 'MEDIUM';
  ELSIF risk_score <= 80 THEN
    risk_level := 'HIGH';
  ELSE
    risk_level := 'CRITICAL';
  END IF;

  -- RETURN ASSESSMENT (FIXED: Use sd_key instead of legacy_id)
  RETURN jsonb_build_object(
    'sd_id', p_sd_id,
    'sd_key', sd.sd_key,  -- Changed from 'sd_legacy_id', sd.id
    'from_type', p_from_type,
    'to_type', p_to_type,
    'risk_score', risk_score,
    'risk_level', risk_level,
    'risk_factors', risk_factors,
    'blocked', risk_level = 'CRITICAL',
    'approval_required', risk_level = 'HIGH',
    'context', jsonb_build_object(
      'current_phase', sd.current_phase,
      'current_status', sd.status,
      'user_story_count', user_story_count,
      'deliverable_count', deliverable_count,
      'completed_deliverables', completed_deliverables,
      'handoff_count', handoff_count
    ),
    'recommendation', CASE risk_level
      WHEN 'LOW' THEN 'Proceed with type change'
      WHEN 'MEDIUM' THEN 'Review risk factors before proceeding'
      WHEN 'HIGH' THEN 'Requires Chairman approval before proceeding'
      WHEN 'CRITICAL' THEN 'Type change BLOCKED - too risky'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. calculate_dependency_health_score - Fix WHERE clauses
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_dependency_health_score(p_sd_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
  v_deps JSONB;
  v_total_deps INTEGER;
  v_completed_deps INTEGER;
  v_score NUMERIC;
BEGIN
  -- Get dependencies for this SD (FIXED: Use sd_key instead of legacy_id)
  SELECT dependencies INTO v_deps
  FROM strategic_directives_v2
  WHERE sd_key = p_sd_id;  -- Changed from legacy_id

  IF v_deps IS NULL OR jsonb_array_length(v_deps) = 0 THEN
    RETURN 1.00;
  END IF;

  v_total_deps := jsonb_array_length(v_deps);

  -- Count completed dependencies (FIXED: Use sd_key instead of legacy_id)
  SELECT COUNT(*) INTO v_completed_deps
  FROM jsonb_array_elements_text(v_deps) dep
  WHERE EXISTS (
    SELECT 1 FROM strategic_directives_v2 sd2
    WHERE sd2.sd_key = split_part(dep, ' ', 1)  -- Changed from legacy_id
    AND sd2.status = 'completed'
  );

  v_score := ROUND(v_completed_deps::NUMERIC / v_total_deps::NUMERIC, 2);

  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. check_lead_approval_kr_alignment - Fix dual id/legacy_id support
-- ============================================================================
CREATE OR REPLACE FUNCTION check_lead_approval_kr_alignment(p_sd_id VARCHAR)
RETURNS JSONB AS $$
DECLARE
  v_sd_id VARCHAR;
  v_alignment_count INT;
  v_kr_codes TEXT[];
  v_result JSONB;
BEGIN
  -- Get SD id (FIXED: Support both id and sd_key)
  SELECT id INTO v_sd_id
  FROM strategic_directives_v2
  WHERE id = p_sd_id OR sd_key = p_sd_id  -- Changed from legacy_id
  LIMIT 1;

  IF v_sd_id IS NULL THEN
    RETURN jsonb_build_object(
      'passed', FALSE,
      'gate', 'KR_ALIGNMENT',
      'message', 'SD not found: ' || p_sd_id
    );
  END IF;

  -- Check alignment
  SELECT COUNT(*), ARRAY_AGG(kr.code)
  INTO v_alignment_count, v_kr_codes
  FROM sd_key_result_alignment ska
  JOIN key_results kr ON ska.key_result_id = kr.id
  WHERE ska.sd_id = v_sd_id;

  IF v_alignment_count = 0 THEN
    RETURN jsonb_build_object(
      'passed', FALSE,
      'gate', 'KR_ALIGNMENT',
      'severity', 'warning',
      'message', 'SD has no Key Result alignment. Recommend running alignment before approval.',
      'action', 'Run: node scripts/align-sds-to-krs.js or manually align via sd_key_result_alignment table'
    );
  END IF;

  RETURN jsonb_build_object(
    'passed', TRUE,
    'gate', 'KR_ALIGNMENT',
    'message', 'SD aligned to ' || v_alignment_count || ' Key Result(s): ' || array_to_string(v_kr_codes, ', '),
    'kr_count', v_alignment_count,
    'kr_codes', v_kr_codes
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. get_sd_children_depth_first - Fix RETURNS TABLE and SELECT
-- ============================================================================
CREATE OR REPLACE FUNCTION get_sd_children_depth_first(p_sd_id TEXT)
RETURNS TABLE (
  id TEXT,
  sd_key TEXT,  -- Changed from legacy_id
  title TEXT,
  status TEXT,
  depth INT,
  execution_order INT
) AS $$
WITH RECURSIVE children AS (
  -- Start with immediate children
  SELECT
    sd.id,
    sd.sd_key,  -- Changed from legacy_id
    sd.title,
    sd.status,
    1 as depth,
    ROW_NUMBER() OVER (ORDER BY sd.sequence_rank, sd.created_at) as sibling_order,
    ARRAY[ROW_NUMBER() OVER (ORDER BY sd.sequence_rank, sd.created_at)] as order_path
  FROM strategic_directives_v2 sd
  WHERE sd.parent_sd_id = p_sd_id
    AND sd.is_active = TRUE

  UNION ALL

  -- Recurse to grandchildren
  SELECT
    sd.id,
    sd.sd_key,  -- Changed from legacy_id
    sd.title,
    sd.status,
    c.depth + 1,
    ROW_NUMBER() OVER (PARTITION BY sd.parent_sd_id ORDER BY sd.sequence_rank, sd.created_at),
    c.order_path || ROW_NUMBER() OVER (PARTITION BY sd.parent_sd_id ORDER BY sd.sequence_rank, sd.created_at)
  FROM strategic_directives_v2 sd
  INNER JOIN children c ON sd.parent_sd_id = c.id
  WHERE sd.is_active = TRUE
)
SELECT
  id,
  sd_key,  -- Changed from legacy_id
  title,
  status,
  depth,
  ROW_NUMBER() OVER (ORDER BY order_path) as execution_order
FROM children
ORDER BY order_path;
$$ LANGUAGE SQL;

-- ============================================================================
-- 5. get_unaligned_sds - Fix RETURNS TABLE and SELECT
-- ============================================================================
CREATE OR REPLACE FUNCTION get_unaligned_sds()
RETURNS TABLE (
  sd_id VARCHAR(50),
  sd_key VARCHAR(50),  -- Changed from legacy_id
  title VARCHAR(500),
  status VARCHAR(50),
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sd.id,
    sd.sd_key,  -- Changed from legacy_id
    sd.title,
    sd.status,
    sd.created_at
  FROM strategic_directives_v2 sd
  LEFT JOIN sd_key_result_alignment ska ON sd.id = ska.sd_id
  WHERE sd.is_active = TRUE
    AND sd.status NOT IN ('completed', 'cancelled', 'deferred')
    AND ska.id IS NULL
  ORDER BY sd.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. lead_preflight_kr_check - Update parameter name for clarity
-- ============================================================================
CREATE OR REPLACE FUNCTION lead_preflight_kr_check(p_sd_key VARCHAR)  -- Renamed from p_legacy_id
RETURNS TABLE (
  check_name TEXT,
  passed BOOLEAN,
  severity TEXT,
  message TEXT
) AS $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := check_lead_approval_kr_alignment(p_sd_key);  -- Pass sd_key

  RETURN QUERY SELECT
    'Key Result Alignment'::TEXT as check_name,
    (v_result->>'passed')::BOOLEAN as passed,
    COALESCE(v_result->>'severity', 'info')::TEXT as severity,
    (v_result->>'message')::TEXT as message;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Fix v_sd_execution_status view
-- ============================================================================
CREATE OR REPLACE VIEW v_sd_execution_status AS
SELECT
  bi.sd_id,
  sd.title,
  sd.priority,
  sd.status as sd_status,
  sd.progress_percentage,
  b.baseline_name,
  b.is_active as is_active_baseline,
  bi.sequence_rank,
  bi.track,
  bi.track_name,
  bi.estimated_effort_hours,
  bi.planned_start_date,
  bi.planned_end_date,
  bi.is_ready,
  bi.dependency_health_score,
  ea.actual_start_date,
  ea.actual_end_date,
  ea.actual_effort_hours,
  ea.status as execution_status,
  ea.blockers,
  ea.blocked_by_sd_ids,
  -- Variance calculations
  CASE
    WHEN bi.estimated_effort_hours > 0 AND ea.actual_effort_hours IS NOT NULL
    THEN ROUND((ea.actual_effort_hours / bi.estimated_effort_hours) * 100, 1)
    ELSE NULL
  END as effort_variance_pct,
  CASE
    WHEN bi.planned_end_date IS NOT NULL AND ea.actual_end_date IS NOT NULL
    THEN ea.actual_end_date::date - bi.planned_end_date
    ELSE NULL
  END as schedule_variance_days
FROM sd_baseline_items bi
JOIN sd_execution_baselines b ON bi.baseline_id = b.id
LEFT JOIN strategic_directives_v2 sd ON bi.sd_id = sd.sd_key  -- Changed from legacy_id
LEFT JOIN sd_execution_actuals ea ON bi.sd_id = ea.sd_id AND bi.baseline_id = ea.baseline_id
ORDER BY bi.sequence_rank;

-- ============================================================================
-- 8. Fix v_sd_next_candidates view
-- ============================================================================
CREATE OR REPLACE VIEW v_sd_next_candidates AS
WITH active_baseline AS (
  SELECT id FROM sd_execution_baselines WHERE is_active = TRUE LIMIT 1
),
dependency_status AS (
  SELECT
    bi.sd_id,
    bi.sequence_rank,
    bi.track,
    bi.dependencies_snapshot,
    COALESCE(
      (
        SELECT COUNT(*) = 0
        FROM jsonb_array_elements_text(bi.dependencies_snapshot) dep
        WHERE NOT EXISTS (
          SELECT 1 FROM strategic_directives_v2 sd2
          WHERE sd2.sd_key = split_part(dep, ' ', 1)  -- Changed from legacy_id
          AND sd2.status = 'completed'
        )
      ),
      TRUE
    ) as deps_satisfied
  FROM sd_baseline_items bi
  WHERE bi.baseline_id = (SELECT id FROM active_baseline)
)
SELECT
  bi.sd_id,
  sd.title,
  sd.priority,
  sd.status,
  sd.progress_percentage,
  bi.sequence_rank,
  bi.track,
  bi.track_name,
  bi.estimated_effort_hours,
  bi.dependency_health_score,
  ds.deps_satisfied,
  ea.status as execution_status,
  sd.is_working_on,
  CASE
    WHEN sd.is_working_on = TRUE THEN 1
    WHEN ea.status = 'in_progress' THEN 2
    WHEN ds.deps_satisfied AND sd.status IN ('draft', 'active') THEN 3
    WHEN sd.progress_percentage > 0 AND sd.progress_percentage < 100 THEN 4
    ELSE 5
  END as readiness_priority
FROM sd_baseline_items bi
JOIN strategic_directives_v2 sd ON bi.sd_id = sd.sd_key  -- Changed from legacy_id
JOIN dependency_status ds ON bi.sd_id = ds.sd_id
LEFT JOIN sd_execution_actuals ea ON bi.sd_id = ea.sd_id
  AND ea.baseline_id = (SELECT id FROM active_baseline)
WHERE bi.baseline_id = (SELECT id FROM active_baseline)
  AND sd.status NOT IN ('completed', 'cancelled')
ORDER BY readiness_priority, bi.sequence_rank;

-- ============================================================================
-- 9. Fix v_sd_okr_context view
-- ============================================================================
CREATE OR REPLACE VIEW v_sd_okr_context AS
SELECT
  sd.id as sd_uuid,
  sd.sd_key,  -- Changed from legacy_id
  sd.title as sd_title,
  sd.status,
  sd.progress_percentage,
  sd.is_working_on,
  COALESCE(
    jsonb_agg(DISTINCT jsonb_build_object(
      'kr_code', kr.code,
      'kr_title', kr.title,
      'kr_status', kr.status,
      'objective_code', o.code,
      'objective_title', o.title,
      'contribution_type', ska.contribution_type,
      'contribution_note', ska.contribution_note,
      'kr_progress_pct', CASE
        WHEN kr.direction = 'decrease' THEN
          ROUND(((kr.baseline_value - kr.current_value) / NULLIF(kr.baseline_value - kr.target_value, 0)) * 100, 1)
        ELSE
          ROUND(((kr.current_value - COALESCE(kr.baseline_value, 0)) / NULLIF(kr.target_value - COALESCE(kr.baseline_value, 0), 0)) * 100, 1)
      END
    )) FILTER (WHERE kr.id IS NOT NULL),
    '[]'::jsonb
  ) as aligned_krs,
  COUNT(DISTINCT kr.id) as aligned_kr_count
FROM strategic_directives_v2 sd
LEFT JOIN sd_key_result_alignment ska ON sd.id = ska.sd_id
LEFT JOIN key_results kr ON ska.key_result_id = kr.id AND kr.is_active = TRUE
LEFT JOIN objectives o ON kr.objective_id = o.id AND o.is_active = TRUE
WHERE sd.is_active = TRUE
GROUP BY sd.id, sd.sd_key, sd.title, sd.status, sd.progress_percentage, sd.is_working_on;

-- ============================================================================
-- Add migration comments
-- ============================================================================
COMMENT ON FUNCTION assess_sd_type_change_risk IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25)';

COMMENT ON FUNCTION calculate_dependency_health_score IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25)';

COMMENT ON FUNCTION check_lead_approval_kr_alignment IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25)';

COMMENT ON FUNCTION get_sd_children_depth_first IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25)';

COMMENT ON FUNCTION get_unaligned_sds IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25)';

COMMENT ON FUNCTION lead_preflight_kr_check IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25)';

COMMENT ON VIEW v_sd_execution_status IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25)';

COMMENT ON VIEW v_sd_next_candidates IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25)';

COMMENT ON VIEW v_sd_okr_context IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25)';

-- Verification query
SELECT 'Migration complete. All functions and views updated to use sd_key instead of legacy_id.' as status;

-- ============================================================================
-- 10. Fix v_sd_hierarchy view
-- ============================================================================
CREATE OR REPLACE VIEW v_sd_hierarchy AS
WITH RECURSIVE hierarchy AS (
  -- Base case: SDs with no parent (root level)
  SELECT
    id,
    sd_key,  -- Changed from legacy_id
    title,
    status,
    current_phase,
    parent_sd_id,
    0 as depth,
    ARRAY[sd_key::TEXT] as path,  -- Changed from legacy_id
    sd_key::TEXT as root_sd  -- Changed from legacy_id
  FROM strategic_directives_v2
  WHERE is_active = TRUE

  UNION ALL

  -- Recursive case: children
  SELECT
    sd.id,
    sd.sd_key,  -- Changed from legacy_id
    sd.title,
    sd.status,
    sd.current_phase,
    sd.parent_sd_id,
    h.depth + 1,
    h.path || sd.sd_key::TEXT,  -- Changed from legacy_id
    h.root_sd
  FROM strategic_directives_v2 sd
  INNER JOIN hierarchy h ON sd.parent_sd_id = h.id
  WHERE sd.is_active = TRUE
)
SELECT
  *,
  CASE
    WHEN status IN ('completed', 'cancelled') THEN TRUE
    ELSE FALSE
  END as is_complete
FROM hierarchy;

COMMENT ON VIEW v_sd_hierarchy IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25)';

-- ============================================================================
-- 11. Fix v_sd_alignment_warnings view
-- ============================================================================
CREATE OR REPLACE VIEW v_sd_alignment_warnings AS
SELECT
  sd.id,
  sd.sd_key,  -- Changed from legacy_id
  sd.title,
  sd.status,
  sd.created_at,
  sd.priority,
  CASE
    WHEN sd.status IN ('draft', 'lead_review') THEN 'warning'
    WHEN sd.status IN ('plan_active', 'exec_active', 'active', 'in_progress') THEN 'critical'
    ELSE 'info'
  END as severity,
  'SD has no Key Result alignment' as message
FROM strategic_directives_v2 sd
LEFT JOIN sd_key_result_alignment ska ON sd.id = ska.sd_id
WHERE sd.is_active = TRUE
  AND sd.status NOT IN ('completed', 'cancelled', 'deferred')
  AND ska.id IS NULL
ORDER BY
  CASE
    WHEN sd.status IN ('plan_active', 'exec_active', 'active', 'in_progress') THEN 1
    WHEN sd.status IN ('draft', 'lead_review') THEN 2
    ELSE 3
  END,
  sd.created_at DESC;

COMMENT ON VIEW v_sd_alignment_warnings IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25)';

-- ============================================================================
-- 12. Fix warn_on_sd_transition_without_kr function
-- ============================================================================
CREATE OR REPLACE FUNCTION warn_on_sd_transition_without_kr()
RETURNS TRIGGER AS $$
DECLARE
  v_alignment_count INT;
  v_transition_to_active BOOLEAN;
BEGIN
  -- Check if transitioning to an active phase
  v_transition_to_active := (
    OLD.status NOT IN ('plan_active', 'exec_active', 'active', 'in_progress')
    AND NEW.status IN ('plan_active', 'exec_active', 'active', 'in_progress')
  );

  IF v_transition_to_active THEN
    -- Check alignment count
    SELECT COUNT(*) INTO v_alignment_count
    FROM sd_key_result_alignment
    WHERE sd_id = NEW.id;

    IF v_alignment_count = 0 THEN
      -- Log warning (change to RAISE EXCEPTION to block)
      RAISE NOTICE 'SD % is transitioning to % without Key Result alignment. Consider running: node scripts/align-sds-to-krs.js',
        NEW.sd_key, NEW.status;  -- Changed from legacy_id to sd_key
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION warn_on_sd_transition_without_kr IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25)';
