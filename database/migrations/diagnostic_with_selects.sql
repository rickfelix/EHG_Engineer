-- Diagnostic using SELECT statements (will show actual output in Supabase)

-- Test 1: Current progress calculation
SELECT
  'Current Progress' as test,
  calculate_sd_progress('SD-PROOF-DRIVEN-1758340937844') as progress_value,
  CASE
    WHEN calculate_sd_progress('SD-PROOF-DRIVEN-1758340937844') = 100
    THEN 'PASS - Function updated'
    ELSE 'FAIL - Function NOT updated (still old version)'
  END as status;

-- Test 2: User story count
SELECT
  'User Story Count' as test,
  COUNT(*) as count,
  CASE
    WHEN COUNT(*) = 0
    THEN 'No user stories - should validate as TRUE'
    ELSE 'Has user stories - need validation_status check'
  END as expected_behavior
FROM user_stories
WHERE sd_id = 'SD-PROOF-DRIVEN-1758340937844';

-- Test 3: Progress breakdown
SELECT
  'Progress Breakdown' as test,
  get_progress_breakdown('SD-PROOF-DRIVEN-1758340937844')->'phases'->'PLAN_verification'->>'user_stories_validated' as user_stories_validated,
  get_progress_breakdown('SD-PROOF-DRIVEN-1758340937844')->'phases'->'PLAN_verification'->>'progress' as plan_verification_progress,
  get_progress_breakdown('SD-PROOF-DRIVEN-1758340937844')->>'total_progress' as total_progress;

-- Test 4: Check all phase progress
SELECT
  'Phase Progress Details' as test,
  get_progress_breakdown('SD-PROOF-DRIVEN-1758340937844')->'phases'->'LEAD_approval'->>'progress' as lead_approval,
  get_progress_breakdown('SD-PROOF-DRIVEN-1758340937844')->'phases'->'PLAN_prd'->>'progress' as plan_prd,
  get_progress_breakdown('SD-PROOF-DRIVEN-1758340937844')->'phases'->'EXEC_implementation'->>'progress' as exec_impl,
  get_progress_breakdown('SD-PROOF-DRIVEN-1758340937844')->'phases'->'PLAN_verification'->>'progress' as plan_verify,
  get_progress_breakdown('SD-PROOF-DRIVEN-1758340937844')->'phases'->'LEAD_final_approval'->>'progress' as lead_final;
