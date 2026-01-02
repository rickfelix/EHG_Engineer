#!/usr/bin/env node

/**
 * Gate Q: Quality Gate Verification
 * SD-QUALITY-GATE-001
 *
 * Validates quality gate with 35/25/20/20 weighting:
 * - hasTestEvidence: Test coverage evidence exists (35%)
 * - hasDiffMinimality: Minimal code changes (25%)
 * - hasRollbackSafety: Migration rollback capability (20%)
 * - hasMigrationCorrectness: Valid migration syntax (20%)
 */

import { exit } from 'node:process';
import { getDb } from './lib/db.js';
import { scoreGate, formatGateResults, gatePass, getThreshold, Check } from './lib/score.js';
import { getRulesForGate, getPRDDetails, storeGateReview } from './lib/rules.js';
import { checkTestEvidence } from './lib/check-test-evidence.js';
import { checkDiffMinimality } from './lib/check-diff.js';
import { checkRollbackSafety } from './lib/check-rollback.js';
import { checkMigrationCorrectness } from './lib/check-migration.js';

(async () => {
  const prdId = process.env.PRD_ID;
  if (!prdId) {
    console.error('❌ PRD_ID environment variable is required');
    exit(2);
  }

  // Validate PRD_ID format (security: prevent command injection)
  const PRD_ID_REGEX = /^PRD-[A-Z0-9-]+$/;
  if (!PRD_ID_REGEX.test(prdId)) {
    console.error('❌ Invalid PRD_ID format');
    exit(2);
  }

  console.log('🔍 Running Gate Q: Quality Gate Verification');
  console.log(`PRD: ${prdId}`);
  console.log('');
  console.log('Weight Distribution:');
  console.log('  - Test Evidence: 35%');
  console.log('  - Diff Minimality: 25%');
  console.log('  - Rollback Safety: 20%');
  console.log('  - Migration Correctness: 20%');
  console.log('');

  // Get PRD details
  const prdDetails = await getPRDDetails(prdId);
  if (!prdDetails) {
    console.error(`❌ PRD ${prdId} not found in database`);
    exit(2);
  }

  console.log(`Title: ${prdDetails.title}`);
  console.log(`SD: ${prdDetails.sd_id || 'None'}`);
  console.log(`SD Type: ${prdDetails.sd_type} (threshold: ${getThreshold(prdDetails.sd_type)}%)`);
  console.log('');

  // Extract SD ID from PRD ID if available
  const sdId = prdDetails.sd_id || prdId.replace('PRD-', '');

  // Initialize database connection (used by getRulesForGate and storeGateReview)
  await getDb();
  const rules = await getRulesForGate('Q');

  // Define checks for each rule
  const checks: Record<string, Check> = {
    async hasTestEvidence() {
      console.log('  Running test evidence check (35%)...');

      const result = checkTestEvidence(process.cwd(), sdId);

      if (result.passed) {
        console.log('  ✅ Test evidence found');
        result.evidenceFound.forEach(e => {
          console.log(`     [${e.type}] ${e.description}`);
        });
      } else {
        console.log('  ❌ No test evidence found');
        console.log('     Run tests to generate evidence:');
        console.log('     - npm run test:unit');
        console.log('     - npm run test:e2e');
      }

      return result.passed;
    },

    async hasDiffMinimality() {
      console.log('  Running diff minimality check (25%)...');

      // Get thresholds from rule criteria if available
      const rule = rules.find(r => r.rule_name === 'hasDiffMinimality');
      const thresholds = rule?.criteria?.thresholds || { max_files: 10, max_lines: 400 };

      const result = checkDiffMinimality(
        'main',
        thresholds.max_files,
        thresholds.max_lines
      );

      if (result.passed) {
        console.log('  ✅ Diff minimality passed');
        console.log(`     Files: ${result.filesChanged}/${thresholds.max_files}`);
        console.log(`     Lines: ${result.linesChanged}/${thresholds.max_lines}`);
      } else {
        console.log('  ⚠️  Diff minimality advisory:');
        console.log(`     Files: ${result.filesChanged}/${thresholds.max_files}`);
        console.log(`     Lines: ${result.linesChanged}/${thresholds.max_lines}`);
      }

      return result.passed;
    },

    async hasRollbackSafety() {
      console.log('  Running rollback safety check (20%)...');

      const result = checkRollbackSafety(process.cwd());

      if (result.passed) {
        if (result.migrationsFound === 0) {
          console.log('  ✅ No migrations - rollback not required');
        } else {
          console.log(`  ✅ Rollback coverage: ${result.migrationsWithRollback}/${result.migrationsFound}`);
        }
      } else {
        console.log('  ⚠️  Rollback safety advisory:');
        console.log(`     Migrations without rollback: ${result.migrationsWithoutRollback.length}`);
        result.migrationsWithoutRollback.forEach(m => {
          console.log(`     - ${m}`);
        });
      }

      return result.passed;
    },

    async hasMigrationCorrectness() {
      console.log('  Running migration correctness check (20%)...');

      const result = checkMigrationCorrectness(process.cwd());

      if (result.passed) {
        if (result.migrationsChecked === 0) {
          console.log('  ✅ No migrations to check');
        } else {
          console.log(`  ✅ Migration correctness: ${result.validMigrations}/${result.migrationsChecked} valid`);
        }
      } else {
        console.log('  ⚠️  Migration correctness issues:');
        result.issues.forEach(issue => {
          const icon = issue.severity === 'error' ? '✗' : '⚠';
          console.log(`     ${icon} [${issue.type}] ${issue.file}: ${issue.message}`);
        });
      }

      return result.passed;
    },
  };

  console.log('\n📋 Executing checks...\n');

  // Score the gate
  const { score, results } = await scoreGate(rules, checks);

  // Format and display results
  console.log(formatGateResults('Q', { score, results }));

  // Store review in database
  await storeGateReview(prdId, 'Q', score, results);

  // Exit with appropriate code (using SD type-aware threshold)
  const threshold = getThreshold(prdDetails.sd_type);
  if (!gatePass(score, prdDetails.sd_type)) {
    console.log(`\n❌ Gate Q failed: ${score}% < ${threshold}%`);
    console.log('');
    console.log('To improve score:');
    if (!results['hasTestEvidence']) {
      console.log('  1. Run tests to generate evidence (+35%)');
    }
    if (!results['hasDiffMinimality']) {
      console.log('  2. Reduce code changes to ≤10 files, ≤400 lines (+25%)');
    }
    if (!results['hasRollbackSafety']) {
      console.log('  3. Add rollback scripts for migrations (+20%)');
    }
    if (!results['hasMigrationCorrectness']) {
      console.log('  4. Fix migration naming/syntax issues (+20%)');
    }
    exit(1);
  } else {
    console.log(`\n✅ Gate Q passed: ${score}% >= ${threshold}%`);
    exit(0);
  }
})().catch((error) => {
  console.error('❌ Gate runner failed:', error);
  exit(2);
});
