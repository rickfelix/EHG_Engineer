#!/usr/bin/env node

/**
 * Gate 0: Static Analysis Verification
 * SD-VERIFY-LADDER-001
 *
 * Validates:
 * - hasESLintPass: ESLint validation with zero errors
 * - hasTypeScriptPass: TypeScript compilation with zero type errors
 * - hasImportsPass: All imports resolve successfully
 */

import { exit } from 'node:process';
import { execSync } from 'node:child_process';
import { getDb } from './lib/db.js';
import { scoreGate, formatGateResults, gatePass, getThreshold, Check } from './lib/score.js';
import { getRulesForGate, getPRDDetails, storeGateReview } from './lib/rules.js';

(async () => {
  const prdId = process.env.PRD_ID;
  if (!prdId) {
    console.error('❌ PRD_ID environment variable is required');
    exit(2);
  }

  // Validate PRD_ID format (security: prevent command injection)
  const UUID_REGEX = /^PRD-[A-Z0-9-]+$/;
  if (!UUID_REGEX.test(prdId)) {
    console.error('❌ Invalid PRD_ID format');
    exit(2);
  }

  console.log('🔍 Running Gate 0: Static Analysis Verification');
  console.log(`PRD: ${prdId}`);

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

  const _db = await getDb(); // Used to verify connection
  void _db;
  const rules = await getRulesForGate('0');

  // Define checks for each rule
  const checks: Record<string, Check> = {
    async hasESLintPass() {
      console.log('  Running ESLint validation...');

      try {
        // Run ESLint with hardcoded command (security: no interpolation)
        execSync('npx eslint .', {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 30000 // 30s timeout
        });

        // ESLint exits with 0 if no errors
        console.log('  ✅ ESLint validation passed (zero errors)');
        return true;
      } catch (error: unknown) {
        // ESLint exits with 1 if errors found
        const execError = error as { stdout?: string };
        const errorOutput = execError.stdout || '';
        const errorMatch = errorOutput.match(/(\d+)\s+error/);
        const errorCount = errorMatch ? parseInt(errorMatch[1]) : 0;

        console.log(`  ❌ ESLint validation failed: ${errorCount} error(s)`);
        return false;
      }
    },

    async hasTypeScriptPass() {
      console.log('  Running TypeScript compilation check...');

      try {
        // Run tsc with hardcoded command (security: no interpolation)
        execSync('npx tsc --noEmit', {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 30000 // 30s timeout
        });

        console.log('  ✅ TypeScript compilation succeeded (zero type errors)');
        return true;
      } catch (error: unknown) {
        // tsc exits with non-zero if errors found
        const execError = error as { stdout?: string };
        const tscOutput = execError.stdout || '';
        const errorMatch = tscOutput.match(/Found (\d+) error/);
        const errorCount = errorMatch ? parseInt(errorMatch[1]) : 0;

        console.log(`  ❌ TypeScript compilation failed: ${errorCount} type error(s)`);
        return false;
      }
    },

    async hasImportsPass() {
      console.log('  Running import resolution check...');

      try {
        // Run import checker with hardcoded command (security: no interpolation)
        execSync('node tools/gates/lib/check-imports.js', {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 10000 // 10s timeout
        });

        console.log('  ✅ All imports resolved successfully');
        return true;
      } catch (error: unknown) {
        // Import checker exits with 1 if unresolved imports found
        const execError = error as { stdout?: string };
        const importOutput = execError.stdout || '';
        console.log('  ⚠️  Import resolution check failed (non-blocking)');
        console.log(`  ${importOutput.split('\n').slice(0, 3).join('\n  ')}`);
        return false;
      }
    },
  };

  // Score the gate
  const { score, results } = await scoreGate(rules, checks);

  // Format and display results (with SD type for threshold)
  console.log(formatGateResults('0', { score, results }, prdDetails.sd_type));

  // Store review in database
  await storeGateReview(prdId, '0', score, results);

  // Exit with appropriate code (using SD type-aware threshold)
  const threshold = getThreshold(prdDetails.sd_type);
  if (!gatePass(score, prdDetails.sd_type)) {
    console.log(`\n❌ Gate 0 failed: ${score}% < ${threshold}%`);
    exit(1);
  } else {
    console.log(`\n✅ Gate 0 passed: ${score}% >= ${threshold}%`);
    exit(0);
  }
})().catch((error) => {
  console.error('❌ Gate runner failed:', error);
  exit(2);
});
