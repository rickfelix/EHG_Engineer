/**
 * Validators Domain
 * Handles phase validation logic for LEO Protocol
 *
 * @module execute-phase/validators
 */

import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cross-platform path resolution
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '../..');
const EHG_ROOT = path.resolve(__dirname, '../../../ehg');

/**
 * Validate phase completion with all validation checks
 * @param {Object} supabase - Supabase client
 * @param {string} phase - Phase name
 * @param {Object} sd - Strategic Directive record
 * @param {Object} phaseConfig - Phase configuration
 * @returns {Object} Validation result with score and errors
 */
export async function validatePhase(supabase, phase, sd, phaseConfig) {
  console.log(chalk.cyan(`\n   🔍 Validating ${phase} phase for ${sd.id}...`));

  const errors = [];
  const warnings = [];
  let score = 100;

  // CRITICAL: Time-based validation (4-minute rule)
  const completionTime = await validateCompletionTiming(sd, phase);
  if (!completionTime.valid) {
    errors.push(completionTime.error);
    score -= 50;
  }

  // EXEC phase requires git evidence
  if (phase === 'EXEC') {
    const gitEvidence = await validateGitEvidence(sd.id);
    if (!gitEvidence.valid) {
      errors.push(`No git commits found for ${sd.id} - implementation not verified`);
      score -= 50;
    } else {
      console.log(chalk.green(`   ✅ Found ${gitEvidence.commitCount} git commits`));
    }
  }

  // PRD requirement validation
  if (phase === 'PLAN' || phase === 'EXEC') {
    const prdValidation = await validatePRDExists(supabase, sd.id);
    if (!prdValidation.valid) {
      errors.push('No PRD found - cannot proceed without requirements');
      score -= 30;
    }
  }

  // APPROVAL phase timing checks
  if (phase === 'APPROVAL') {
    const approvalTiming = await validateApprovalTiming(sd);
    if (!approvalTiming.valid) {
      warnings.push(approvalTiming.warning);
      score -= 10;
    }
  }

  const isValid = errors.length === 0 && score >= 70;

  if (!isValid) {
    console.log(chalk.red(`   ❌ Validation failed (Score: ${score}/100)`));
    errors.forEach(error => console.log(chalk.red(`      • ${error}`)));
  } else {
    console.log(chalk.green(`   ✅ Validation passed (Score: ${score}/100)`));
  }

  if (warnings.length > 0) {
    warnings.forEach(warning => console.log(chalk.yellow(`   ⚠️  ${warning}`)));
  }

  return {
    valid: isValid,
    score,
    errors,
    warnings
  };
}

/**
 * Validate completion timing (4-minute rule)
 * @param {Object} sd - Strategic Directive record
 * @param {string} phase - Phase name
 * @returns {Object} Timing validation result
 */
export async function validateCompletionTiming(sd, phase) {
  try {
    const startTime = sd.created_at || sd.updated_at;
    const currentTime = new Date().toISOString();

    const timeDiff = new Date(currentTime) - new Date(startTime);
    const minutesElapsed = Math.floor(timeDiff / (1000 * 60));

    console.log(chalk.gray(`   ⏱️  Time elapsed: ${minutesElapsed} minutes`));

    // RED FLAG: Completed in less than 4 minutes
    if (minutesElapsed < 4 && phase === 'APPROVAL') {
      return {
        valid: false,
        error: `🚨 RED FLAG: SD completed in ${minutesElapsed} minutes (< 4 min threshold). Likely false completion.`,
        minutesElapsed
      };
    }

    // WARNING: Completed very quickly for complex phases
    if (minutesElapsed < 10 && (phase === 'EXEC' || phase === 'VERIFICATION')) {
      return {
        valid: true,
        warning: `Fast completion: ${minutesElapsed} minutes for ${phase} phase`,
        minutesElapsed
      };
    }

    return { valid: true, minutesElapsed };
  } catch (error) {
    return { valid: true, error: 'Could not validate timing' };
  }
}

/**
 * Validate git evidence for SD implementation
 * @param {string} sdId - Strategic Directive ID
 * @returns {Object} Git evidence validation result
 */
export async function validateGitEvidence(sdId) {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Check both repos for git commits mentioning the SD-ID
    const repos = [
      EHG_ENGINEER_ROOT,
      EHG_ROOT
    ];

    let totalCommits = 0;
    const commitDetails = [];

    for (const repoPath of repos) {
      try {
        const { stdout } = await execAsync(
          `cd "${repoPath}" && git log --oneline --since="7 days ago" --grep="${sdId}" --all`,
          { timeout: 5000 }
        );

        if (stdout.trim()) {
          const commits = stdout.trim().split('\n');
          totalCommits += commits.length;
          commitDetails.push(...commits.map(commit => ({ repo: repoPath, commit })));
        }
      } catch (error) {
        // Repo might not exist, continue
      }
    }

    return {
      valid: totalCommits > 0,
      commitCount: totalCommits,
      commits: commitDetails
    };
  } catch (error) {
    return { valid: false, error: 'Could not validate git evidence' };
  }
}

/**
 * Validate PRD exists for SD
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @returns {Object} PRD validation result
 */
export async function validatePRDExists(supabase, sdId) {
  try {
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('id, title')
      .eq('directive_id', sdId)
      .single();

    return {
      valid: !!prd,
      prd: prd
    };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Validate approval timing for full SD lifecycle
 * @param {Object} sd - Strategic Directive record
 * @returns {Object} Approval timing validation result
 */
export async function validateApprovalTiming(sd) {
  const startTime = new Date(sd.created_at || sd.updated_at);
  const currentTime = new Date();
  const totalMinutes = Math.floor((currentTime - startTime) / (1000 * 60));

  if (totalMinutes < 15) {
    return {
      valid: false,
      warning: `Full SD lifecycle completed in ${totalMinutes} minutes - suspiciously fast`
    };
  }

  return { valid: true };
}

/**
 * Check if phase is already complete
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {string} phase - Phase name
 * @returns {boolean} True if phase is complete
 */
export async function isPhaseComplete(supabase, sdId, phase) {
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('current_phase')
    .eq('id', sdId)
    .single();

  if (!sd) return false;

  const completedPhases = {
    'LEAD': ['LEAD_COMPLETE', 'PLAN_DESIGN', 'PLAN_COMPLETE', 'EXEC_IMPLEMENTATION'],
    'PLAN': ['PLAN_COMPLETE', 'EXEC_IMPLEMENTATION'],
    'EXEC': ['EXEC_COMPLETE', 'VERIFICATION_TESTING'],
    'VERIFICATION': ['VERIFICATION_COMPLETE', 'APPROVAL_REVIEW'],
    'APPROVAL': ['APPROVAL_COMPLETE', 'COMPLETED']
  };

  return completedPhases[phase]?.includes(sd.current_phase) || false;
}

export default {
  validatePhase,
  validateCompletionTiming,
  validateGitEvidence,
  validatePRDExists,
  validateApprovalTiming,
  isPhaseComplete
};
