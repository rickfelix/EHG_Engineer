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
import dotenv from 'dotenv';

dotenv.config();

// SD Type-aware workflow definitions
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

  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type, category, current_phase, status')
    .eq('id', sdId)
    .single();

  if (error || !sd) {
    return { error: `SD not found: ${sdId}` };
  }

  // Determine effective SD type
  const skipValidation = shouldSkipCodeValidation(sd);
  const validationReqs = getValidationRequirements(sd);
  const effectiveType = sd.sd_type || (skipValidation ? 'infrastructure' : 'feature');
  const workflow = WORKFLOW_BY_SD_TYPE[effectiveType] || WORKFLOW_BY_SD_TYPE.feature;

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

  // Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, title, status, current_phase, sd_type, category')
    .or(`id.eq.${sdId},legacy_id.eq.${sdId}`)
    .single();

  if (sdError || !sd) {
    return { error: `SD not found: ${sdId}`, isComplete: false };
  }

  // Get workflow requirements for this SD type
  const workflowInfo = await getSDWorkflow(sd.legacy_id || sd.id);
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

    case 'execute': {
      const handoffType = args[1];
      const sdId = args[2];
      const prdId = args[3];

      if (!handoffType || !sdId) {
        console.log('Usage: node scripts/handoff.js execute HANDOFF_TYPE SD-ID [PRD-ID]');
        console.log('');
        console.log('Handoff Types (case-insensitive):');
        console.log('  LEAD-TO-PLAN        - Strategic to Planning handoff');
        console.log('  PLAN-TO-EXEC        - Planning to Execution handoff');
        console.log('  EXEC-TO-PLAN        - Execution to Verification handoff');
        console.log('  PLAN-TO-LEAD        - Verification to Final Approval handoff');
        console.log('  LEAD-FINAL-APPROVAL - Mark SD as completed (final step)');
        console.log('');
        console.log('TIP: Run "node scripts/handoff.js workflow SD-ID" to see recommended workflow');
        console.log('');
        console.log('Examples:');
        console.log('  node scripts/handoff.js execute PLAN-TO-EXEC SD-EXAMPLE-001');
        console.log('  node scripts/handoff.js execute plan-to-exec SD-EXAMPLE-001');
        process.exit(1);
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
      }

      const result = await system.executeHandoff(handoffType, sdId, { prdId });

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
