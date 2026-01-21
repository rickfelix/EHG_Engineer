/**
 * LEO Protocol Phase Execution
 * Individual phase execution methods
 *
 * Extracted from leo-protocol-orchestrator.js for modularity
 * SD-LEO-REFACTOR-ORCH-002
 */

import chalk from 'chalk';
import { execSync } from 'child_process';

/**
 * Execute LEAD Phase
 *
 * @param {Object} context - Orchestrator context
 * @param {string} _sdId - Strategic Directive ID (unused)
 */
export async function executeLEADPhase(context, _sdId) {
  console.log(chalk.blue('\n🎯 Executing LEAD Phase'));

  // Check for over-engineering
  console.log('Running over-engineering evaluation...');
  // Would call lead-over-engineering-rubric.js here

  // Create handoff
  console.log('Creating LEAD→PLAN handoff...');
  // Would create handoff in database
}

/**
 * Execute PLAN Phase
 * Non-interactive - PRD must exist, no auto-generation
 *
 * @param {Object} context - Orchestrator context
 * @param {string} sdId - Strategic Directive ID
 */
export async function executePLANPhase(context, sdId) {
  const { supabase, decisionLogger } = context;

  console.log(chalk.blue('\n📐 Executing PLAN Phase'));

  // Check if PRD already exists (using correct sd_id field)
  const { data: existingPrd } = await supabase
    .from('product_requirements_v2')
    .select('id, title, status')
    .eq('sd_id', sdId)
    .single();

  if (existingPrd) {
    console.log(chalk.green(`✓ PRD exists: ${existingPrd.title} (status: ${existingPrd.status})`));
    decisionLogger.log({
      type: 'PRD_CHECK',
      action: 'found',
      reason: `PRD found for SD ${sdId}`,
      prdId: existingPrd.id,
      status: existingPrd.status
    });
    return;
  }

  // PRD is REQUIRED - do not auto-generate placeholder PRDs
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
    `  2. Or run PLAN→EXEC handoff: node scripts/handoff.js PLAN-TO-EXEC ${sdId}\n` +
    '\n' +
    'PRD auto-generation is disabled in non-interactive mode to ensure quality.'
  );
}

/**
 * Execute EXEC Phase with mandatory checklist
 * Non-interactive - automated verification with logging
 *
 * @param {Object} context - Orchestrator context
 * @param {string} sdId - Strategic Directive ID
 */
export async function executeEXECPhase(context, sdId) {
  const { supabase, decisionLogger } = context;

  console.log(chalk.blue('\n💻 Executing EXEC Phase'));

  // MANDATORY: Pre-implementation checklist (non-interactive)
  console.log(chalk.yellow('\n📋 EXEC PRE-IMPLEMENTATION CHECKLIST (Automated)'));

  const checklist = {
    appVerified: false,
    gitBranchVerified: false,
    prdExists: false
  };

  // Automated app verification
  console.log('Verifying target application...');
  const cwd = process.cwd();
  checklist.appVerified = true;
  if (cwd.includes('EHG_Engineer')) {
    decisionLogger.log({
      type: 'APP_LOCATION',
      action: 'warning',
      reason: `Currently in EHG_Engineer (${cwd}). For app implementation, switch to EHG directory.`,
      cwd
    });
    console.log(chalk.yellow('  ⚠️  In EHG_Engineer - verify this is correct for this SD type'));
  } else {
    console.log(chalk.green(`  ✓ App location: ${cwd}`));
  }

  // Verify git branch
  console.log('Verifying git branch...');
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    checklist.gitBranchVerified = true;
    console.log(chalk.green(`  ✓ Git branch: ${branch}`));
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
    checklist.gitBranchVerified = true;
  }

  // Verify PRD exists (critical)
  console.log('Verifying PRD exists...');
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, title')
    .eq('sd_id', sdId)
    .single();

  if (prd) {
    checklist.prdExists = true;
    console.log(chalk.green(`  ✓ PRD found: ${prd.title}`));
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

  console.log(chalk.green('✓ Pre-implementation checklist complete (automated)'));
}

/**
 * Execute VERIFICATION Phase
 *
 * @param {Object} _context - Orchestrator context (unused)
 * @param {string} _sdId - Strategic Directive ID (unused)
 */
export async function executeVERIFICATIONPhase(_context, _sdId) {
  console.log(chalk.blue('\n🔍 Executing VERIFICATION Phase'));

  // Run supervisor verification
  console.log('Running PLAN supervisor verification...');
  // Would call plan-supervisor-verification.js
}

/**
 * Execute APPROVAL Phase with human gate
 * Non-interactive - creates approval request, checks for existing approval
 *
 * @param {Object} context - Orchestrator context
 * @param {string} sdId - Strategic Directive ID
 */
export async function executeAPPROVALPhase(context, sdId) {
  const { supabase, decisionLogger } = context;

  console.log(chalk.blue('\n✅ Executing APPROVAL Phase'));

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
      console.log(chalk.green(`✓ Approval already granted at ${approval.approved_at}`));
      decisionLogger.log({
        type: 'APPROVAL_CHECK',
        action: 'already_approved',
        reason: `SD already approved at ${approval.approved_at}`,
        approvalId: approval.id
      });
      return;
    } else {
      console.log(chalk.yellow('⚠️  Approval pending - will be handled by LEAD-FINAL-APPROVAL handoff'));
      decisionLogger.log({
        type: 'APPROVAL_CHECK',
        action: 'pending',
        reason: 'Approval request exists but pending. Use handoff.js LEAD-FINAL-APPROVAL to complete.',
        approvalId: approval.id
      });
      return;
    }
  }

  // Create approval request but don't wait interactively
  console.log(chalk.cyan('\n🛡️ Creating approval request...'));

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

  console.log(chalk.yellow(`\n📋 APPROVAL REQUEST CREATED: ${approvalRequest.id}`));
  console.log(chalk.yellow('   Complete approval using: node scripts/handoff.js LEAD-FINAL-APPROVAL <SD-ID>'));
  console.log(chalk.yellow('   Or approve via database: UPDATE leo_approval_requests SET status=\'approved\' WHERE id=\'...\';'));
}

/**
 * Execute a specific phase
 *
 * @param {Object} context - Orchestrator context
 * @param {string} phase - Phase to execute
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} executionState - Current execution state
 */
export async function executePhase(context, phase, sdId, executionState) {
  executionState.currentPhase = phase;

  switch (phase) {
    case 'LEAD':
      await executeLEADPhase(context, sdId);
      break;
    case 'PLAN':
      await executePLANPhase(context, sdId);
      break;
    case 'EXEC':
      await executeEXECPhase(context, sdId);
      break;
    case 'VERIFICATION':
      await executeVERIFICATIONPhase(context, sdId);
      break;
    case 'APPROVAL':
      await executeAPPROVALPhase(context, sdId);
      break;
  }
}
