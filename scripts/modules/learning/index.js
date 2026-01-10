#!/usr/bin/env node

/**
 * Learning Module Orchestrator
 *
 * Entry point for /learn command functionality.
 * Commands:
 *   process [--sd-id <ID>] - Process learning sources and display with DA
 *   apply --decisions <JSON> - Apply approved decisions
 *   rollback <DECISION_ID> - Rollback a previous decision
 *   insights - Display historical learning metrics
 */

import { buildLearningContext, formatContextForDisplay } from './context-builder.js';
import { reviewContext, formatReviewedContextForDisplay } from './reviewer.js';
import { executeApprovedImprovements, rollbackDecision } from './executor.js';
import { buildInsightsReport, formatInsightsForDisplay } from './insights.js';

/**
 * Process command - gather context and add DA
 */
async function processCommand(sdId = null) {
  console.log('='.repeat(60));
  console.log('  /learn - LEO Protocol Self-Improvement');
  console.log('='.repeat(60));

  // Build context
  const context = await buildLearningContext(sdId);

  if (context.summary.total_patterns === 0 &&
      context.summary.total_lessons === 0 &&
      context.summary.total_improvements === 0) {
    console.log('\nNo learning items found to process.');
    console.log('This could mean:');
    console.log('  - No retrospectives have been created yet');
    console.log('  - No issue patterns have been recorded');
    console.log('  - No pending improvements in the queue');
    return null;
  }

  // Add Devil's Advocate review
  const reviewed = reviewContext(context);

  // Display results
  console.log(formatReviewedContextForDisplay(reviewed));

  console.log('\n' + '='.repeat(60));
  console.log('  PAUSE: Awaiting Your Approval');
  console.log('='.repeat(60));
  console.log('\nReview the items above with their Devil\'s Advocate challenges.');
  console.log('For each item, decide: APPROVE or REJECT (with reason).\n');
  console.log('To apply approved items, use:');
  console.log('  node scripts/modules/learning/index.js apply --decisions \'{"ITEM_ID": {"status": "APPROVED"}}\'');
  console.log('\nOr wait for Claude to prompt you for approval.\n');

  // Return context for Claude to use
  return reviewed;
}

/**
 * Apply command - execute approved decisions
 */
async function applyCommand(decisionsJson, sdId = null) {
  console.log('='.repeat(60));
  console.log('  /learn APPLY - Executing Approved Improvements');
  console.log('='.repeat(60));

  let decisions;
  try {
    decisions = typeof decisionsJson === 'string' ? JSON.parse(decisionsJson) : decisionsJson;
  } catch (error) {
    console.error('Error parsing decisions JSON:', error.message);
    process.exit(1);
  }

  // Need context to find improvement details
  const context = await buildLearningContext(sdId);
  const reviewed = reviewContext(context);

  // Execute
  const result = await executeApprovedImprovements(reviewed, decisions, sdId);

  console.log('\n' + '='.repeat(60));
  console.log('  Execution Summary');
  console.log('='.repeat(60));
  console.log(`Decision ID: ${result.decision_id}`);
  console.log(`Improvements applied: ${result.applied_count}`);
  console.log(`Patterns resolved: ${result.resolved_patterns?.length || 0}`);
  console.log(`Rollback available: ${result.rollback_available ? 'Yes' : 'No'}`);

  if (result.execution_log.length > 0) {
    console.log('\nExecution Log:');
    for (const entry of result.execution_log) {
      const icon = entry.action === 'APPLIED' ? '✅' :
                   entry.action === 'ACKNOWLEDGED' ? '📝' :
                   entry.action === 'PATTERNS_RESOLVED' ? '🔒' :
                   entry.action === 'SKIPPED' ? '⏭️' : '❌';
      console.log(`  ${icon} [${entry.item_id}] ${entry.action} - ${entry.details || entry.reason || ''}`);
    }
  }

  if (result.resolved_patterns?.length > 0) {
    console.log(`\n🔒 Resolved patterns (will not resurface): ${result.resolved_patterns.join(', ')}`);
  }

  if (result.applied_count > 0) {
    console.log('\n💡 CLAUDE.md has been regenerated with protocol updates.');
  }

  return result;
}

/**
 * Rollback command - undo a previous decision
 */
async function rollbackCommand(decisionId) {
  console.log('='.repeat(60));
  console.log('  /learn ROLLBACK - Reverting Changes');
  console.log('='.repeat(60));

  const result = await rollbackDecision(decisionId);

  console.log(`\nDecision ID: ${result.decision_id}`);
  console.log(`Rollback success: ${result.success ? 'Yes' : 'Partial'}`);

  if (result.rollback_log.length > 0) {
    console.log('\nRollback Log:');
    for (const entry of result.rollback_log) {
      const icon = entry.action === 'ROLLED_BACK' ? '↩️' : '❌';
      console.log(`  ${icon} [${entry.item_id}] ${entry.action}`);
    }
  }

  return result;
}

/**
 * Insights command - display historical metrics
 */
async function insightsCommand() {
  console.log('='.repeat(60));
  console.log('  /learn insights - Learning Effectiveness Report');
  console.log('='.repeat(60));

  const insights = await buildInsightsReport();
  console.log(formatInsightsForDisplay(insights));

  return insights;
}

// CLI interface
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  try {
    switch (command) {
      case 'process': {
        const sdIdArg = args.find(a => a.startsWith('--sd-id='));
        const sdId = sdIdArg?.split('=')[1] || null;
        await processCommand(sdId);
        break;
      }

      case 'apply': {
        const decisionsArg = args.find(a => a.startsWith('--decisions='));
        const decisionsJson = decisionsArg?.split('=').slice(1).join('=');
        const sdIdArg = args.find(a => a.startsWith('--sd-id='));
        const sdId = sdIdArg?.split('=')[1] || null;

        if (!decisionsJson) {
          console.error('Error: --decisions=<JSON> is required');
          process.exit(1);
        }

        await applyCommand(decisionsJson, sdId);
        break;
      }

      case 'rollback': {
        const decisionId = args[1];
        if (!decisionId) {
          console.error('Error: decision ID is required');
          console.error('Usage: node index.js rollback <DECISION_ID>');
          process.exit(1);
        }
        await rollbackCommand(decisionId);
        break;
      }

      case 'insights': {
        await insightsCommand();
        break;
      }

      default: {
        console.log('LEO Protocol Learning Module');
        console.log('');
        console.log('Usage:');
        console.log('  node scripts/modules/learning/index.js process [--sd-id=<ID>]');
        console.log('  node scripts/modules/learning/index.js apply --decisions=\'<JSON>\'');
        console.log('  node scripts/modules/learning/index.js rollback <DECISION_ID>');
        console.log('  node scripts/modules/learning/index.js insights');
        console.log('');
        console.log('Commands:');
        console.log('  process   Query learning sources and display with Devil\'s Advocate');
        console.log('  apply     Apply approved improvements (with optional pattern resolution)');
        console.log('  rollback  Undo a previous decision');
        console.log('  insights  Display historical learning metrics');
        console.log('');
        console.log('Decision JSON format:');
        console.log('  {"ITEM_ID": {"status": "APPROVED", "resolves_patterns": ["PAT-001"]}}');
        console.log('  - status: APPROVED or REJECTED');
        console.log('  - resolves_patterns: (optional) pattern IDs this improvement addresses');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

export { processCommand, applyCommand, rollbackCommand, insightsCommand };
