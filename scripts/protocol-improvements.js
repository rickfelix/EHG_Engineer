#!/usr/bin/env node
/**
 * Protocol Improvements CLI
 * Manages the protocol improvement system with extraction, approval, and application
 *
 * Usage:
 *   node scripts/protocol-improvements.js list [--status=PENDING] [--phase=PLAN]
 *   node scripts/protocol-improvements.js review <queue-id>
 *   node scripts/protocol-improvements.js approve <queue-id>
 *   node scripts/protocol-improvements.js reject <queue-id> --reason="..."
 *   node scripts/protocol-improvements.js apply <queue-id>
 *   node scripts/protocol-improvements.js apply-auto [--threshold=0.85] [--dry-run]
 *   node scripts/protocol-improvements.js effectiveness [queue-id]
 *   node scripts/protocol-improvements.js rescan [--since=2025-01-01]
 *
 * @see scripts/modules/protocol-improvements/ for implementation
 */

import { createProtocolImprovementSystem } from './modules/protocol-improvements/index.js';
import { createAIQualityJudge } from './modules/ai-quality-judge/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const system = createProtocolImprovementSystem();

  // Parse flags
  const flags = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      flags[key] = value || true;
    }
  });

  switch (command) {
    case 'list': {
      const filters = {};

      if (flags.status) {
        filters.status = flags.status.toUpperCase();
      }

      if (flags.phase) {
        filters.phase = flags.phase.toUpperCase();
      }

      if (flags.limit) {
        filters.limit = parseInt(flags.limit);
      }

      const improvements = await system.listImprovements(filters);

      console.log('');
      console.log('📋 Protocol Improvement Queue');
      console.log('='.repeat(100));
      console.log('');

      if (improvements.length === 0) {
        console.log('   No improvements found matching criteria');
      } else {
        console.log('   ID                                   | Status    | Category         | Phase | Impact | Auto | Priority');
        console.log('   ' + '-'.repeat(95));

        improvements.forEach(imp => {
          const id = (imp.id || '').substring(0, 36).padEnd(36);
          const status = (imp.status || 'N/A').padEnd(9);
          const category = (imp.improvement_category || 'N/A').padEnd(16);
          const phase = (imp.affected_phase || 'GEN').padEnd(5);
          const impact = (imp.impact || 'N/A').padEnd(6);
          const auto = (imp.auto_apply_score >= 0.85 ? '✓' : ' ').padEnd(4);
          const priority = (imp.auto_apply_score || 0).toFixed(2);

          console.log(`   ${id} | ${status} | ${category} | ${phase} | ${impact} | ${auto} | ${priority}`);
        });

        console.log('');
        console.log(`   Total: ${improvements.length}`);
      }

      console.log('');
      break;
    }

    case 'review': {
      const improvementId = args[1];

      if (!improvementId) {
        console.log('Usage: node scripts/protocol-improvements.js review <queue-id>');
        process.exit(1);
      }

      await system.reviewImprovement(improvementId);
      break;
    }

    case 'approve': {
      const improvementId = args[1];

      if (!improvementId) {
        console.log('Usage: node scripts/protocol-improvements.js approve <queue-id>');
        process.exit(1);
      }

      console.log('');
      await system.approveImprovement(improvementId, process.env.USER || 'system');
      break;
    }

    case 'reject': {
      const improvementId = args[1];

      if (!improvementId) {
        console.log('Usage: node scripts/protocol-improvements.js reject <queue-id> --reason="..."');
        process.exit(1);
      }

      if (!flags.reason) {
        console.log('Error: --reason flag is required for rejection');
        process.exit(1);
      }

      console.log('');
      await system.rejectImprovement(improvementId, flags.reason, process.env.USER || 'system');
      break;
    }

    case 'apply': {
      const improvementId = args[1];

      if (!improvementId) {
        console.log('Usage: node scripts/protocol-improvements.js apply <queue-id> [--dry-run]');
        process.exit(1);
      }

      const dryRun = !!flags['dry-run'];

      console.log('');
      const result = await system.applyImprovement(improvementId, dryRun);

      if (result.success) {
        console.log('✅ APPLICATION SUCCESSFUL');
        if (result.notes) {
          console.log(`   Notes: ${result.notes}`);
        }
      } else {
        console.log('❌ APPLICATION FAILED');
        console.log(`   Error: ${result.error}`);
      }

      console.log('');
      process.exit(result.success ? 0 : 1);
    }

    case 'apply-auto': {
      const threshold = parseFloat(flags.threshold || '0.85');
      const dryRun = !!flags['dry-run'];

      console.log('');
      console.log(`🤖 Auto-Applying Improvements (threshold: ${threshold})`);
      if (dryRun) {
        console.log('   DRY RUN - No changes will be made');
      }
      console.log('');

      const results = await system.applyAutoImprovements(threshold, dryRun);

      console.log('');
      console.log('Results:');
      results.forEach(result => {
        const status = result.success ? '✅' : '❌';
        console.log(`  ${status} ${result.text.substring(0, 80)}...`);
        if (result.error) {
          console.log(`     Error: ${result.error}`);
        }
      });

      console.log('');
      break;
    }

    case 'effectiveness': {
      const improvementId = args[1];

      if (improvementId) {
        // Show effectiveness for specific improvement
        await system.getImprovementEffectiveness(improvementId);
      } else {
        // Show overall effectiveness report
        const filters = {};

        if (flags.minScore) {
          filters.minScore = parseFloat(flags.minScore);
        }

        await system.getEffectivenessReport(filters);
      }

      break;
    }

    case 'rescan': {
      const since = flags.since || null;

      const filters = {};
      if (since) {
        filters.since = since;
      }

      const result = await system.rescanRetrospectives(filters);

      console.log('');
      console.log('✅ Rescan Complete');
      console.log('='.repeat(50));
      console.log(`   Total Extracted: ${result.total}`);
      console.log(`   Inserted/Updated: ${result.inserted}`);
      console.log(`   Skipped: ${result.skipped}`);
      console.log('');
      break;
    }

    case 'evaluate': {
      const improvementId = args[1];
      const judge = createAIQualityJudge();

      if (!improvementId) {
        console.log('Usage: node scripts/protocol-improvements.js evaluate <queue-id>');
        console.log('       node scripts/protocol-improvements.js evaluate --all [--limit=N] [--threshold=70]');
        process.exit(1);
      }

      if (improvementId === '--all' || flags.all) {
        // Batch evaluation
        const result = await judge.evaluatePending({
          limit: parseInt(flags.limit || '10'),
          threshold: parseInt(flags.threshold || '70'),
          risk_tier: flags.tier
        });

        console.log('');
        console.log('✅ Batch Evaluation Complete');
        console.log(`   Evaluated: ${result.evaluated}`);
        console.log(`   Approved: ${result.approved}`);
        console.log(`   Needs Revision: ${result.needs_revision}`);
        console.log(`   Rejected: ${result.rejected}`);
        console.log('');
      } else {
        // Single evaluation
        const result = await judge.evaluate(improvementId);

        console.log('');
        if (result.recommendation === 'APPROVE') {
          console.log('✅ AI QUALITY JUDGE: APPROVE');
        } else if (result.recommendation === 'NEEDS_REVISION') {
          console.log('⚠️  AI QUALITY JUDGE: NEEDS REVISION');
        } else {
          console.log('❌ AI QUALITY JUDGE: REJECT');
        }

        console.log(`   Score: ${result.score}%`);
        console.log(`   Confidence: ${result.confidence}`);

        if (result.requires_human_review) {
          console.log('   👤 Human review required');
        }

        console.log('');
      }

      break;
    }

    case 'evaluation-report': {
      const improvementId = args[1];

      if (!improvementId) {
        console.log('Usage: node scripts/protocol-improvements.js evaluation-report <queue-id>');
        process.exit(1);
      }

      const judge = createAIQualityJudge();
      const report = await judge.getReport(improvementId);

      console.log('');
      console.log('📊 AI Quality Judge Evaluation Report');
      console.log('='.repeat(60));
      console.log('');
      console.log('IMPROVEMENT:');
      console.log(`   ID: ${report.improvement.id}`);
      console.log(`   Type: ${report.improvement.type}`);
      console.log(`   Target: ${report.improvement.target_table}`);
      console.log(`   Risk Tier: ${report.improvement.risk_tier}`);
      console.log(`   Status: ${report.improvement.status}`);
      console.log('');

      if (report.assessment) {
        console.log('ASSESSMENT:');
        console.log(`   Score: ${report.assessment.score}%`);
        console.log(`   Recommendation: ${report.assessment.recommendation}`);
        console.log(`   Evaluator: ${report.assessment.evaluator_model}`);
        console.log(`   Evaluated: ${report.assessment.evaluated_at}`);
        console.log('');
        console.log('   Criteria Scores:');
        for (const [criterion, score] of Object.entries(report.assessment.criteria_scores || {})) {
          console.log(`      ${criterion}: ${score}/10`);
        }
      } else {
        console.log('   No assessment found. Run: evaluate <id>');
      }

      if (report.constitution_violations) {
        console.log('');
        console.log('CONSTITUTION VIOLATIONS:');
        console.log(`   Count: ${report.constitution_violations.violation_count}`);
        for (const v of report.constitution_violations.violations || []) {
          console.log(`   - ${v.rule_code}: ${v.message}`);
        }
      }

      console.log('');
      break;
    }

    case 'judge-stats': {
      const judge = createAIQualityJudge();
      const stats = await judge.getStatistics();

      console.log('');
      console.log('📊 AI Quality Judge Statistics');
      console.log('='.repeat(50));
      console.log('');
      console.log(`   Total Assessments: ${stats.total_assessments}`);
      console.log(`   Average Score: ${stats.average_score}%`);
      console.log('');
      console.log('   By Recommendation:');
      console.log(`      APPROVE: ${stats.by_recommendation.APPROVE}`);
      console.log(`      NEEDS_REVISION: ${stats.by_recommendation.NEEDS_REVISION}`);
      console.log(`      REJECT: ${stats.by_recommendation.REJECT}`);
      console.log('');
      console.log('   Score Distribution:');
      console.log(`      Excellent (85-100): ${stats.score_distribution.excellent}`);
      console.log(`      Good (70-84): ${stats.score_distribution.good}`);
      console.log(`      Fair (50-69): ${stats.score_distribution.fair}`);
      console.log(`      Poor (0-49): ${stats.score_distribution.poor}`);
      console.log('');

      break;
    }

    case 'stats': {
      const stats = await system.getStats();

      console.log('');
      console.log('📊 Protocol Improvement Statistics');
      console.log('='.repeat(50));
      console.log('');
      console.log(`   Total Improvements: ${stats.total}`);
      console.log(`   Pending: ${stats.pending}`);
      console.log(`   Approved: ${stats.approved}`);
      console.log(`   Applied: ${stats.applied}`);
      console.log(`   Rejected: ${stats.rejected}`);
      console.log('');

      if (Object.keys(stats.byCategory).length > 0) {
        console.log('   By Category:');
        Object.entries(stats.byCategory)
          .sort((a, b) => b[1] - a[1])
          .forEach(([category, count]) => {
            console.log(`     ${category}: ${count}`);
          });
        console.log('');
      }

      if (Object.keys(stats.byPhase).length > 0) {
        console.log('   By Phase:');
        Object.entries(stats.byPhase)
          .sort((a, b) => b[1] - a[1])
          .forEach(([phase, count]) => {
            console.log(`     ${phase}: ${count}`);
          });
        console.log('');
      }

      if (Object.keys(stats.byImpact).length > 0) {
        console.log('   By Impact:');
        Object.entries(stats.byImpact)
          .sort((a, b) => b[1] - a[1])
          .forEach(([impact, count]) => {
            console.log(`     ${impact}: ${count}`);
          });
        console.log('');
      }

      break;
    }

    case 'help':
    default:
      console.log('');
      console.log('Protocol Improvements CLI');
      console.log('='.repeat(50));
      console.log('');
      console.log('COMMANDS:');
      console.log('  list [--status] [--phase]       - List improvements in queue');
      console.log('  review <id>                     - Review improvement details');
      console.log('  evaluate <id>                   - AI Quality Judge evaluation (Phase 1)');
      console.log('  evaluate --all [--limit=N]      - Batch evaluate pending improvements');
      console.log('  evaluation-report <id>          - Show detailed evaluation report');
      console.log('  judge-stats                     - AI Quality Judge statistics');
      console.log('  approve <id>                    - Approve improvement');
      console.log('  reject <id> --reason="..."      - Reject improvement');
      console.log('  apply <id> [--dry-run]          - Apply improvement');
      console.log('  apply-auto [--threshold] [--dry-run] - Auto-apply eligible improvements');
      console.log('  effectiveness [id]              - Show effectiveness report');
      console.log('  rescan [--since]                - Rescan retrospectives');
      console.log('  stats                           - Show system statistics');
      console.log('  help                            - Show this help');
      console.log('');
      console.log('FLAGS:');
      console.log('  --status=PENDING|APPROVED|APPLIED|REJECTED');
      console.log('  --phase=LEAD|PLAN|EXEC');
      console.log('  --threshold=0.85 (for apply-auto)');
      console.log('  --since=2025-01-01 (for rescan)');
      console.log('  --reason="..." (for reject)');
      console.log('  --dry-run (for apply commands)');
      console.log('  --limit=N (for list)');
      console.log('');
      console.log('EXAMPLES:');
      console.log('  node scripts/protocol-improvements.js list --status=PENDING');
      console.log('  node scripts/protocol-improvements.js review abc-123-def');
      console.log('  node scripts/protocol-improvements.js approve abc-123-def');
      console.log('  node scripts/protocol-improvements.js reject abc-123-def --reason="Not applicable"');
      console.log('  node scripts/protocol-improvements.js apply abc-123-def');
      console.log('  node scripts/protocol-improvements.js apply-auto --threshold=0.90 --dry-run');
      console.log('  node scripts/protocol-improvements.js effectiveness');
      console.log('  node scripts/protocol-improvements.js rescan --since=2025-01-01');
      console.log('');
  }
}

// Execute
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
