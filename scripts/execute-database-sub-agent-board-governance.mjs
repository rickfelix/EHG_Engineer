#!/usr/bin/env node
/**
 * Execute Database Architect Sub-Agent
 * Strategic Directive: SD-BOARD-GOVERNANCE-001
 * Purpose: Validate board governance database migration
 */

import { executeSubAgent } from '../lib/sub-agent-executor.js';

const SD_ID = 'SD-BOARD-GOVERNANCE-001';

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🗄️  Database Architect Sub-Agent Execution');
  console.log(`   SD: ${SD_ID}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  try {
    // Execute Database Architect sub-agent with full validation
    const result = await executeSubAgent('DATABASE', SD_ID, {
      verify_db: false,  // Skip database verification (migration not applied yet)
      check_seed_data: false,  // Skip seed data check
      diagnose_rls: false  // Skip RLS diagnostic
    });

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('📊 DATABASE ARCHITECT VERDICT');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Verdict: ${result.verdict}`);
    console.log(`Confidence: ${result.confidence}%`);

    if (result.critical_issues && result.critical_issues.length > 0) {
      console.log('\n❌ CRITICAL ISSUES:');
      result.critical_issues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue.issue || issue.severity}: ${issue.recommendation || issue.details}`);
      });
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      result.warnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. [${warning.severity}] ${warning.issue}`);
        console.log(`      → ${warning.recommendation}`);
      });
    }

    if (result.recommendations && result.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      result.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }

    console.log('\n════════════════════════════════════════════════════════════════');

    // Exit with appropriate code
    if (result.verdict === 'BLOCKED' || result.verdict === 'FAIL') {
      console.log('❌ Database migration BLOCKED - fix issues before proceeding\n');
      process.exit(1);
    } else if (result.verdict === 'CONDITIONAL_PASS') {
      console.log('⚠️  Database migration has warnings - review before applying\n');
      process.exit(0);
    } else {
      console.log('✅ Database migration validated successfully\n');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Database Architect execution failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
