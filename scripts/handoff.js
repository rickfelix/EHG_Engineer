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
        console.log(`   Score: ${result.totalScore || result.qualityScore || 'N/A'}%`);
        if (result.warnings?.length > 0) {
          console.log(`   Warnings: ${result.warnings.length}`);
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
