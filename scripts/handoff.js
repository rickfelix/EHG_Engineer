#!/usr/bin/env node
/**
 * LEO Protocol Handoff System - Unified CLI
 *
 * This is the main entry point for all handoff operations.
 * Uses the modular handoff system for improved maintainability.
 *
 * Usage:
 *   node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001
 *   node scripts/handoff.js list [SD-ID]
 *   node scripts/handoff.js stats
 *
 * @see scripts/modules/handoff/ for implementation
 */

import { createHandoffSystem } from './modules/handoff/index.js';
import { createClient } from '@supabase/supabase-js';
import { shouldSkipCodeValidation, getValidationRequirements } from '../lib/utils/sd-type-validation.js';
import { normalizeSDId } from './modules/sd-id-normalizer.js';
import { checkUncommittedChanges, getAffectedRepos } from '../lib/multi-repo/index.js';
import dotenv from 'dotenv';

dotenv.config();

// SD Type-aware workflow definitions
// SD-LEO-PROTOCOL-V435-001: Added all 9 SD types with type-specific requirements
const WORKFLOW_BY_SD_TYPE = {
  feature: {
    name: 'Full LEO Workflow',
    description: 'Complete workflow with all gates and sub-agents',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: [],
    skippedValidation: [],
    note: 'Feature SDs require full E2E testing and all verification gates'
  },
  infrastructure: {
    name: 'Modified LEO Workflow (Infrastructure)',
    description: 'Reduced validation - no E2E tests, skips TESTING/GITHUB sub-agents',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: ['EXEC-TO-PLAN'],
    skippedValidation: ['TESTING', 'GITHUB', 'E2E tests', 'Gates 3 & 4'],
    note: 'Infrastructure SDs can skip EXEC-TO-PLAN if no code validation needed'
  },
  documentation: {
    name: 'Quick LEO Workflow (Documentation)',
    description: 'Minimal workflow for docs-only changes',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: ['EXEC-TO-PLAN'],
    skippedValidation: ['TESTING', 'GITHUB', 'E2E tests', 'Gates 3 & 4', 'Implementation Fidelity'],
    note: 'Documentation SDs have no code to validate'
  },
  database: {
    name: 'Modified LEO Workflow (Database)',
    description: 'Reduced E2E validation, DATABASE sub-agent required',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: [],
    skippedValidation: ['Some E2E tests (UI-dependent)'],
    note: 'Database SDs require DATABASE sub-agent validation'
  },
  security: {
    name: 'Modified LEO Workflow (Security)',
    description: 'Full validation with SECURITY sub-agent required',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: [],
    skippedValidation: [],
    note: 'Security SDs require SECURITY sub-agent validation'
  },
  refactor: {
    name: 'Refactoring LEO Workflow (Intensity-Aware)',
    description: 'Workflow varies by intensity level (cosmetic/structural/architectural)',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
    optional: ['LEAD-FINAL-APPROVAL'],
    skippedValidation: [],
    note: 'Refactor SDs require REGRESSION sub-agent. Intensity level REQUIRED.',
    intensityOverrides: {
      cosmetic: {
        required: ['LEAD-TO-PLAN', 'PLAN-TO-LEAD'],
        skippedValidation: ['E2E tests', 'REGRESSION (optional)', 'Full PRD']
      },
      structural: {
        required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
        skippedValidation: ['Retrospective (optional)']
      },
      architectural: {
        required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
        skippedValidation: []
      }
    }
  },
  // SD-LEO-PROTOCOL-V435-001: New type definitions
  bugfix: {
    name: 'Bugfix LEO Workflow',
    description: 'Streamlined workflow for bug fixes with regression testing',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: [],
    skippedValidation: [],
    note: 'Bugfix SDs require regression testing to verify fix and prevent regressions'
  },
  performance: {
    name: 'Performance LEO Workflow',
    description: 'Full validation with PERFORMANCE sub-agent and benchmarks',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: [],
    skippedValidation: [],
    note: 'Performance SDs require PERFORMANCE sub-agent with baseline/comparison metrics'
  },
  orchestrator: {
    name: 'Orchestrator LEO Workflow',
    description: 'Parent SD workflow - completion driven by child SDs',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: ['PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
    skippedValidation: ['E2E tests', 'Implementation Fidelity', 'Deliverables Gate'],
    note: 'Orchestrator SDs complete when all children complete. No direct implementation.'
  }
};

/**
 * Get SD details and determine workflow
 */
async function getSDWorkflow(sdId) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Support UUID, legacy_id, and sd_key lookups
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, sd_key, title, sd_type, intensity_level, category, current_phase, status')
    .or(`id.eq.${sdId},legacy_id.eq.${sdId},sd_key.eq.${sdId}`)
    .single();

  if (error || !sd) {
    return { error: `SD not found: ${sdId}` };
  }

  // Determine effective SD type
  const skipValidation = shouldSkipCodeValidation(sd);
  const validationReqs = getValidationRequirements(sd);
  const effectiveType = sd.sd_type || (skipValidation ? 'infrastructure' : 'feature');
  let workflow = WORKFLOW_BY_SD_TYPE[effectiveType] || WORKFLOW_BY_SD_TYPE.feature;

  // SD-LEO-PROTOCOL-V435-001 US-005: Activate refactor intensity overrides
  // If refactor type with intensity_level, apply the appropriate overrides
  if (effectiveType === 'refactor' && sd.intensity_level && workflow.intensityOverrides) {
    const intensityLevel = sd.intensity_level.toLowerCase();
    const overrides = workflow.intensityOverrides[intensityLevel];

    if (overrides) {
      // Apply intensity-specific overrides
      workflow = {
        ...workflow,
        required: overrides.required || workflow.required,
        skippedValidation: overrides.skippedValidation || workflow.skippedValidation,
        _intensityApplied: intensityLevel
      };
      console.log(`   ℹ️  Refactor intensity: ${intensityLevel} - workflow adjusted`);
    }
  }

  return {
    sd,
    effectiveType,
    workflow,
    skipValidation,
    validationReason: validationReqs.reason
  };
}

/**
 * Display workflow recommendation
 */
function displayWorkflowRecommendation(workflowInfo, currentHandoff = null) {
  const { sd, effectiveType, workflow, skipValidation, validationReason } = workflowInfo;

  console.log('');
  console.log('📋 SD WORKFLOW RECOMMENDATION');
  console.log('═'.repeat(60));
  console.log(`   SD: ${sd.id}`);
  console.log(`   Title: ${sd.title}`);
  console.log(`   Type: ${effectiveType} | Phase: ${sd.current_phase} | Status: ${sd.status}`);
  console.log('');
  console.log(`   🔄 ${workflow.name}`);
  console.log(`   ${workflow.description}`);
  console.log('');

  // Show required handoffs
  console.log('   REQUIRED HANDOFFS:');
  workflow.required.forEach((h, i) => {
    const isCurrent = currentHandoff && h === currentHandoff.toUpperCase();
    const marker = isCurrent ? '→ ' : '  ';
    console.log(`   ${marker}${i + 1}. ${h}${isCurrent ? ' ← CURRENT' : ''}`);
  });

  // Show optional handoffs
  if (workflow.optional.length > 0) {
    console.log('');
    console.log('   OPTIONAL HANDOFFS (can be skipped):');
    workflow.optional.forEach(h => {
      console.log(`      • ${h}`);
    });
  }

  // Show skipped validation
  if (workflow.skippedValidation.length > 0) {
    console.log('');
    console.log('   SKIPPED VALIDATION:');
    workflow.skippedValidation.forEach(v => {
      console.log(`      ✓ ${v}`);
    });
  }

  // Show note and reason
  if (workflow.note) {
    console.log('');
    console.log(`   💡 ${workflow.note}`);
  }

  if (skipValidation && validationReason) {
    console.log(`   📝 Reason: ${validationReason}`);
  }

  console.log('═'.repeat(60));
  console.log('');
}

/**
 * SYSTEMIC FIX (PAT-WF-NEXT-001): Verify SD completion
 * Checks all required handoffs exist and SD is truly completed
 */
async function verifySDCompletion(sdId) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Get SD details (supports UUID, legacy_id, and sd_key)
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, sd_key, title, status, current_phase, sd_type, intensity_level, category')
    .or(`id.eq.${sdId},legacy_id.eq.${sdId},sd_key.eq.${sdId}`)
    .single();

  if (sdError || !sd) {
    return { error: `SD not found: ${sdId}`, isComplete: false };
  }

  // Get workflow requirements for this SD type
  const workflowInfo = await getSDWorkflow(sd.sd_key || sd.legacy_id || sd.id);
  const requiredHandoffs = workflowInfo.workflow?.required || [];

  // Get existing handoffs for this SD
  const { data: handoffs } = await supabase
    .from('leo_handoff_executions')
    .select('handoff_type, status, created_at')
    .eq('sd_id', sd.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: true });

  const existingHandoffs = (handoffs || []).map(h => h.handoff_type.toUpperCase());

  // Check which required handoffs are missing
  const missingHandoffs = requiredHandoffs.filter(
    h => !existingHandoffs.includes(h.toUpperCase())
  );

  // Check if LEAD-FINAL-APPROVAL exists
  const hasFinalApproval = existingHandoffs.includes('LEAD-FINAL-APPROVAL');

  // Determine completion status
  const isComplete = sd.status === 'completed' && missingHandoffs.length === 0 && hasFinalApproval;

  return {
    sd,
    isComplete,
    status: sd.status,
    requiredHandoffs,
    existingHandoffs,
    missingHandoffs,
    hasFinalApproval,
    workflow: workflowInfo.workflow
  };
}

/**
 * Get SDs stuck in pending_approval status
 */
async function getPendingApprovalSDs() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, title, status, current_phase, sd_type, updated_at')
    .eq('status', 'pending_approval')
    .eq('is_active', true)
    .order('updated_at', { ascending: true });

  if (error) {
    return { error: error.message, sds: [] };
  }

  return { sds: sds || [] };
}

/**
 * Display SDs stuck in pending_approval
 */
function displayPendingSDs(result) {
  console.log('');
  console.log('⏳ SDs AWAITING FINAL APPROVAL');
  console.log('═'.repeat(60));

  if (result.error) {
    console.log(`   ❌ Error: ${result.error}`);
    console.log('═'.repeat(60));
    return;
  }

  if (result.sds.length === 0) {
    console.log('   ✅ No SDs stuck in pending_approval');
    console.log('═'.repeat(60));
    return;
  }

  console.log(`   Found ${result.sds.length} SD(s) awaiting LEAD-FINAL-APPROVAL:`);
  console.log('');

  for (const sd of result.sds) {
    const hoursPending = Math.round((Date.now() - new Date(sd.updated_at).getTime()) / (1000 * 60 * 60));
    console.log(`   📋 ${sd.legacy_id || sd.id}`);
    console.log(`      Title: ${sd.title}`);
    console.log(`      Type: ${sd.sd_type || 'unknown'}`);
    console.log(`      Pending: ${hoursPending} hours`);
    console.log(`      Action: node scripts/handoff.js execute LEAD-FINAL-APPROVAL ${sd.legacy_id || sd.id}`);
    console.log('');
  }

  console.log('─'.repeat(60));
  console.log('   ⚠️  These SDs are NOT complete until LEAD-FINAL-APPROVAL is run');
  console.log('═'.repeat(60));
  console.log('');
}

/**
 * Display completion verification results
 */
function displayCompletionVerification(result) {
  console.log('');
  console.log('🔍 SD COMPLETION VERIFICATION');
  console.log('═'.repeat(60));

  if (result.error) {
    console.log(`   ❌ Error: ${result.error}`);
    console.log('═'.repeat(60));
    return;
  }

  const { sd, isComplete, status, requiredHandoffs, existingHandoffs, missingHandoffs, hasFinalApproval } = result;

  console.log(`   SD: ${sd.legacy_id || sd.id}`);
  console.log(`   Title: ${sd.title}`);
  console.log(`   Status: ${status.toUpperCase()}`);
  console.log('');

  // Status check
  if (status === 'completed') {
    console.log('   ✅ Status Check: COMPLETED');
  } else {
    console.log(`   ❌ Status Check: ${status.toUpperCase()} (not completed)`);
  }

  // Final approval check
  if (hasFinalApproval) {
    console.log('   ✅ Final Approval: LEAD-FINAL-APPROVAL executed');
  } else {
    console.log('   ❌ Final Approval: LEAD-FINAL-APPROVAL NOT found');
  }

  // Handoff check
  console.log('');
  console.log('   REQUIRED HANDOFFS:');
  for (const handoff of requiredHandoffs) {
    const exists = existingHandoffs.includes(handoff.toUpperCase());
    const icon = exists ? '✅' : '❌';
    console.log(`      ${icon} ${handoff}`);
  }

  if (missingHandoffs.length > 0) {
    console.log('');
    console.log('   ⚠️  MISSING HANDOFFS:');
    for (const missing of missingHandoffs) {
      console.log(`      • ${missing}`);
    }
  }

  // Final verdict
  console.log('');
  console.log('─'.repeat(60));
  if (isComplete) {
    console.log('   🎉 VERDICT: SD IS COMPLETE');
    console.log('      You may now claim this SD is done.');
  } else {
    console.log('   ⛔ VERDICT: SD IS NOT COMPLETE');
    console.log('      DO NOT claim this SD is done!');
    if (!hasFinalApproval) {
      console.log('');
      console.log('   ➡️  NEXT ACTION: Run LEAD-FINAL-APPROVAL');
      console.log(`      node scripts/handoff.js execute LEAD-FINAL-APPROVAL ${sd.legacy_id || sd.id}`);
    } else if (missingHandoffs.length > 0) {
      console.log('');
      console.log(`   ➡️  NEXT ACTION: Run ${missingHandoffs[0]}`);
      console.log(`      node scripts/handoff.js execute ${missingHandoffs[0]} ${sd.legacy_id || sd.id}`);
    }
  }
  console.log('═'.repeat(60));
  console.log('');
}

/**
 * Check multi-repo status for SD-related work
 * Phase 2 Enhancement: Prevents shipping with uncommitted changes in related repos
 */
function checkMultiRepoStatus(sdInfo = null) {
  try {
    const status = checkUncommittedChanges(true);

    if (!status || !status.hasChanges) {
      return { passed: true, status: null };
    }

    // If SD info provided, check if changes are in affected repos
    let affectedRepos = ['ehg', 'EHG_Engineer']; // Default: both repos
    if (sdInfo) {
      try {
        affectedRepos = getAffectedRepos({
          title: sdInfo.title || '',
          description: sdInfo.description || '',
          sd_type: sdInfo.sd_type || 'feature'
        });
      } catch {
        // Keep default
      }
    }

    // Filter to only affected repos
    const relevantChanges = status.summary.filter(repo => {
      const repoName = repo.name.toLowerCase();
      return affectedRepos.some(ar => ar.toLowerCase() === repoName);
    });

    const hasRelevantChanges = relevantChanges.some(r =>
      r.uncommittedCount > 0 || r.unpushedCount > 0
    );

    return {
      passed: !hasRelevantChanges,
      status,
      relevantChanges,
      affectedRepos
    };
  } catch {
    // If multi-repo check fails, don't block
    return { passed: true, status: null, error: 'Could not check multi-repo status' };
  }
}

/**
 * Display multi-repo status for handoff context
 */
function displayMultiRepoStatus(multiRepoResult, phaseName = 'Handoff') {
  if (!multiRepoResult.status || multiRepoResult.passed) {
    console.log('   ✅ Multi-Repo Status: All repositories clean');
    return;
  }

  console.log('');
  console.log('⚠️  MULTI-REPO WARNING');
  console.log('─'.repeat(50));
  console.log('   Uncommitted changes found in related repositories:');
  console.log('');

  for (const repo of multiRepoResult.relevantChanges) {
    if (repo.uncommittedCount > 0 || repo.unpushedCount > 0) {
      const icon = repo.uncommittedCount > 0 ? '📝' : '📤';
      console.log(`   ${icon} ${repo.displayName} (${repo.branch})`);
      if (repo.uncommittedCount > 0) {
        console.log(`      ${repo.uncommittedCount} uncommitted change(s)`);
      }
      if (repo.unpushedCount > 0) {
        console.log(`      ${repo.unpushedCount} unpushed commit(s)`);
      }
    }
  }

  console.log('');
  console.log(`   💡 Consider shipping changes in all repos before ${phaseName}`);
  console.log('   Run: node scripts/multi-repo-status.js for details');
  console.log('─'.repeat(50));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const system = createHandoffSystem();

  switch (command) {
    case 'workflow': {
      // New command: Show workflow recommendation for an SD
      const sdId = args[1];

      if (!sdId) {
        console.log('Usage: node scripts/handoff.js workflow SD-ID');
        console.log('');
        console.log('Shows the recommended workflow for an SD based on its type.');
        console.log('');
        console.log('Examples:');
        console.log('  node scripts/handoff.js workflow SD-LEO-GEMINI-001');
        process.exit(1);
      }

      const workflowInfo = await getSDWorkflow(sdId);
      if (workflowInfo.error) {
        console.error(`❌ ${workflowInfo.error}`);
        process.exit(1);
      }

      displayWorkflowRecommendation(workflowInfo);
      break;
    }

    case 'verify': {
      // SYSTEMIC FIX (PAT-WF-NEXT-001): Verify SD completion before claiming done
      const sdId = args[1];

      if (!sdId) {
        console.log('Usage: node scripts/handoff.js verify SD-ID');
        console.log('');
        console.log('Verifies that an SD is truly complete by checking:');
        console.log('  1. SD status is "completed"');
        console.log('  2. All required handoffs exist');
        console.log('  3. LEAD-FINAL-APPROVAL was executed');
        console.log('');
        console.log('Use this BEFORE claiming an SD is done!');
        process.exit(1);
      }

      const verifyResult = await verifySDCompletion(sdId);
      displayCompletionVerification(verifyResult);
      process.exit(verifyResult.isComplete ? 0 : 1);
    }

    case 'pending': {
      // SYSTEMIC FIX (PAT-WF-NEXT-001): Show SDs stuck in pending_approval
      const pendingSDs = await getPendingApprovalSDs();
      displayPendingSDs(pendingSDs);
      break;
    }

    case 'precheck': {
      // SD-LEO-STREAMS-001 Retrospective: Batch prerequisite validation
      // Finds ALL issues at once, reducing handoff iterations 60-70%
      const precheckType = args[1];
      const precheckSdId = args[2];

      if (!precheckType || !precheckSdId) {
        console.log('Usage: node scripts/handoff.js precheck HANDOFF_TYPE SD-ID');
        console.log('');
        console.log('Runs ALL gate validations to find ALL issues at once.');
        console.log('Use this BEFORE "execute" to fix everything in one iteration.');
        console.log('');
        console.log('Includes:');
        console.log('  - Git state check (uncommitted/unpushed)');
        console.log('  - All handoff gates (batch mode)');
        console.log('  - Remediation suggestions');
        console.log('');
        console.log('Examples:');
        console.log('  node scripts/handoff.js precheck PLAN-TO-EXEC SD-EXAMPLE-001');
        console.log('  node scripts/handoff.js precheck exec-to-plan SD-EXAMPLE-001');
        process.exit(1);
      }

      // Step 0: Multi-repo status check (Phase 2 Enhancement)
      console.log('');
      console.log('STEP 0: MULTI-REPO STATUS CHECK');
      console.log('─'.repeat(50));
      const workflowInfoForPrecheck = await getSDWorkflow(precheckSdId);
      const multiRepoResult = checkMultiRepoStatus(workflowInfoForPrecheck.sd);
      displayMultiRepoStatus(multiRepoResult, 'phase transition');

      // Step 1: Quick git state check first
      console.log('');
      console.log('STEP 1: GIT STATE CHECK');
      console.log('─'.repeat(50));
      try {
        const { checkGitState } = await import('./check-git-state.js');
        const gitResult = await checkGitState();
        if (!gitResult.passed) {
          console.log('');
          console.log('⛔ Git issues found - resolve before proceeding');
          console.log('   Run: node scripts/check-git-state.js for details');
          console.log('');
          // Continue to show all other issues too
        }
      } catch (e) {
        console.log(`   ⚠️  Could not run git check: ${e.message}`);
      }

      // Step 2: Run all handoff gates
      console.log('');
      console.log('STEP 2: HANDOFF GATE VALIDATION');
      console.log('─'.repeat(50));
      const precheckResult = await system.precheckHandoff(precheckType, precheckSdId);

      console.log('');
      if (precheckResult.success) {
        console.log('✅ PRECHECK PASSED - All gates would pass');
        console.log('='.repeat(50));
        console.log('   You can now safely run:');
        console.log(`   node scripts/handoff.js execute ${precheckType.toUpperCase()} ${precheckSdId}`);
      } else {
        console.log('❌ PRECHECK FAILED - Issues must be resolved first');
        console.log('='.repeat(50));
        console.log(`   Found ${precheckResult.issues.length} issue(s) across ${precheckResult.failedGates.length} gate(s)`);
        console.log('');
        console.log('   ALL ISSUES:');
        precheckResult.issues.forEach((issue, idx) => {
          console.log(`   ${idx + 1}. [${issue.gate}] ${issue.issue}`);
        });
        console.log('');
        console.log('   Fix all issues above, then run precheck again.');
      }
      console.log('');
      process.exit(precheckResult.success ? 0 : 1);
    }

    case 'execute': {
      const handoffType = args[1];
      const sdId = args[2];

      // SD-LEARN-010:US-005: Parse bypass flags
      // Scan all args for --bypass-validation and --bypass-reason
      const bypassValidationIdx = args.findIndex(a => a === '--bypass-validation');
      const bypassReasonIdx = args.findIndex(a => a === '--bypass-reason');
      const bypassValidation = bypassValidationIdx !== -1;
      let bypassReason = null;

      if (bypassReasonIdx !== -1 && args[bypassReasonIdx + 1]) {
        bypassReason = args[bypassReasonIdx + 1];
      }

      // Find prdId (third non-flag argument)
      const nonFlagArgs = args.filter((a, i) =>
        !a.startsWith('--') &&
        (i <= 2 || (i === bypassReasonIdx + 1 ? false : true))
      );
      const prdId = nonFlagArgs[3];

      if (!handoffType || !sdId) {
        console.log('Usage: node scripts/handoff.js execute HANDOFF_TYPE SD-ID [PRD-ID] [--bypass-validation --bypass-reason "reason"]');
        console.log('');
        console.log('Handoff Types (case-insensitive):');
        console.log('  LEAD-TO-PLAN        - Strategic to Planning handoff');
        console.log('  PLAN-TO-EXEC        - Planning to Execution handoff');
        console.log('  EXEC-TO-PLAN        - Execution to Verification handoff');
        console.log('  PLAN-TO-LEAD        - Verification to Final Approval handoff');
        console.log('  LEAD-FINAL-APPROVAL - Mark SD as completed (final step)');
        console.log('');
        console.log('Emergency Bypass (SD-LEARN-010:US-005):');
        console.log('  --bypass-validation       Skip validation gates (requires --bypass-reason)');
        console.log('  --bypass-reason "..."     Justification (min 20 chars, required with bypass)');
        console.log('  Rate limits: max 3 bypasses per SD, max 10 per day globally');
        console.log('');
        console.log('TIP: Run "node scripts/handoff.js workflow SD-ID" to see recommended workflow');
        console.log('');
        console.log('Examples:');
        console.log('  node scripts/handoff.js execute PLAN-TO-EXEC SD-EXAMPLE-001');
        console.log('  node scripts/handoff.js execute plan-to-exec SD-EXAMPLE-001');
        console.log('  node scripts/handoff.js execute EXEC-TO-PLAN SD-001 --bypass-validation --bypass-reason "Emergency production fix"');
        process.exit(1);
      }

      // Validate bypass flags (SD-LEARN-010:US-005)
      if (bypassValidation && !bypassReason) {
        console.error('');
        console.error('❌ BYPASS ERROR: --bypass-validation requires --bypass-reason');
        console.error('');
        console.error('Usage: --bypass-validation --bypass-reason "Your justification (min 20 chars)"');
        console.error('');
        process.exit(1);
      }

      if (bypassReason && bypassReason.length < 20) {
        console.error('');
        console.error('❌ BYPASS ERROR: --bypass-reason must be at least 20 characters');
        console.error(`   Provided: ${bypassReason.length} characters`);
        console.error('');
        console.error('Provide a meaningful justification for the bypass.');
        console.error('');
        process.exit(1);
      }

      // SD-LEARN-010:US-005: Rate limiting and audit logging for bypass
      if (bypassValidation) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );

        // Normalize SD ID to UUID for consistent logging
        const canonicalSdId = await normalizeSDId(supabase, sdId);

        // Check rate limits
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check bypasses for this SD (max 3)
        const { data: sdBypasses, error: sdError } = await supabase
          .from('audit_log')
          .select('id')
          .eq('action_type', 'VALIDATION_BYPASS')
          .eq('target_id', canonicalSdId || sdId)
          .gte('timestamp', today.toISOString());

        if (!sdError && sdBypasses && sdBypasses.length >= 3) {
          console.error('');
          console.error('❌ BYPASS RATE LIMIT: Max 3 bypasses per SD reached');
          console.error(`   SD: ${sdId} has ${sdBypasses.length} bypasses today`);
          console.error('');
          console.error('   Request LEAD approval for additional bypasses.');
          console.error('');
          process.exit(1);
        }

        // Check global bypasses today (max 10)
        const { data: globalBypasses, error: globalError } = await supabase
          .from('audit_log')
          .select('id')
          .eq('action_type', 'VALIDATION_BYPASS')
          .gte('timestamp', today.toISOString());

        if (!globalError && globalBypasses && globalBypasses.length >= 10) {
          console.error('');
          console.error('❌ BYPASS RATE LIMIT: Max 10 global bypasses per day reached');
          console.error(`   ${globalBypasses.length} bypasses have been used today`);
          console.error('');
          console.error('   Request LEAD approval for additional bypasses.');
          console.error('');
          process.exit(1);
        }

        // Log bypass to audit_log
        const { error: logError } = await supabase
          .from('audit_log')
          .insert({
            action_type: 'VALIDATION_BYPASS',
            target_type: 'handoff',
            target_id: canonicalSdId || sdId,
            severity: 'warning',
            description: `Bypass validation for ${handoffType} handoff`,
            metadata: {
              handoff_type: handoffType,
              sd_id: sdId,
              canonical_sd_id: canonicalSdId,
              bypass_reason: bypassReason,
              sd_bypasses_today: (sdBypasses?.length || 0) + 1,
              global_bypasses_today: (globalBypasses?.length || 0) + 1
            },
            timestamp: new Date().toISOString()
          });

        if (logError) {
          console.warn(`   ⚠️  Could not log bypass to audit_log: ${logError.message}`);
        } else {
          console.log('');
          console.log('⚠️  BYPASS MODE ENABLED (SD-LEARN-010:US-005)');
          console.log('─'.repeat(50));
          console.log(`   Reason: ${bypassReason}`);
          console.log(`   SD Bypasses Today: ${(sdBypasses?.length || 0) + 1}/3`);
          console.log(`   Global Bypasses Today: ${(globalBypasses?.length || 0) + 1}/10`);
          console.log('   ⚠️  Bypass logged to audit_log for review');
          console.log('─'.repeat(50));
        }
      }

      // Show workflow recommendation before executing
      const workflowInfo = await getSDWorkflow(sdId);
      if (!workflowInfo.error) {
        displayWorkflowRecommendation(workflowInfo, handoffType);

        // Warn if executing optional handoff
        const normalizedType = handoffType.toUpperCase();
        if (workflowInfo.workflow.optional.includes(normalizedType)) {
          console.log('⚠️  NOTE: This handoff is OPTIONAL for this SD type.');
          console.log('   You may skip it and proceed directly to the next required handoff.');
          console.log('');
        }

        // Phase 2 Enhancement: Check multi-repo status before execution
        const multiRepoCheck = checkMultiRepoStatus(workflowInfo.sd);
        if (!multiRepoCheck.passed) {
          displayMultiRepoStatus(multiRepoCheck, handoffType);
        }
      }

      // SD-LEARN-010:US-005: Pass bypass flag to handoff system
      const result = await system.executeHandoff(handoffType, sdId, {
        prdId,
        bypassValidation,
        bypassReason
      });

      if (result.success) {
        console.log('');
        console.log('✅ HANDOFF SUCCESSFUL');
        console.log('='.repeat(50));
        console.log(`   Type: ${handoffType.toUpperCase()}`);
        console.log(`   SD: ${sdId}`);
        // Use normalized score (weighted average 0-100%) instead of summed score
        const displayScore = result.normalizedScore ?? result.qualityScore ?? Math.round((result.totalScore / result.maxScore) * 100) ?? 'N/A';
        console.log(`   Score: ${displayScore}%`);
        // Show gate breakdown if available
        if (result.gateResults && Object.keys(result.gateResults).length > 0) {
          console.log(`   Gates: ${Object.keys(result.gateResults).length} evaluated`);
          for (const [gateName, gateResult] of Object.entries(result.gateResults)) {
            const gatePercent = gateResult.maxScore > 0 ? Math.round((gateResult.score / gateResult.maxScore) * 100) : 0;
            const status = gateResult.passed ? '✓' : '✗';
            console.log(`      ${status} ${gateName}: ${gatePercent}%`);
          }
        }
        if (result.warnings?.length > 0) {
          console.log(`   Warnings: ${result.warnings.length}`);
        }

        // SYSTEMIC FIX: Show next step in workflow to prevent premature completion claims
        // PAT-WORKFLOW-NEXT-001: Always show what comes next after a handoff
        const nextStepMap = {
          'LEAD-TO-PLAN': { next: 'PLAN-TO-EXEC', status: 'planning', message: 'Create PRD, then run PLAN-TO-EXEC' },
          'PLAN-TO-EXEC': { next: 'EXEC-TO-PLAN', status: 'in_progress', message: 'Implement features, then run EXEC-TO-PLAN' },
          'EXEC-TO-PLAN': { next: 'PLAN-TO-LEAD', status: 'review', message: 'Verify implementation, then run PLAN-TO-LEAD' },
          'PLAN-TO-LEAD': { next: 'LEAD-FINAL-APPROVAL', status: 'pending_approval', message: '⚠️  SD is NOT complete! Run LEAD-FINAL-APPROVAL to finish' },
          'LEAD-FINAL-APPROVAL': { next: null, status: 'completed', message: '🎉 SD is now COMPLETE!' }
        };

        const nextStep = nextStepMap[handoffType.toUpperCase()];
        if (nextStep) {
          // LEO Protocol v4.3.3: Actually update SD status in database (PAT-HANDOFF-STATUS-001)
          // SD-LEO-ID-NORMALIZE-001: Use normalizer to prevent silent update failures
          const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

          // Normalize SD ID to canonical form before update
          const canonicalId = await normalizeSDId(supabase, sdId);

          if (canonicalId) {
            const { data: updateData, error: updateError } = await supabase
              .from('strategic_directives_v2')
              .update({ status: nextStep.status, updated_at: new Date().toISOString() })
              .eq('id', canonicalId)
              .select('id')
              .single();

            if (updateError) {
              console.warn(`   ⚠️  Failed to update SD status: ${updateError.message}`);
            } else if (!updateData) {
              // SD-LEO-ID-NORMALIZE-001: Detect silent failures
              console.warn('   ⚠️  SD status update returned no data - possible silent failure');
              console.warn(`      Input ID: "${sdId}", Canonical ID: "${canonicalId}"`);
            } else {
              // Log successful normalization if ID was transformed
              if (sdId !== canonicalId) {
                console.log(`   ℹ️  ID normalized: "${sdId}" -> "${canonicalId}"`);
              }
            }
          } else {
            console.warn(`   ⚠️  Could not normalize SD ID: ${sdId}`);
          }

          console.log('');
          console.log('─'.repeat(50));
          console.log(`   📍 SD Status: ${nextStep.status.toUpperCase()}`);
          if (nextStep.next) {
            console.log(`   ➡️  NEXT STEP: ${nextStep.next}`);
            console.log(`      ${nextStep.message}`);
            console.log('');
            console.log('   ⚠️  DO NOT claim completion until LEAD-FINAL-APPROVAL is done');
          } else {
            console.log(`   ${nextStep.message}`);
          }
        }
      } else {
        console.log('');
        console.log('❌ HANDOFF FAILED');
        console.log('='.repeat(50));
        console.log(`   Reason: ${result.reasonCode || 'VALIDATION_FAILED'}`);
        console.log(`   Message: ${result.message || 'See details above'}`);
        if (result.remediation) {
          console.log('');
          console.log('   REMEDIATION:');
          result.remediation.split('\n').forEach(line => {
            console.log(`   ${line}`);
          });
        }
      }

      process.exit(result.success ? 0 : 1);
    }

    case 'list': {
      const sdFilter = args[1];
      const executions = await system.listHandoffExecutions({
        sdId: sdFilter,
        limit: 20
      });

      console.log('');
      console.log('📋 Recent Handoff Executions');
      console.log('='.repeat(80));

      if (executions.length === 0) {
        console.log('   No handoff executions found');
      } else {
        console.log('   Type            | SD ID                  | Status   | Score | Date');
        console.log('   ' + '-'.repeat(75));
        executions.forEach(exec => {
          const type = (exec.handoff_type || 'UNKNOWN').padEnd(15);
          const sdId = (exec.sd_id || 'N/A').padEnd(22);
          const status = (exec.status || 'N/A').padEnd(8);
          const score = ((exec.validation_score || 0) + '%').padEnd(5);
          const date = exec.initiated_at ? new Date(exec.initiated_at).toLocaleDateString() : 'N/A';
          console.log(`   ${type} | ${sdId} | ${status} | ${score} | ${date}`);
        });
      }

      console.log('');
      break;
    }

    case 'stats': {
      const stats = await system.getHandoffStats();

      console.log('');
      console.log('📊 Handoff System Statistics');
      console.log('='.repeat(50));

      if (!stats || stats.total === 0) {
        console.log('   No handoff data available');
      } else {
        console.log(`   Total Executions: ${stats.total}`);
        console.log(`   Successful: ${stats.successful} (${Math.round((stats.successful / stats.total) * 100)}%)`);
        console.log(`   Failed: ${stats.failed} (${Math.round((stats.failed / stats.total) * 100)}%)`);
        console.log(`   Average Score: ${Math.round(stats.averageScore)}%`);
        console.log('');
        console.log('   By Type:');
        Object.entries(stats.byType).forEach(([type, typeStats]) => {
          const rate = typeStats.total > 0 ? Math.round((typeStats.successful / typeStats.total) * 100) : 0;
          console.log(`     ${type}: ${typeStats.successful}/${typeStats.total} (${rate}%, avg ${Math.round(typeStats.averageScore || 0)}%)`);
        });
      }

      console.log('');
      break;
    }

    case 'help':
    default:
      console.log('');
      console.log('LEO Protocol Handoff System');
      console.log('='.repeat(50));
      console.log('');
      console.log('COMMANDS:');
      console.log('  workflow SD-ID         - Show recommended workflow for SD type');
      console.log('  verify SD-ID           - Verify SD is truly complete (PAT-WF-NEXT-001)');
      console.log('  pending                - Show SDs stuck in pending_approval');
      console.log('  precheck TYPE SD-ID    - Find ALL issues before execute (batch validation)');
      console.log('  execute TYPE SD-ID     - Execute handoff');
      console.log('  list [SD-ID]           - List handoff executions');
      console.log('  stats                  - Show system statistics');
      console.log('  help                   - Show this help');
      console.log('');
      console.log('HANDOFF TYPES:');
      console.log('  LEAD-TO-PLAN        Strategic approval → PRD creation');
      console.log('  PLAN-TO-EXEC        PRD complete → Implementation start');
      console.log('  EXEC-TO-PLAN        Implementation done → Verification');
      console.log('  PLAN-TO-LEAD        Verified → Final approval');
      console.log('  LEAD-FINAL-APPROVAL Mark SD as completed (post PLAN-TO-LEAD)');
      console.log('');
      console.log('GATES ENFORCED:');
      console.log('  • BMAD validation (risk assessment, test plans)');
      console.log('  • Sub-agent orchestration');
      console.log('  • Git branch/commit enforcement');
      console.log('  • Retrospective quality gate');
      console.log('  • Implementation fidelity (Gate 2)');
      console.log('  • Traceability validation (Gate 3)');
      console.log('  • Workflow ROI (Gate 4)');
      console.log('');
      console.log('SD TYPE WORKFLOWS:');
      console.log('  feature         Full workflow (all gates + E2E tests)');
      console.log('  infrastructure  Modified (EXEC-TO-PLAN optional, no E2E)');
      console.log('  documentation   Quick (EXEC-TO-PLAN optional, no code validation)');
      console.log('  database        Modified (DATABASE sub-agent required)');
      console.log('  security        Full (SECURITY sub-agent required)');
      console.log('');
      console.log('EXAMPLES:');
      console.log('  node scripts/handoff.js workflow SD-LEO-GEMINI-001');
      console.log('  node scripts/handoff.js execute PLAN-TO-EXEC SD-FEATURE-001');
      console.log('  node scripts/handoff.js execute exec-to-plan SD-FEATURE-001');
      console.log('  node scripts/handoff.js list SD-FEATURE-001');
      console.log('  node scripts/handoff.js stats');
      console.log('');
  }
}

// Execute
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
