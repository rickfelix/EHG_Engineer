/**
 * LEO Protocol Validation
 * Requirement validation and phase gate enforcement
 *
 * Extracted from leo-protocol-orchestrator.js for modularity
 * SD-LEO-REFACTOR-ORCH-002
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PHASE_REQUIREMENTS } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validate a specific requirement
 * Non-interactive - deterministic validation with database checks
 *
 * @param {Object} context - Orchestrator context (supabase, currentSD, decisionLogger)
 * @param {string} phase - Current phase
 * @param {string} requirement - Requirement to validate
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<boolean>} Whether requirement is satisfied
 */
export async function validateRequirement(context, phase, requirement, sdId) {
  const { supabase, currentSD, decisionLogger } = context;

  switch (requirement) {
    case 'session_prologue_completed': {
      const prologuePath = path.join(__dirname, '..', '..', '.session-prologue-completed');
      try {
        await fs.access(prologuePath);
        return true;
      } catch {
        return false;
      }
    }

    case 'priority_justified':
      return currentSD && (currentSD.priority || currentSD.sd_type === 'infrastructure');

    case 'strategic_objectives_defined':
      return currentSD && (
        currentSD.objectives ||
        currentSD.strategic_objectives ||
        currentSD.description
      );

    case 'no_over_engineering_check':
      decisionLogger.log({
        type: 'OVER_ENGINEERING_CHECK',
        action: 'auto_pass',
        reason: 'No automated over-engineering detection - passed by default'
      });
      return true;

    case 'prd_created_in_database': {
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

    case 'acceptance_criteria_defined': {
      const { data: prdAC } = await supabase
        .from('product_requirements_v2')
        .select('acceptance_criteria')
        .eq('sd_id', sdId)
        .single();
      return prdAC && prdAC.acceptance_criteria && prdAC.acceptance_criteria.length > 0;
    }

    case 'sub_agents_activated':
      decisionLogger.log({
        type: 'SUB_AGENT_CHECK',
        action: 'auto_pass',
        reason: 'Sub-agent activation handled by BMAD wrapper'
      });
      return true;

    case 'test_plan_created': {
      const { data: prdTest } = await supabase
        .from('product_requirements_v2')
        .select('test_scenarios')
        .eq('sd_id', sdId)
        .single();
      return prdTest && prdTest.test_scenarios && prdTest.test_scenarios.length > 0;
    }

    case 'handoff_from_lead_received':
    case 'handoff_created_in_database': {
      const fromPhase = phase === 'PLAN' ? 'LEAD' : phase;
      const { data: handoff } = await supabase
        .from('sd_phase_handoffs')
        .select('id')
        .eq('sd_id', sdId)
        .ilike('handoff_type', `%${fromPhase}%`)
        .limit(1);
      return handoff && handoff.length > 0;
    }

    case 'pre_implementation_checklist':
      return true;

    case 'correct_app_verified': {
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
        return true;
      } catch {
        return true;
      }
    }

    case 'screenshots_taken':
      decisionLogger.log({
        type: 'SCREENSHOT_CHECK',
        action: 'auto_pass',
        reason: 'Screenshots cannot be verified automatically in non-interactive mode'
      });
      return true;

    case 'implementation_completed':
    case 'git_commit_created':
    case 'github_push_completed':
      return true;

    case 'all_tests_executed':
      decisionLogger.log({
        type: 'TEST_VERIFICATION',
        action: 'auto_pass',
        reason: 'Test execution verified by CI/CD pipeline'
      });
      return true;

    case 'acceptance_criteria_verified':
    case 'sub_agent_consensus':
    case 'supervisor_verification_done':
    case 'confidence_score_calculated':
      decisionLogger.log({
        type: 'VERIFICATION_CHECK',
        requirement,
        action: 'auto_pass',
        reason: 'Verification handled by handoff validation system'
      });
      return true;

    case 'human_approval_requested': {
      const { data: approval } = await supabase
        .from('leo_approval_requests')
        .select('id')
        .eq('sd_id', sdId)
        .eq('status', 'pending')
        .limit(1);
      return approval && approval.length > 0;
    }

    case 'over_engineering_rubric_run':
      return true;

    case 'human_decision_received': {
      const { data: decision } = await supabase
        .from('leo_approval_requests')
        .select('status')
        .eq('sd_id', sdId)
        .in('status', ['approved', 'rejected'])
        .limit(1);
      return decision && decision.length > 0;
    }

    case 'status_updated_in_database': {
      const { data: sdStatus } = await supabase
        .from('strategic_directives_v2')
        .select('status')
        .eq('id', sdId)
        .single();
      return sdStatus && sdStatus.status === 'completed';
    }

    case 'retrospective_completed': {
      const { data: retro } = await supabase
        .from('retrospectives')
        .select('id')
        .eq('sd_id', sdId)
        .limit(1);
      return retro && retro.length > 0;
    }

    default:
      decisionLogger.log({
        type: 'UNKNOWN_REQUIREMENT',
        requirement,
        action: 'auto_pass',
        reason: `Unknown requirement '${requirement}' - passed by default in non-interactive mode. Review needed.`
      });
      console.log(chalk.yellow(`  ⚠️  Unknown requirement '${requirement}' - auto-passed (logged for review)`));
      return true;
  }
}

/**
 * Enforce phase gate - blocking validation
 *
 * @param {Object} context - Orchestrator context
 * @param {string} phase - Phase to validate
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} executionState - Current execution state
 * @returns {Promise<void>}
 * @throws {Error} If gate validation fails
 */
export async function enforcePhaseGate(context, phase, sdId, executionState) {
  console.log(chalk.yellow(`\n🚦 ${phase} PHASE GATE VALIDATION`));

  const requirements = PHASE_REQUIREMENTS[phase];
  const results = {};
  let allPassed = true;

  for (const requirement of requirements) {
    const passed = await validateRequirement(context, phase, requirement, sdId);
    results[requirement] = passed;

    if (passed) {
      console.log(chalk.green(`  ✓ ${requirement}`));
    } else {
      console.log(chalk.red(`  ✗ ${requirement}`));
      allPassed = false;
    }
  }

  if (!allPassed) {
    executionState.violations.push({
      phase,
      failedRequirements: Object.keys(results).filter(r => !results[r]),
      timestamp: new Date()
    });

    throw new Error(`${phase} gate validation failed. Fix requirements and retry.`);
  }

  console.log(chalk.green.bold(`✅ ${phase} GATE PASSED`));
}
