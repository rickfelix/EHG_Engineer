/**
 * LEO Protocol Orchestrator Constants
 * Phase definitions and requirements
 *
 * Extracted from leo-protocol-orchestrator.js for modularity
 * SD-LEO-REFACTOR-ORCH-002
 */

/**
 * Immutable phase sequence
 */
export const PHASES = ['LEAD', 'PLAN', 'EXEC', 'VERIFICATION', 'APPROVAL'];

/**
 * Valid statuses for SD execution
 */
export const VALID_STATUSES = ['approved', 'in_progress', 'pending', 'ready'];

/**
 * Phase requirements (cannot be bypassed)
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
 * Priority mapping for backlog items
 */
export const PRIORITY_MAP = {
  'Very High': 'CRITICAL',
  'High': 'HIGH',
  'Medium': 'MEDIUM',
  'Low': 'LOW',
  'Very Low': 'LOW'
};
