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
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const system = createHandoffSystem();

  switch (command) {
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
        console.log('Examples:');
        console.log('  node scripts/handoff.js execute PLAN-TO-EXEC SD-EXAMPLE-001');
        console.log('  node scripts/handoff.js execute plan-to-exec SD-EXAMPLE-001');
        process.exit(1);
      }

      console.log('');
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
      console.log('EXAMPLES:');
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
