/**
 * Phase Requirements for LEO Protocol Orchestrator
 * Part of SD-LEO-REFACTOR-ORCH-MAIN-001
 *
 * Defines the immutable phase sequence and requirements
 */

/**
 * The immutable phase sequence
 */
export const PHASES = ['LEAD', 'PLAN', 'EXEC', 'VERIFICATION', 'APPROVAL'];

/**
 * Phase requirements (cannot be bypassed)
 * Each phase has a set of requirements that must be validated
 */
export const PHASE_REQUIREMENTS = {
  LEAD: [
    'session_prologue_completed',
    'priority_justified',
    'strategic_objectives_defined',
    'handoff_created_in_database',
    'no_over_engineering_check'
  ],
  PLAN: [
    'prd_created_in_database',
    'acceptance_criteria_defined',
    'sub_agents_activated',
    'test_plan_created',
    'handoff_from_lead_received'
  ],
  EXEC: [
    'pre_implementation_checklist',
    'correct_app_verified',
    'screenshots_taken',
    'implementation_completed',
    'git_commit_created',
    'github_push_completed'
  ],
  VERIFICATION: [
    'all_tests_executed',
    'acceptance_criteria_verified',
    'sub_agent_consensus',
    'supervisor_verification_done',
    'confidence_score_calculated'
  ],
  APPROVAL: [
    'human_approval_requested',
    'over_engineering_rubric_run',
    'human_decision_received',
    'status_updated_in_database',
    'retrospective_completed'
  ]
};

/**
 * Valid SD statuses for execution
 */
export const VALID_EXECUTION_STATUSES = ['approved', 'in_progress', 'pending', 'ready'];
