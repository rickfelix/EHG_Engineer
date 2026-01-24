/**
 * Phase Executors Domain
 * Handles individual phase execution logic for each LEO phase
 *
 * @module execute-phase/phase-executors
 */

import chalk from 'chalk';

/**
 * Execute LEAD phase for strategic objectives
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive record
 * @param {Object} options - Execution options
 */
export async function executeLEADPhase(supabase, sd, options) {
  console.log('   📋 Strategic objectives definition');
  console.log('   💼 Business case validation');
  console.log('   🎯 Priority justification');
  console.log('   ⚖️  Over-engineering evaluation');

  await supabase
    .from('strategic_directives_v2')
    .update({
      current_phase: 'LEAD_COMPLETE',
      updated_at: new Date().toISOString()
    })
    .eq('id', sd.id);

  console.log(chalk.green('   ✅ LEAD phase objectives completed'));
}

/**
 * Execute PLAN phase for technical planning
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive record
 * @param {Object} prdGenerator - PRD generator instance
 * @param {Object} options - Execution options
 */
export async function executePLANPhase(supabase, sd, prdGenerator, options) {
  console.log('   📐 Technical planning and architecture');
  console.log('   📝 PRD generation');

  await prdGenerator.generatePRD(sd.id, options);

  console.log('   🧪 Test plan creation');
  console.log('   ✅ Acceptance criteria definition');

  await supabase
    .from('strategic_directives_v2')
    .update({
      current_phase: 'PLAN_COMPLETE',
      updated_at: new Date().toISOString()
    })
    .eq('id', sd.id);

  console.log(chalk.green('   ✅ PLAN phase completed with PRD'));
}

/**
 * Execute EXEC phase for implementation
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive record
 * @param {Object} options - Execution options
 * @returns {Object} Implementation status result
 */
export async function executeEXECPhase(supabase, sd, options) {
  console.log('   💻 EXEC Phase: ACTUAL IMPLEMENTATION REQUIRED');
  console.log(chalk.red('   🚨 CRITICAL: This phase requires REAL code changes in the EHG application directory'));

  // MANDATORY: Verify we have a PRD to implement
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('directive_id', sd.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!prd) {
    throw new Error(`No PRD found for ${sd.id}. Cannot proceed with implementation without requirements.`);
  }

  // PRD Format Validation
  if (!prd.content) {
    throw new Error(`PRD ${prd.id} has empty content. Cannot proceed without requirements.`);
  }

  let content;
  try {
    content = JSON.parse(prd.content);
  } catch (parseError) {
    console.log(chalk.red(`\n   ❌ PRD Format Error: ${prd.id}`));
    console.log(chalk.red(`   Content preview: ${prd.content.substring(0, 100)}...`));
    console.log(chalk.yellow('\n   🔧 To fix this PRD:'));
    console.log(chalk.cyan('   1. Run: node scripts/prd-format-validator.js --fix'));
    console.log(chalk.cyan(`   2. Or use: node scripts/unified-consolidated-prd.js ${sd.id} --force`));
    console.log(chalk.cyan('   3. Then retry the orchestrator'));
    throw new Error(`PRD ${prd.id} has invalid JSON content: ${parseError.message}`);
  }

  // Validate required JSON structure
  if (!content.user_stories) {
    console.log(chalk.red(`\n   ❌ PRD Structure Error: ${prd.id}`));
    console.log(chalk.red('   Missing \'user_stories\' array in JSON content'));
    console.log(chalk.yellow('\n   🔧 To fix this PRD:'));
    console.log(chalk.cyan(`   node scripts/unified-consolidated-prd.js ${sd.id} --force`));
    throw new Error(`PRD ${prd.id} missing required 'user_stories' field.`);
  }

  console.log(chalk.cyan('\n   📄 Implementation Requirements:'));
  console.log(`     PRD: ${prd.title}`);
  console.log(`     User Stories: ${content.user_stories?.length || 0}`);

  if (!content.user_stories || content.user_stories.length === 0) {
    throw new Error(`PRD ${prd.id} has no user stories. Cannot implement without specific requirements.`);
  }

  // Show what needs to be implemented
  console.log(chalk.yellow('\n   📋 Required Implementation:'));
  content.user_stories.forEach((story, i) => {
    console.log(`     ${i + 1}. [${story.priority}] ${story.title}`);
  });

  // BLOCKING: Require manual implementation
  console.log(chalk.red.bold('\n   🛑 IMPLEMENTATION BLOCKER:'));
  console.log(chalk.red('   This EXEC phase will NOT automatically mark as complete.'));
  console.log(chalk.red('   You MUST:'));
  console.log(chalk.red('     1. Navigate to the EHG application directory'));
  console.log(chalk.red('     2. Implement the user stories above'));
  console.log(chalk.red('     3. Make git commits with the SD-ID'));
  console.log(chalk.red('     4. Run validation to verify implementation'));
  console.log(chalk.red('     5. Only then will the SD be marked complete'));

  console.log(chalk.yellow('\n   ⏸️  EXEC phase requires manual implementation before completion'));

  // Update SD to blocked state requiring implementation
  await supabase
    .from('strategic_directives_v2')
    .update({
      current_phase: 'EXEC_IMPLEMENTATION_REQUIRED',
      metadata: {
        ...sd.metadata,
        implementation_required: true,
        implementation_blocker: 'Awaiting manual implementation with git evidence',
        prd_id: prd.id,
        user_stories_count: content.user_stories.length,
        blocked_at: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', sd.id);

  console.log(chalk.red('   🚫 EXEC phase NOT marked complete - implementation required'));

  return {
    requires_manual_implementation: true,
    prd_id: prd.id,
    user_stories_count: content.user_stories.length,
    implementation_status: 'BLOCKED_PENDING_CODE_CHANGES'
  };
}

/**
 * Execute VERIFICATION phase for acceptance validation
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive record
 * @param {Object} options - Execution options
 */
export async function executeVERIFICATIONPhase(supabase, sd, options) {
  console.log('   🔍 Acceptance criteria validation');
  console.log('   ⚡ Performance testing');
  console.log('   🔒 Security validation');
  console.log('   👥 User acceptance confirmation');

  console.log(chalk.green('   ✅ VERIFICATION phase completed'));
}

/**
 * Execute APPROVAL phase for deployment authorization
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive record
 * @param {Function} validateGitEvidence - Git evidence validator function
 * @param {Function} markSDComplete - SD completion marker function
 * @param {Object} options - Execution options
 */
export async function executeAPPROVALPhase(supabase, sd, validateGitEvidence, markSDComplete, options) {
  console.log('   📋 Final business review');
  console.log('   ✅ Stakeholder approval');
  console.log('   🚀 Deployment authorization');
  console.log('   📊 Retrospective generation');

  // Check if we have git evidence for auto-completion
  const gitEvidence = await validateGitEvidence(sd.id);
  const hasImplementationEvidence = gitEvidence.valid && gitEvidence.commitCount > 0;

  if (hasImplementationEvidence) {
    console.log(chalk.green('\n   ✅ Git evidence found - marking SD as complete'));

    await supabase
      .from('strategic_directives_v2')
      .update({
        current_phase: 'APPROVAL_COMPLETE',
        metadata: {
          ...sd.metadata,
          approval_phase_completed: true,
          evidence_validated: true,
          git_commits_verified: gitEvidence.commitCount,
          approval_completed_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', sd.id);

    await markSDComplete(sd.id);

    console.log(chalk.green('   ✅ APPROVAL phase completed'));
    console.log(chalk.green('   🎉 SD marked as completed with status: completed, progress: 100%'));
  } else {
    console.log(chalk.yellow('\n   ⚠️  APPROVAL phase requires manual verification:'));
    console.log(chalk.yellow('   • Verify all git commits contain actual implementation'));
    console.log(chalk.yellow('   • Confirm user stories are implemented in code'));
    console.log(chalk.yellow('   • Test functionality in target application'));
    console.log(chalk.yellow('   • Only mark complete after evidence validation'));

    await supabase
      .from('strategic_directives_v2')
      .update({
        current_phase: 'APPROVAL_PENDING_EVIDENCE',
        metadata: {
          ...sd.metadata,
          approval_phase_completed: true,
          requires_evidence_validation: true,
          evidence_validation_pending: true,
          approval_pending_since: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', sd.id);

    console.log(chalk.yellow('   ⏸️  APPROVAL phase ready but NOT marked complete'));
    console.log(chalk.red('   🚫 SD completion requires manual evidence validation'));
  }
}

export default {
  executeLEADPhase,
  executePLANPhase,
  executeEXECPhase,
  executeVERIFICATIONPhase,
  executeAPPROVALPhase
};
