#!/usr/bin/env node

/**
 * LEAD Evaluation Enforcement Wrapper
 *
 * This script wraps ALL LEAD operations to ensure the Critical Evaluator
 * framework is applied before any work begins on strategic directives.
 *
 * MANDATORY: Run before any LEAD action on any SD
 *
 * Usage Examples:
 *   node enforce-lead-evaluation.js --action=approve --sd-id=SD-XXX
 *   node enforce-lead-evaluation.js --action=handoff --sd-id=SD-XXX
 *   node enforce-lead-evaluation.js --action=review --sd-id=SD-XXX
 *
 * LEO Protocol v4.2.0 - Critical Evaluator Enforcement
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class LEADEvaluationEnforcer {
  constructor() {
    this.validActions = [
      'approve',    // LEAD approval of SD
      'handoff',    // Creating LEAD→PLAN handoff
      'review',     // General LEAD review
      'final',      // Final LEAD approval
      'assess'      // Assessment/evaluation
    ];
  }

  async enforceEvaluation(action, sdId) {
    console.log(chalk.blue(`\n🛡️  LEAD EVALUATION ENFORCEMENT`));
    console.log(chalk.blue(`${'='.repeat(50)}`));
    console.log(`Action: ${action}`);
    console.log(`SD ID: ${sdId}`);

    // Validate inputs
    if (!this.validActions.includes(action)) {
      console.error(chalk.red(`❌ Invalid action: ${action}`));
      console.error(chalk.red(`Valid actions: ${this.validActions.join(', ')}`));
      return false;
    }

    // Check if SD exists
    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, target_application')
      .eq('id', sdId)
      .single();

    if (error || !sd) {
      console.error(chalk.red(`❌ Strategic Directive ${sdId} not found`));
      return false;
    }

    // Check if LEAD evaluation already exists and is valid
    const evaluationStatus = await this.checkEvaluationStatus(sdId);

    console.log(`\n📋 SD: ${sd.title}`);
    console.log(`📊 Status: ${sd.status}`);
    console.log(`🎯 Target: ${sd.target_application}`);

    if (evaluationStatus.needsEvaluation) {
      console.log(chalk.yellow(`\n⚠️  LEAD Critical Evaluation Required`));
      console.log(chalk.yellow(`Reason: ${evaluationStatus.reason}`));

      // Run the LEAD Critical Evaluator
      const evaluationPassed = await this.runCriticalEvaluator(sdId);

      if (!evaluationPassed) {
        console.log(chalk.red(`\n🛑 LEAD evaluation failed - ${action} operation blocked`));
        console.log(chalk.red(`LEAD must challenge business value before proceeding`));
        return false;
      }
    } else {
      console.log(chalk.green(`\n✅ LEAD evaluation already complete`));
      console.log(`Decision: ${evaluationStatus.decision} (${evaluationStatus.confidence}% confidence)`);
      console.log(`Evaluated: ${evaluationStatus.evaluated_at}`);

      // Check if evaluation decision allows the requested action
      const actionAllowed = this.checkActionAllowed(action, evaluationStatus.decision);
      if (!actionAllowed) {
        console.log(chalk.red(`\n🛑 Action '${action}' not allowed with evaluation decision '${evaluationStatus.decision}'`));
        return false;
      }
    }

    // Proceed with the requested action
    console.log(chalk.green(`\n✅ LEAD evaluation passed - proceeding with ${action}`));
    return await this.executeAction(action, sdId);
  }

  async checkEvaluationStatus(sdId) {
    const { data: latestEvaluation, error } = await supabase
      .rpc('get_latest_lead_evaluation', { p_sd_id: sdId });

    if (error) {
      console.warn(chalk.yellow(`Warning: Could not check evaluation status: ${error.message}`));
      return { needsEvaluation: true, reason: 'Could not verify existing evaluation' };
    }

    if (!latestEvaluation || latestEvaluation.length === 0) {
      return { needsEvaluation: true, reason: 'No LEAD evaluation found' };
    }

    const evaluation = latestEvaluation[0];
    const evaluatedAt = new Date(evaluation.evaluated_at);
    const daysSinceEvaluation = (new Date() - evaluatedAt) / (1000 * 60 * 60 * 24);

    // Re-evaluate if older than 30 days (business context may have changed)
    if (daysSinceEvaluation > 30) {
      return {
        needsEvaluation: true,
        reason: `Evaluation is ${Math.round(daysSinceEvaluation)} days old - may be stale`
      };
    }

    return {
      needsEvaluation: false,
      decision: evaluation.final_decision,
      confidence: evaluation.confidence_score,
      evaluated_at: evaluation.evaluated_at,
      justification: evaluation.justification
    };
  }

  async runCriticalEvaluator(sdId) {
    console.log(chalk.blue(`\n🎯 Running LEAD Critical Evaluator`));

    try {
      // Execute the critical evaluator script
      execSync(`node scripts/lead-critical-evaluator.js --sd-id=${sdId}`, {
        stdio: 'inherit',
        encoding: 'utf8'
      });
      return true;
    } catch (error) {
      console.error(chalk.red(`❌ Critical evaluation failed: ${error.message}`));
      return false;
    }
  }

  checkActionAllowed(action, evaluationDecision) {
    const allowedActions = {
      'APPROVE': ['approve', 'handoff', 'review', 'final', 'assess'],
      'CONDITIONAL': ['review', 'assess'], // Need more analysis before proceeding
      'CONSOLIDATE': ['review', 'assess'], // Need to merge with existing
      'DEFER': ['review', 'assess'], // Lower priority, limited actions
      'REJECT': ['review'], // Only review to reconsider
      'CLARIFY': ['review', 'assess'] // Need better definition
    };

    const allowed = allowedActions[evaluationDecision] || [];
    return allowed.includes(action);
  }

  async executeAction(action, sdId) {
    console.log(chalk.blue(`\n⚡ Executing LEAD action: ${action}`));

    try {
      switch (action) {
        case 'approve':
          execSync(`node scripts/lead-approve-sdip.js --sd-id=${sdId}`, {
            stdio: 'inherit',
            encoding: 'utf8'
          });
          break;

        case 'handoff':
          console.log(chalk.yellow(`Creating LEAD→PLAN handoff for ${sdId}`));
          execSync(`node scripts/unified-handoff-system.js --type=LEAD-to-PLAN --sd-id=${sdId}`, {
            stdio: 'inherit',
            encoding: 'utf8'
          });
          break;

        case 'review':
          console.log(chalk.yellow(`Conducting LEAD review for ${sdId}`));
          execSync(`node scripts/conduct-lead-approval-assessment.js --sd-id=${sdId}`, {
            stdio: 'inherit',
            encoding: 'utf8'
          });
          break;

        case 'final':
          console.log(chalk.yellow(`Starting LEAD final approval for ${sdId}`));
          execSync(`node scripts/start-lead-approval.js --sd-id=${sdId}`, {
            stdio: 'inherit',
            encoding: 'utf8'
          });
          break;

        case 'assess':
          console.log(chalk.green(`✅ Assessment complete - evaluation on record`));
          break;

        default:
          console.error(chalk.red(`❌ Unknown action: ${action}`));
          return false;
      }

      console.log(chalk.green(`✅ LEAD action '${action}' completed successfully`));
      return true;

    } catch (error) {
      console.error(chalk.red(`❌ LEAD action failed: ${error.message}`));
      return false;
    }
  }

  displayUsageGuidance() {
    console.log(chalk.blue(`\n📋 LEAD EVALUATION ENFORCEMENT GUIDE`));
    console.log(chalk.blue(`${'='.repeat(50)}`));
    console.log(`\n🎯 Purpose: Ensure LEAD Critical Evaluator runs before ANY SD work`);
    console.log(`\n📝 Available Actions:`);
    console.log(`  • approve  - Approve SD for progression`);
    console.log(`  • handoff  - Create LEAD→PLAN handoff`);
    console.log(`  • review   - General LEAD review`);
    console.log(`  • final    - Final LEAD approval`);
    console.log(`  • assess   - Run evaluation only`);

    console.log(`\n🚨 Critical Evaluator Framework:`);
    console.log(`  1. Business Value Interrogation`);
    console.log(`  2. Duplication & Redundancy Check`);
    console.log(`  3. Resource Justification`);
    console.log(`  4. Scope & Complexity Assessment`);

    console.log(`\n🔍 Decision Matrix:`);
    console.log(`  • APPROVE    → All actions allowed`);
    console.log(`  • CONDITIONAL → Review/assess only`);
    console.log(`  • CONSOLIDATE → Review/assess only`);
    console.log(`  • DEFER      → Review/assess only`);
    console.log(`  • REJECT     → Review only`);
    console.log(`  • CLARIFY    → Review/assess only`);

    console.log(`\n💡 Remember: LEAD protects resources, doesn't accommodate requests`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    const enforcer = new LEADEvaluationEnforcer();
    enforcer.displayUsageGuidance();
    return;
  }

  const actionArg = args.find(arg => arg.startsWith('--action='));
  const sdIdArg = args.find(arg => arg.startsWith('--sd-id='));

  if (!actionArg || !sdIdArg) {
    console.error(chalk.red('Usage: node enforce-lead-evaluation.js --action=ACTION --sd-id=SD-XXX'));
    console.error(chalk.red('Use --help for detailed guidance'));
    process.exit(1);
  }

  const action = actionArg.split('=')[1];
  const sdId = sdIdArg.split('=')[1];

  const enforcer = new LEADEvaluationEnforcer();
  const success = await enforcer.enforceEvaluation(action, sdId);

  if (success) {
    console.log(chalk.green(`\n✅ LEAD operation completed with proper evaluation`));
  } else {
    console.log(chalk.red(`\n❌ LEAD operation blocked by evaluation framework`));
    process.exit(1);
  }
}

main().catch(console.error);