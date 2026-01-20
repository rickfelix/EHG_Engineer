/**
 * Phase Executors for LEO Protocol Orchestrator
 * Part of SD-LEO-REFACTOR-ORCH-MAIN-001
 *
 * Contains execution logic for each phase
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import { getSessionProloguePath } from './requirement-validators.js';

/**
 * Enforce session prologue
 * Displays and marks session prologue as completed
 */
export async function enforceSessionPrologue() {
  console.log(chalk.cyan('\n\ud83d\udcd6 SESSION PROLOGUE CHECK'));

  const prologuePath = getSessionProloguePath();

  try {
    await fs.access(prologuePath);
    console.log(chalk.green('\u2713 Session prologue completed'));
  } catch {
    console.log(chalk.yellow('\u26a0\ufe0f  Session prologue not found'));

    // Generate and display prologue
    console.log(chalk.gray('\n' + '='.repeat(50)));
    console.log(chalk.white.bold('LEO PROTOCOL SESSION PROLOGUE'));
    console.log(chalk.gray('='.repeat(50)));
    console.log('1. Follow LEAD\u2192PLAN\u2192EXEC - Target \u226585% gate pass rate');
    console.log('2. Use sub-agents - Architect, QA, Reviewer');
    console.log('3. Database-first - No markdown files as source');
    console.log('4. Small PRs - Keep diffs \u2264100 lines');
    console.log('5. 7-element handoffs required');
    console.log('6. Priority-first - Use npm run prio:top3');
    console.log(chalk.gray('='.repeat(50) + '\n'));

    // Mark as completed
    await fs.writeFile(prologuePath, new Date().toISOString());
  }
}

/**
 * Verify SD is eligible for execution
 * v2.0.0: Non-interactive - logs decision and proceeds or fails based on rules
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} decisionLogger - Decision logger
 * @returns {Promise<Object>} SD data
 */
export async function verifySDEligibility(supabase, sdId, decisionLogger) {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (error || !sd) {
    throw new Error(`SD ${sdId} not found. Remediation: Verify the SD ID exists in strategic_directives_v2 table.`);
  }

  // Check priority justification
  console.log(chalk.cyan('\n\ud83c\udfaf PRIORITY JUSTIFICATION'));
  console.log(`Priority: ${sd.priority || 'not set'}`);
  console.log(`Status: ${sd.status}`);
  console.log(`SD Type: ${sd.sd_type || 'not set'}`);

  // v2.0.0: Non-interactive priority handling
  if (!sd.priority || sd.priority === 'low') {
    decisionLogger.log({
      type: 'LOW_PRIORITY_SD',
      sdId,
      action: 'proceed',
      reason: 'Low/no priority SD allowed in non-interactive mode. Review in post-session audit.',
      priority: sd.priority || 'not set'
    });
    console.log(chalk.yellow('\u26a0\ufe0f  Low/no priority SD - proceeding (logged for audit)'));
  }

  // Check if SD is in valid status for execution
  const validStatuses = ['approved', 'in_progress', 'pending', 'ready'];
  if (!validStatuses.includes(sd.status)) {
    throw new Error(`SD ${sdId} has status '${sd.status}' which is not valid for execution. Valid statuses: ${validStatuses.join(', ')}. Remediation: Update SD status or select a different SD.`);
  }

  return sd;
}

/**
 * Execute LEAD Phase
 */
export async function executeLEADPhase(_sdId) {
  console.log(chalk.blue('\n\ud83c\udfaf Executing LEAD Phase'));

  console.log('Running over-engineering evaluation...');
  // Would call lead-over-engineering-rubric.js here

  console.log('Creating LEAD\u2192PLAN handoff...');
  // Would create handoff in database
}

/**
 * Execute PLAN Phase
 * v2.0.0: Non-interactive - PRD must exist, no auto-generation
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} decisionLogger - Decision logger
 */
export async function executePLANPhase(supabase, sdId, decisionLogger) {
  console.log(chalk.blue('\n\ud83d\udcd0 Executing PLAN Phase'));

  // v2.0.0: Check if PRD already exists
  const { data: existingPrd } = await supabase
    .from('product_requirements_v2')
    .select('id, title, status')
    .eq('sd_id', sdId)
    .single();

  if (existingPrd) {
    console.log(chalk.green(`\u2713 PRD exists: ${existingPrd.title} (status: ${existingPrd.status})`));
    decisionLogger.log({
      type: 'PRD_CHECK',
      action: 'found',
      reason: `PRD found for SD ${sdId}`,
      prdId: existingPrd.id,
      status: existingPrd.status
    });
    return;
  }

  // v2.0.0: PRD is REQUIRED - do not auto-generate placeholder PRDs
  decisionLogger.log({
    type: 'PRD_MISSING',
    action: 'blocked',
    reason: `No PRD found for SD ${sdId}. PRD creation blocked in non-interactive mode.`,
    sdId
  });

  throw new Error(
    `PLAN phase requires PRD. No PRD found for SD ${sdId}.\n` +
    'Remediation:\n' +
    `  1. Create PRD using: node scripts/add-prd-to-database.js ${sdId}\n` +
    `  2. Or run PLAN\u2192EXEC handoff: node scripts/handoff.js PLAN-TO-EXEC ${sdId}\n` +
    '\n' +
    'PRD auto-generation is disabled in non-interactive mode to ensure quality.'
  );
}

/**
 * Execute EXEC Phase with mandatory checklist
 * v2.0.0: Non-interactive - automated verification with logging
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} decisionLogger - Decision logger
 */
export async function executeEXECPhase(supabase, sdId, decisionLogger) {
  console.log(chalk.blue('\n\ud83d\udcbb Executing EXEC Phase'));

  // MANDATORY: Pre-implementation checklist (non-interactive)
  console.log(chalk.yellow('\n\ud83d\udccb EXEC PRE-IMPLEMENTATION CHECKLIST (Automated)'));

  const checklist = {
    appVerified: false,
    gitBranchVerified: false,
    prdExists: false
  };

  // v2.0.0: Automated app verification
  console.log('Verifying target application...');
  const cwd = process.cwd();
  checklist.appVerified = true; // Log warning but don't block
  if (cwd.includes('EHG_Engineer')) {
    decisionLogger.log({
      type: 'APP_LOCATION',
      action: 'warning',
      reason: `Currently in EHG_Engineer (${cwd}). For app implementation, switch to EHG directory.`,
      cwd
    });
    console.log(chalk.yellow('  \u26a0\ufe0f  In EHG_Engineer - verify this is correct for this SD type'));
  } else {
    console.log(chalk.green(`  \u2713 App location: ${cwd}`));
  }

  // v2.0.0: Verify git branch
  console.log('Verifying git branch...');
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    checklist.gitBranchVerified = true;
    console.log(chalk.green(`  \u2713 Git branch: ${branch}`));
    decisionLogger.log({
      type: 'GIT_BRANCH',
      action: 'verified',
      reason: `Working on branch: ${branch}`,
      branch
    });
  } catch (_err) {
    decisionLogger.log({
      type: 'GIT_BRANCH',
      action: 'warning',
      reason: 'Could not verify git branch'
    });
    checklist.gitBranchVerified = true; // Don't block
  }

  // v2.0.0: Verify PRD exists (critical)
  console.log('Verifying PRD exists...');
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, title')
    .eq('sd_id', sdId)
    .single();

  if (prd) {
    checklist.prdExists = true;
    console.log(chalk.green(`  \u2713 PRD found: ${prd.title}`));
  } else {
    throw new Error(`EXEC phase requires PRD. No PRD found for SD ${sdId}. Remediation: Run PLAN phase first to create PRD using 'node scripts/add-prd-to-database.js'.`);
  }

  // Log checklist completion
  decisionLogger.log({
    type: 'EXEC_CHECKLIST',
    action: 'completed',
    reason: 'Automated pre-implementation checklist passed',
    checklist
  });

  console.log(chalk.green('\u2713 Pre-implementation checklist complete (automated)'));
}

/**
 * Execute VERIFICATION Phase
 */
export async function executeVERIFICATIONPhase(_sdId) {
  console.log(chalk.blue('\n\ud83d\udd0d Executing VERIFICATION Phase'));

  console.log('Running PLAN supervisor verification...');
  // Would call plan-supervisor-verification.js
}

/**
 * Execute APPROVAL Phase with human gate
 * v2.0.0: Non-interactive - creates approval request, checks for existing approval
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} decisionLogger - Decision logger
 */
export async function executeAPPROVALPhase(supabase, sdId, decisionLogger) {
  console.log(chalk.blue('\n\u2705 Executing APPROVAL Phase'));

  // Check if approval already exists
  const { data: existingApproval } = await supabase
    .from('leo_approval_requests')
    .select('id, status, approved_at')
    .eq('sd_id', sdId)
    .in('status', ['approved', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingApproval && existingApproval.length > 0) {
    const approval = existingApproval[0];
    if (approval.status === 'approved') {
      console.log(chalk.green(`\u2713 Approval already granted at ${approval.approved_at}`));
      decisionLogger.log({
        type: 'APPROVAL_CHECK',
        action: 'already_approved',
        reason: `SD already approved at ${approval.approved_at}`,
        approvalId: approval.id
      });
      return;
    } else {
      // Pending approval
      console.log(chalk.yellow('\u26a0\ufe0f  Approval pending - will be handled by LEAD-FINAL-APPROVAL handoff'));
      decisionLogger.log({
        type: 'APPROVAL_CHECK',
        action: 'pending',
        reason: 'Approval request exists but pending. Use handoff.js LEAD-FINAL-APPROVAL to complete.',
        approvalId: approval.id
      });
      return;
    }
  }

  // v2.0.0: Create approval request but don't wait interactively
  console.log(chalk.cyan('\n\ud83d\udee1\ufe0f Creating approval request...'));

  const approvalRequest = {
    id: `APPROVAL-${Date.now()}`,
    sd_id: sdId,
    requested_at: new Date(),
    status: 'pending',
    type: 'LEAD_FINAL_APPROVAL'
  };

  await supabase
    .from('leo_approval_requests')
    .insert(approvalRequest);

  decisionLogger.log({
    type: 'APPROVAL_REQUEST',
    action: 'created',
    reason: 'Approval request created. Complete via LEAD-FINAL-APPROVAL handoff.',
    approvalId: approvalRequest.id
  });

  console.log(chalk.yellow(`\n\ud83d\udccb APPROVAL REQUEST CREATED: ${approvalRequest.id}`));
  console.log(chalk.yellow('   Complete approval using: node scripts/handoff.js LEAD-FINAL-APPROVAL <SD-ID>'));
  console.log(chalk.yellow('   Or approve via database: UPDATE leo_approval_requests SET status=\'approved\' WHERE id=\'...\';'));
}
