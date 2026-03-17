#!/usr/bin/env node

/**
 * Unified LEO Protocol Handoff System v2 (Refactored)
 *
 * This is the new, modular version of the handoff system.
 * The original 2,371-line file has been refactored into:
 * - scripts/modules/handoff/HandoffOrchestrator.js (~170 lines)
 * - scripts/modules/handoff/executors/*.js (~150-250 lines each)
 * - scripts/modules/handoff/db/*.js (~80-200 lines each)
 * - scripts/modules/handoff/validation/*.js (~200 lines)
 * - scripts/modules/handoff/recording/*.js (~200 lines)
 * - scripts/modules/handoff/content/*.js (~250 lines)
 *
 * FEATURES (unchanged from v1):
 * - Unified interface for all handoff types (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN, PLAN→LEAD)
 * - Database-driven execution with full audit trail
 * - PRD quality enforcement for transitions
 * - Template-based validation with custom rules
 * - Rejection workflow with improvement guidance
 * - Dashboard integration for real-time monitoring
 *
 * IMPROVEMENTS in v2:
 * - Dependency injection for testability
 * - Separation of concerns
 * - ~57% code reduction in main orchestrator
 * - Individual modules under 25k tokens
 */

import { createHandoffSystem, HandoffOrchestrator } from './modules/handoff/index.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * UnifiedHandoffSystem - Backward-compatible wrapper
 * Maintains the same API as the original class
 */
class UnifiedHandoffSystem {
  constructor() {
    this._orchestrator = createHandoffSystem();
  }

  /**
   * Execute a handoff
   * @param {string} handoffType - Handoff type (case-insensitive)
   * @param {string} sdId - Strategic Directive ID
   * @param {object} options - Execution options
   * @returns {Promise<object>} Execution result
   */
  async executeHandoff(handoffType, sdId, options = {}) {
    return this._orchestrator.executeHandoff(handoffType, sdId, options);
  }

  /**
   * List handoff executions
   * @param {object} filters - Query filters
   * @returns {Promise<array>} Execution records
   */
  async listHandoffExecutions(filters = {}) {
    return this._orchestrator.listHandoffExecutions(filters);
  }

  /**
   * Get handoff system statistics
   * @returns {Promise<object|null>} Statistics
   */
  async getHandoffStats() {
    return this._orchestrator.getHandoffStats();
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const system = new UnifiedHandoffSystem();

  switch (command) {
    case 'execute': {
      const handoffType = args[1];
      const sdId = args[2];
      const dryRun = args.includes('--dry-run');
      const prdId = args.find((a, i) => i >= 3 && !a.startsWith('--'));

      if (!handoffType || !sdId) {
        console.log('Usage: node unified-handoff-system-v2.js execute HANDOFF_TYPE SD-YYYY-XXX [PRD-ID] [--dry-run]');
        console.log('');
        console.log('Handoff Types (case-insensitive, normalized to uppercase):');
        console.log('  LEAD-TO-PLAN   - Strategic to Planning handoff');
        console.log('  PLAN-TO-EXEC   - Planning to Execution handoff');
        console.log('  EXEC-TO-PLAN   - Execution to Verification handoff');
        console.log('  PLAN-TO-LEAD   - Verification to Final Approval handoff');
        console.log('');
        console.log('Flags:');
        console.log('  --dry-run   Show gate manifest and scores without executing');
        process.exit(1);
      }

      if (dryRun) {
        const result = await system._orchestrator.dryRunHandoff(handoffType, sdId, { prdId, evaluate: true });
        if (!result.success) {
          console.error(`DRY RUN ERROR: ${result.error}`);
          process.exit(1);
        }
        // Display summary table
        console.log('');
        console.log(`DRY RUN: ${result.handoffType} for ${result.sdKey || result.sdId}`);
        console.log('='.repeat(70));
        console.log(`  SD: ${result.sdTitle} (${result.sdType})`);
        console.log(`  Threshold: ${result.gateThreshold}%`);
        console.log('');
        if (result.evaluationResults) {
          console.log('  Gate                                    | Source           | Score     | Result');
          console.log('  ' + '-'.repeat(86));
          for (const row of result.evaluationResults) {
            const name = row.name.padEnd(40);
            const src = row.source.padEnd(16);
            const score = row.score !== null ? `${row.score}/${row.maxScore}`.padEnd(9) : 'N/A      ';
            const pass = row.enabled ? (row.passed ? 'PASS' : 'FAIL') : 'DISABLED';
            console.log(`  ${name} | ${src} | ${score} | ${pass}`);
          }
          console.log('  ' + '-'.repeat(86));
          console.log(`  Aggregate: ${result.aggregateScore}% (threshold: ${result.gateThreshold}%) => ${result.wouldPass ? 'WOULD PASS' : 'WOULD FAIL'}`);
        }
        console.log('');
        process.exit(0);
      }

      const result = await system.executeHandoff(handoffType, sdId, { prdId });
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'list': {
      const sdFilter = args[1];
      const executions = await system.listHandoffExecutions({
        sdId: sdFilter,
        limit: 20
      });

      console.log('📋 Recent Handoff Executions');
      console.log('='.repeat(60));
      executions.forEach(exec => {
        console.log(`${exec.handoff_type} | ${exec.sd_id} | ${exec.status} | ${exec.validation_score}% | ${exec.initiated_at}`);
      });
      break;
    }

    case 'stats': {
      const stats = await system.getHandoffStats();
      if (stats) {
        console.log('📊 Handoff System Statistics');
        console.log('='.repeat(40));
        console.log(`Total Executions: ${stats.total}`);
        console.log(`Success Rate: ${Math.round((stats.successful / stats.total) * 100)}%`);
        console.log(`Average Score: ${Math.round(stats.averageScore)}%`);
        console.log('');
        console.log('By Type:');
        Object.entries(stats.byType).forEach(([type, typeStats]) => {
          console.log(`  ${type}: ${typeStats.successful}/${typeStats.total} (${Math.round(typeStats.averageScore)}%)`);
        });
      }
      break;
    }

    case 'help':
    default:
      console.log('Unified LEO Protocol Handoff System v2 (Refactored)');
      console.log('='.repeat(50));
      console.log('');
      console.log('COMMANDS:');
      console.log('  execute TYPE SD-ID     - Execute handoff');
      console.log('  list [SD-ID]          - List handoff executions');
      console.log('  stats                 - Show system statistics');
      console.log('  help                  - Show this help');
      console.log('');
      console.log('FEATURES:');
      console.log('• Database-driven handoff templates');
      console.log('• PRD quality enforcement');
      console.log('• Complete audit trail');
      console.log('• Rejection workflow with improvement guidance');
      console.log('• Dashboard integration');
      console.log('');
      console.log('IMPROVEMENTS in v2:');
      console.log('• Modular architecture (~57% code reduction)');
      console.log('• Dependency injection for testing');
      console.log('• Individual modules under 25k tokens');
      console.log('');
      console.log('INTEGRATION:');
      console.log('• Used by LEO Protocol agents for all handoffs');
      console.log('• Enforces quality gates at each transition');
      console.log('• Provides consistent handoff experience');
  }
}

// Execute if run directly (Windows-compatible)
const _isMain = process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\\\/g, '/')}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`);
if (_isMain) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export both the class and the orchestrator for different use cases
export default UnifiedHandoffSystem;
export { UnifiedHandoffSystem, createHandoffSystem, HandoffOrchestrator };
