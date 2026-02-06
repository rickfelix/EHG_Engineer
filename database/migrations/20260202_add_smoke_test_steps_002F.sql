-- Add smoke test steps for SD-LEO-SELF-IMPROVE-002F
-- Phase 6: Outcome Signal & Loop Closure

UPDATE strategic_directives
SET smoke_test_steps = jsonb_build_array(
  jsonb_build_object(
    'step_number', 1,
    'instruction', 'Create an enhancement proposal and mark it as applied: INSERT INTO enhancement_proposals (proposal_id, proposal_type, title, description, status, applied_at) VALUES (''test-outcome-' || gen_random_uuid()::text || ''', ''performance'', ''Test Outcome Tracking'', ''Verify outcome signal and loop closure tracking'', ''applied'', NOW());',
    'expected_outcome', 'Enhancement proposal created with status=applied and applied_at timestamp populated'
  ),
  jsonb_build_object(
    'step_number', 2,
    'instruction', 'Query v_improvement_lineage view to verify lineage is tracked: SELECT proposal_id, proposal_type, status, applied_at, outcome_signal, loop_closed_at FROM v_improvement_lineage WHERE proposal_id LIKE ''test-outcome-%'' ORDER BY applied_at DESC LIMIT 1;',
    'expected_outcome', 'View returns the test proposal with complete lineage information including applied_at timestamp'
  ),
  jsonb_build_object(
    'step_number', 3,
    'instruction', 'Record outcome signal (success): UPDATE enhancement_proposals SET outcome_signal = ''success'', outcome_details = jsonb_build_object(''validation'', ''Smoke test verification'', ''impact'', ''Confirmed outcome tracking works'') WHERE proposal_id LIKE ''test-outcome-%'' AND applied_at IS NOT NULL;',
    'expected_outcome', 'outcome_signal column updated to ''success'' with outcome_details JSONB populated'
  ),
  jsonb_build_object(
    'step_number', 4,
    'instruction', 'Verify loop closure: UPDATE enhancement_proposals SET loop_closed_at = NOW() WHERE proposal_id LIKE ''test-outcome-%'' AND outcome_signal IS NOT NULL;',
    'expected_outcome', 'loop_closed_at timestamp populated, indicating the improvement loop is closed'
  ),
  jsonb_build_object(
    'step_number', 5,
    'instruction', 'Query final state from v_improvement_lineage: SELECT proposal_id, status, outcome_signal, loop_closed_at, (loop_closed_at - applied_at) as time_to_closure FROM v_improvement_lineage WHERE proposal_id LIKE ''test-outcome-%'';',
    'expected_outcome', 'View shows complete improvement cycle: applied_at → outcome_signal (success) → loop_closed_at with calculated time_to_closure duration'
  )
)
WHERE uuid = 'fc01f49d-38e1-4f5a-9e9a-45fb43e0d8c7'
  AND sd_id = 'SD-LEO-SELF-IMPROVE-002F';
