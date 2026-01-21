/**
 * LEO Protocol Compliance
 * Compliance reporting, phase completion, and retrospectives
 *
 * Extracted from leo-protocol-orchestrator.js for modularity
 * SD-LEO-REFACTOR-ORCH-002
 */

import chalk from 'chalk';

/**
 * Check if phase is already complete
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {string} phase - Phase to check
 * @returns {Promise<boolean>}
 */
export async function checkPhaseCompletion(supabase, sdId, phase) {
  const { data } = await supabase
    .from('leo_phase_completions')
    .select('completed_at')
    .eq('sd_id', sdId)
    .eq('phase', phase)
    .single();

  return !!data?.completed_at;
}

/**
 * Record phase completion
 *
 * @param {Object} supabase - Supabase client
 * @param {string} phase - Completed phase
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} executionState - Current execution state
 */
export async function recordPhaseCompletion(supabase, phase, sdId, executionState) {
  executionState.completedPhases.push(phase);

  await supabase
    .from('leo_phase_completions')
    .upsert({
      sd_id: sdId,
      phase,
      completed_at: new Date(),
      session_id: executionState.sessionId
    });
}

/**
 * Generate compliance report
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} executionState - Current execution state
 */
export async function generateComplianceReport(supabase, sdId, executionState) {
  console.log(chalk.cyan('\n📊 COMPLIANCE REPORT'));
  console.log(chalk.gray('─'.repeat(40)));

  const report = {
    sd_id: sdId,
    session_id: executionState.sessionId,
    phases_completed: executionState.completedPhases.length,
    violations: executionState.violations.length,
    skipped_steps: executionState.skippedSteps.length,
    duration: new Date() - executionState.startTime,
    compliance_score: executionState.violations.length === 0 ? 100 : 0
  };

  console.log(`SD: ${report.sd_id}`);
  console.log(`Phases Completed: ${report.phases_completed}/5`);
  console.log(`Violations: ${report.violations}`);
  console.log(`Compliance Score: ${report.compliance_score}%`);
  console.log(`Duration: ${Math.round(report.duration / 1000)}s`);

  // Store report
  await supabase
    .from('leo_compliance_reports')
    .insert(report);
}

/**
 * Handle execution failure
 *
 * @param {Object} supabase - Supabase client
 * @param {Error} error - Error that occurred
 * @param {Object} executionState - Current execution state
 */
export async function handleExecutionFailure(supabase, error, executionState) {
  // Update session status
  await supabase
    .from('leo_execution_sessions')
    .update({
      status: 'failed',
      failed_at: new Date(),
      error_message: error.message,
      failed_phase: executionState.currentPhase
    })
    .eq('id', executionState.sessionId);

  // Log violation
  await supabase
    .from('leo_violations')
    .insert({
      session_id: executionState.sessionId,
      sd_id: executionState.sdId,
      phase: executionState.currentPhase,
      violation_type: 'execution_failure',
      details: error.message,
      timestamp: new Date()
    });
}

/**
 * Enforce retrospective
 * Non-interactive - checks for existing retrospective or creates placeholder
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} decisionLogger - Decision logger instance
 */
export async function enforceRetrospective(supabase, sdId, decisionLogger) {
  console.log(chalk.cyan('\n📝 RETROSPECTIVE CHECK'));

  // Check if retrospective already exists
  const { data: existingRetro } = await supabase
    .from('retrospectives')
    .select('id, created_at')
    .eq('sd_id', sdId)
    .limit(1);

  if (existingRetro && existingRetro.length > 0) {
    console.log(chalk.green(`✓ Retrospective already exists (created: ${existingRetro[0].created_at})`));
    decisionLogger.log({
      type: 'RETROSPECTIVE_CHECK',
      action: 'already_exists',
      reason: `Retrospective found for SD ${sdId}`,
      retroId: existingRetro[0].id
    });
    return;
  }

  // In non-interactive mode, create a placeholder retrospective
  // or require it to be created via the proper retrospective flow
  console.log(chalk.yellow('⚠️  No retrospective found'));
  console.log(chalk.yellow('   Create retrospective using: node scripts/create-retrospective.js <SD-ID>'));

  decisionLogger.log({
    type: 'RETROSPECTIVE_REQUIRED',
    action: 'not_created',
    reason: 'Retrospective should be created via create-retrospective.js for proper quality validation',
    sdId
  });

  // Don't block orchestrator completion - retrospective can be added after
  console.log(chalk.gray('   (Retrospective creation is recommended but not blocking in non-interactive mode)'));
}
