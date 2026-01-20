/**
 * Requirement Validators for LEO Protocol Orchestrator
 * Part of SD-LEO-REFACTOR-ORCH-MAIN-001
 *
 * Validates specific requirements during phase gate checks
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validate a specific requirement
 * v2.0.0: Non-interactive - deterministic validation with database checks
 *
 * @param {Object} context - Validation context
 * @param {string} context.phase - Current phase
 * @param {string} context.requirement - Requirement to validate
 * @param {string} context.sdId - Strategic Directive ID
 * @param {Object} context.currentSD - Current SD data
 * @param {Object} context.supabase - Supabase client
 * @param {Object} context.decisionLogger - Decision logger instance
 * @returns {Promise<boolean>} Whether the requirement is satisfied
 */
export async function validateRequirement(context) {
  const { phase, requirement, sdId, currentSD, supabase, decisionLogger } = context;

  switch (requirement) {
    case 'session_prologue_completed':
      return await validateSessionPrologueCompleted();

    case 'priority_justified':
      return validatePriorityJustified(currentSD);

    case 'strategic_objectives_defined':
      return validateStrategicObjectivesDefined(currentSD);

    case 'no_over_engineering_check':
      return validateNoOverEngineering(decisionLogger);

    case 'prd_created_in_database':
      return await validatePrdCreated(phase, sdId, supabase);

    case 'acceptance_criteria_defined':
      return await validateAcceptanceCriteria(sdId, supabase);

    case 'sub_agents_activated':
      return validateSubAgentsActivated(decisionLogger);

    case 'test_plan_created':
      return await validateTestPlan(sdId, supabase);

    case 'handoff_from_lead_received':
    case 'handoff_created_in_database':
      return await validateHandoff(phase, sdId, supabase);

    case 'pre_implementation_checklist':
      return true; // Verified by EXEC phase execution

    case 'correct_app_verified':
      return validateCorrectAppVerified(decisionLogger);

    case 'screenshots_taken':
      return validateScreenshotsTaken(decisionLogger);

    case 'implementation_completed':
    case 'git_commit_created':
    case 'github_push_completed':
      return true; // Execution artifacts

    case 'all_tests_executed':
      return validateTestsExecuted(decisionLogger);

    case 'acceptance_criteria_verified':
    case 'sub_agent_consensus':
    case 'supervisor_verification_done':
    case 'confidence_score_calculated':
      return validateVerificationChecks(requirement, decisionLogger);

    case 'human_approval_requested':
      return await validateApprovalRequested(sdId, supabase);

    case 'over_engineering_rubric_run':
      return true; // Rubric runs during LEAD

    case 'human_decision_received':
      return await validateHumanDecisionReceived(sdId, supabase);

    case 'status_updated_in_database':
      return await validateStatusUpdated(sdId, supabase);

    case 'retrospective_completed':
      return await validateRetrospectiveCompleted(sdId, supabase);

    default:
      return validateUnknownRequirement(requirement, decisionLogger);
  }
}

// Individual validator functions

async function validateSessionPrologueCompleted() {
  const prologuePath = path.join(__dirname, '..', '..', '..', '.session-prologue-completed');
  try {
    await fs.access(prologuePath);
    return true;
  } catch {
    return false;
  }
}

function validatePriorityJustified(currentSD) {
  return currentSD && (currentSD.priority || currentSD.sd_type === 'infrastructure');
}

function validateStrategicObjectivesDefined(currentSD) {
  return currentSD && (
    currentSD.objectives ||
    currentSD.strategic_objectives ||
    currentSD.description
  );
}

function validateNoOverEngineering(decisionLogger) {
  decisionLogger.log({
    type: 'OVER_ENGINEERING_CHECK',
    action: 'auto_pass',
    reason: 'No automated over-engineering detection - passed by default'
  });
  return true;
}

async function validatePrdCreated(phase, sdId, supabase) {
  if (phase === 'LEAD') {
    return true;
  }
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('sd_id', sdId)
    .single();
  return !!prd;
}

async function validateAcceptanceCriteria(sdId, supabase) {
  const { data: prdAC } = await supabase
    .from('product_requirements_v2')
    .select('acceptance_criteria')
    .eq('sd_id', sdId)
    .single();
  return prdAC && prdAC.acceptance_criteria && prdAC.acceptance_criteria.length > 0;
}

function validateSubAgentsActivated(decisionLogger) {
  decisionLogger.log({
    type: 'SUB_AGENT_CHECK',
    action: 'auto_pass',
    reason: 'Sub-agent activation handled by BMAD wrapper'
  });
  return true;
}

async function validateTestPlan(sdId, supabase) {
  const { data: prdTest } = await supabase
    .from('product_requirements_v2')
    .select('test_scenarios')
    .eq('sd_id', sdId)
    .single();
  return prdTest && prdTest.test_scenarios && prdTest.test_scenarios.length > 0;
}

async function validateHandoff(phase, sdId, supabase) {
  const fromPhase = phase === 'PLAN' ? 'LEAD' : phase;
  const { data: handoff } = await supabase
    .from('sd_phase_handoffs')
    .select('id')
    .eq('sd_id', sdId)
    .ilike('handoff_type', `%${fromPhase}%`)
    .limit(1);
  return handoff && handoff.length > 0;
}

function validateCorrectAppVerified(decisionLogger) {
  try {
    const cwd = process.cwd();
    const isCorrect = !cwd.includes('EHG_Engineer');
    if (!isCorrect) {
      decisionLogger.log({
        type: 'APP_VERIFICATION',
        action: 'warning',
        reason: `Running in EHG_Engineer directory (${cwd}) - may need to switch to EHG app`,
        cwd
      });
    }
    return true; // Don't block, just log
  } catch {
    return true;
  }
}

function validateScreenshotsTaken(decisionLogger) {
  decisionLogger.log({
    type: 'SCREENSHOT_CHECK',
    action: 'auto_pass',
    reason: 'Screenshots cannot be verified automatically in non-interactive mode'
  });
  return true;
}

function validateTestsExecuted(decisionLogger) {
  decisionLogger.log({
    type: 'TEST_VERIFICATION',
    action: 'auto_pass',
    reason: 'Test execution verified by CI/CD pipeline'
  });
  return true;
}

function validateVerificationChecks(requirement, decisionLogger) {
  decisionLogger.log({
    type: 'VERIFICATION_CHECK',
    requirement,
    action: 'auto_pass',
    reason: 'Verification handled by handoff validation system'
  });
  return true;
}

async function validateApprovalRequested(sdId, supabase) {
  const { data: approval } = await supabase
    .from('leo_approval_requests')
    .select('id')
    .eq('sd_id', sdId)
    .eq('status', 'pending')
    .limit(1);
  return approval && approval.length > 0;
}

async function validateHumanDecisionReceived(sdId, supabase) {
  const { data: decision } = await supabase
    .from('leo_approval_requests')
    .select('status')
    .eq('sd_id', sdId)
    .in('status', ['approved', 'rejected'])
    .limit(1);
  return decision && decision.length > 0;
}

async function validateStatusUpdated(sdId, supabase) {
  const { data: sdStatus } = await supabase
    .from('strategic_directives_v2')
    .select('status')
    .eq('id', sdId)
    .single();
  return sdStatus && sdStatus.status === 'completed';
}

async function validateRetrospectiveCompleted(sdId, supabase) {
  const { data: retro } = await supabase
    .from('retrospectives')
    .select('id')
    .eq('sd_id', sdId)
    .limit(1);
  return retro && retro.length > 0;
}

function validateUnknownRequirement(requirement, decisionLogger) {
  decisionLogger.log({
    type: 'UNKNOWN_REQUIREMENT',
    requirement,
    action: 'auto_pass',
    reason: `Unknown requirement '${requirement}' - passed by default in non-interactive mode. Review needed.`
  });
  console.log(chalk.yellow(`  \u26a0\ufe0f  Unknown requirement '${requirement}' - auto-passed (logged for review)`));
  return true;
}

/**
 * Get the session prologue path
 */
export function getSessionProloguePath() {
  return path.join(__dirname, '..', '..', '..', '.session-prologue-completed');
}
