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

import { buildLearningContext } from './context-builder.js';
import { reviewContext, formatReviewedContextForDisplay } from './reviewer.js';
import { executeSDCreationWorkflow, executeApprovedImprovements, rollbackDecision } from './executor.js';
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
 * Auto-approve command - for AUTO-PROCEED mode
 *
 * Trusts the existing composite score filtering in context-builder.js
 * and auto-approves all items that passed filtering (score >= threshold).
 * Creates SD from approved items without human review.
 *
 * @param {number} threshold - Minimum composite_score to auto-approve (default: 50)
 * @param {string|null} sdId - Optional SD context
 * @returns {Promise<{approved: number, deferred: number, sd_key: string|null}>}
 */
async function autoApproveCommand(threshold = 50, sdId = null) {
  console.log('='.repeat(60));
  console.log('  /learn AUTO-APPROVE (AUTO-PROCEED Mode)');
  console.log('='.repeat(60));
  console.log(`\n  Composite score threshold: >= ${threshold}`);
  console.log('  Trusting existing severity-weighted filters\n');

  // Build context (same filtering as interactive mode)
  const context = await buildLearningContext(sdId);

  if (context.summary.total_patterns === 0 &&
      context.summary.total_lessons === 0 &&
      context.summary.total_improvements === 0) {
    console.log('\nNo learning items found to process.');
    console.log('AUTO-APPROVE: Nothing to act on.\n');
    return { approved: 0, deferred: 0, sd_key: null };
  }

  // Add Devil's Advocate (still run for audit trail, but don't pause)
  const reviewed = reviewContext(context);

  // Separate items by composite score threshold
  const qualifying = [];
  const deferred = [];

  for (const pattern of (reviewed.patterns || [])) {
    const score = pattern.composite_score || 0;
    if (score >= threshold) {
      qualifying.push(pattern);
    } else {
      deferred.push({ ...pattern, reason: `composite_score ${score} < ${threshold}` });
    }
  }

  for (const improvement of (reviewed.improvements || [])) {
    // Improvements don't have composite_score from the view;
    // they passed getPendingImprovements() filtering, so auto-approve all
    qualifying.push(improvement);
  }

  // SD-LEARN-FIX-011: Include sub-agent learnings (SAL-* items)
  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-008: SAL items use a HIGHER threshold
  // than patterns/improvements because they originate from sub-agent execution
  // history, not from actual issue pattern analysis. This prevents noise SDs.
  const salThreshold = Math.max(threshold, 75); // SAL minimum: 75%
  for (const sal of (reviewed.sub_agent_learnings || [])) {
    const score = sal.confidence || 0;
    if (score >= salThreshold) {
      qualifying.push(sal);
    } else {
      deferred.push({ ...sal, reason: `SAL confidence ${score} < ${salThreshold} (SAL-specific threshold)` });
    }
  }

  // Display what was found
  console.log('  ' + '-'.repeat(40));
  console.log(`  Items found:       ${qualifying.length + deferred.length}`);
  console.log(`  Auto-approved:     ${qualifying.length} (score >= ${threshold})`);
  console.log(`  Deferred:          ${deferred.length} (below threshold)`);
  console.log('  ' + '-'.repeat(40));

  if (deferred.length > 0) {
    console.log('\n  Deferred items (will surface next run):');
    for (const d of deferred) {
      console.log(`    - [${d.id}] score=${d.composite_score || 'N/A'}: ${(d.content || '').substring(0, 60)}`);
    }
  }

  if (qualifying.length === 0) {
    console.log('\n  No items above threshold. Nothing auto-approved.');
    console.log('  These items will appear in interactive /learn for manual review.\n');
    return { approved: 0, deferred: deferred.length, sd_key: null };
  }

  // Build decisions object (auto-approve all qualifying)
  const decisions = {};
  for (const item of qualifying) {
    const itemId = item.pattern_id || item.id;
    decisions[itemId] = { status: 'APPROVED' };
  }

  console.log('\n  Auto-approving and creating SD...\n');

  // Create SD using existing workflow (skip protocol file check for CLI invocation)
  const result = await executeSDCreationWorkflow(reviewed, decisions, { skipLeadValidation: true });

  if (!result.success) {
    console.log('\n  Auto-approve SD creation failed:', result.message || result.error);
    if (result.conflicts) {
      console.log('  Conflicting assignments:');
      for (const c of result.conflicts) {
        console.log(`    - ${c.item_id} already assigned to ${c.assigned_sd_id}`);
      }
    }
    return { approved: 0, deferred: deferred.length, sd_key: null, error: result.error };
  }

  console.log('\n' + '='.repeat(60));
  console.log('  AUTO-APPROVE Summary');
  console.log('='.repeat(60));
  console.log('  Mode:          AUTO-PROCEED (no human review)');
  console.log(`  Items approved: ${qualifying.length}`);
  console.log(`  Items deferred: ${deferred.length}`);
  console.log(`  SD created:     ${result.sd_key}`);
  console.log(`  Classification: ${result.classification}`);
  console.log('='.repeat(60));
  console.log('');

  return {
    approved: qualifying.length,
    deferred: deferred.length,
    sd_key: result.sd_key,
    sd_id: result.sd_id,
    classification: result.classification
  };
}

/**
 * Apply command - create SD from approved decisions
 * NEW WORKFLOW: Creates SD instead of directly applying changes
 */
async function applyCommand(decisionsJson, sdId = null, useLegacy = false) {
  console.log('='.repeat(60));
  console.log('  /learn APPLY - Creating SD from Approved Items');
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

  // Use new SD creation workflow by default
  if (!useLegacy) {
    const result = await executeSDCreationWorkflow(reviewed, decisions);

    if (!result.success) {
      console.log('\n❌ SD creation failed:', result.message || result.error);
      if (result.conflicts) {
        console.log('\nConflicting assignments:');
        for (const c of result.conflicts) {
          console.log(`   - ${c.item_id} → ${c.assigned_sd_id} (${c.sd_status})`);
        }
      }
      return result;
    }

    // Success - SD created
    if (result.sd_id) {
      console.log('\n💡 SD has been created. Follow LEO Protocol to implement the fix.');
    }

    return result;
  }

  // Legacy workflow (direct apply) - kept for backward compatibility
  console.log('\n⚠️  Using legacy direct-apply workflow');
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

      case 'auto-approve': {
        const thresholdArg = args.find(a => a.startsWith('--threshold='));
        const threshold = thresholdArg ? parseInt(thresholdArg.split('=')[1], 10) : 50;
        const sdIdArg = args.find(a => a.startsWith('--sd-id='));
        const sdId = sdIdArg?.split('=')[1] || null;
        await autoApproveCommand(threshold, sdId);
        break;
      }

      case 'apply': {
        const decisionsArg = args.find(a => a.startsWith('--decisions='));
        const decisionsJson = decisionsArg?.split('=').slice(1).join('=');
        const sdIdArg = args.find(a => a.startsWith('--sd-id='));
        const sdId = sdIdArg?.split('=')[1] || null;
        const useLegacy = args.includes('--legacy');

        if (!decisionsJson) {
          console.error('Error: --decisions=<JSON> is required');
          process.exit(1);
        }

        await applyCommand(decisionsJson, sdId, useLegacy);
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
        console.log('  node scripts/modules/learning/index.js auto-approve [--threshold=50]');
        console.log('  node scripts/modules/learning/index.js apply --decisions=\'<JSON>\' [--legacy]');
        console.log('  node scripts/modules/learning/index.js rollback <DECISION_ID>');
        console.log('  node scripts/modules/learning/index.js insights');
        console.log('');
        console.log('Commands:');
        console.log('  process       Query learning sources and display with Devil\'s Advocate');
        console.log('  auto-approve  Auto-approve high-value items (for AUTO-PROCEED mode)');
        console.log('  apply         Create SD from approved items (default) or apply directly (--legacy)');
        console.log('  rollback      Undo a previous decision');
        console.log('  insights      Display historical learning metrics');
        console.log('');
        console.log('New Workflow (default):');
        console.log('  - Approved items create a Strategic Directive (SD)');
        console.log('  - Patterns/improvements are tagged with the SD ID');
        console.log('  - LEO Protocol handles implementation (LEAD→PLAN→EXEC)');
        console.log('');
        console.log('Legacy Workflow (--legacy flag):');
        console.log('  - Directly inserts into target tables (no enforcement)');
        console.log('');
        console.log('Decision JSON format:');
        console.log('  {"ITEM_ID": {"status": "APPROVED"}}');
        console.log('  - status: APPROVED or REJECTED');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

export { processCommand, autoApproveCommand, applyCommand, rollbackCommand, insightsCommand };
