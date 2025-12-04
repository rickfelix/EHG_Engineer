#!/usr/bin/env node

/**
 * Gate 1: Unit Test Integration
 * SD-VERIFY-LADDER-002
 *
 * Validates:
 * - hasUnitTestsExecuted: Jest tests run successfully (exit code 0)
 * - hasUnitTestsPassing: All tests pass (numFailedTests === 0)
 * - hasCoverageThreshold: Line coverage >= 50%
 */

import { exit } from 'node:process';
import { execSync } from 'node:child_process';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '../../.env') });
import { existsSync, readFileSync } from 'node:fs';
import { getDb } from './lib/db.js';
import { scoreGate, formatGateResults, Check } from './lib/score.js';
import { getRulesForGate, getPRDDetails, storeGateReview } from './lib/rules.js';

// Cache Jest results to avoid running twice
let jestResultsCache: { success: boolean; output: string; json?: any } | null = null;

/**
 * Run Jest and cache results
 */
function runJest(): { success: boolean; output: string; json?: any } {
  if (jestResultsCache) return jestResultsCache;

  try {
    // Run Jest with JSON output (security: hardcoded command, no interpolation)
    const output = execSync('npx jest --json --coverage --coverageReporters=json-summary', {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 120000, // 120s timeout per PRD
    });

    // Parse JSON output
    let json;
    try {
      json = JSON.parse(output);
    } catch {
      // JSON parsing failed but Jest ran successfully
    }

    jestResultsCache = { success: true, output, json };
    return jestResultsCache;
  } catch (error: any) {
    // Jest failed - try to extract output and parse JSON
    const output = error.stdout || error.stderr || '';
    let json;
    try {
      json = JSON.parse(output);
    } catch {
      // JSON parsing failed
    }

    jestResultsCache = { success: false, output, json };
    return jestResultsCache;
  }
}

(async () => {
  const prdId = process.env.PRD_ID;
  if (!prdId) {
    console.error('Error: PRD_ID environment variable is required');
    exit(2);
  }

  // Validate PRD_ID format (security: prevent command injection)
  const UUID_REGEX = /^PRD-[A-Z0-9-]+$/;
  if (!UUID_REGEX.test(prdId)) {
    console.error('Error: Invalid PRD_ID format');
    exit(2);
  }

  console.log('Running Gate 1: Unit Test Integration');
  console.log(`PRD: ${prdId}`);

  // Get PRD details
  const prdDetails = await getPRDDetails(prdId);
  if (!prdDetails) {
    console.error(`Error: PRD ${prdId} not found in database`);
    exit(2);
  }

  console.log(`Title: ${prdDetails.title}`);
  console.log(`SD: ${prdDetails.sd_id || 'None'}`);
  console.log('');

  const db = await getDb();
  const rules = await getRulesForGate('1');

  // Define checks for each rule
  const checks: Record<string, Check> = {
    async hasUnitTestsExecuted() {
      console.log('  Running Jest unit tests...');

      const result = runJest();

      if (result.success || result.json) {
        // Jest ran (even if tests failed, it still executed)
        console.log('  [PASS] Jest executed successfully');
        return true;
      } else {
        console.log('  [FAIL] Jest execution failed (could not run tests)');
        return false;
      }
    },

    async hasUnitTestsPassing() {
      console.log('  Checking test pass rate...');

      const result = runJest();

      if (!result.json) {
        console.log('  [FAIL] Could not parse Jest results');
        return false;
      }

      const { numFailedTests, numPassedTests, numTotalTests } = result.json;

      if (numFailedTests === 0) {
        console.log(`  [PASS] All ${numTotalTests} tests passed`);
        return true;
      } else {
        console.log(`  [FAIL] ${numFailedTests}/${numTotalTests} tests failed`);
        return false;
      }
    },

    async hasCoverageThreshold() {
      console.log('  Checking code coverage...');

      // Try to read coverage summary
      const coveragePath = 'coverage/coverage-summary.json';

      if (!existsSync(coveragePath)) {
        console.log('  [WARN] Coverage file not found, running Jest with coverage...');
        runJest(); // Ensure Jest ran with coverage
      }

      try {
        const coverageData = JSON.parse(readFileSync(coveragePath, 'utf8'));
        const lineCoverage = coverageData?.total?.lines?.pct ?? 0;
        const threshold = 50; // 50% minimum per PRD

        if (lineCoverage >= threshold) {
          console.log(`  [PASS] Line coverage ${lineCoverage.toFixed(1)}% >= ${threshold}%`);
          return true;
        } else {
          console.log(`  [FAIL] Line coverage ${lineCoverage.toFixed(1)}% < ${threshold}%`);
          return false;
        }
      } catch (error) {
        console.log('  [FAIL] Could not read coverage data');
        return false;
      }
    },
  };

  // Score the gate
  const { score, results } = await scoreGate(rules, checks);

  // Format and display results
  console.log(formatGateResults('1', { score, results }));

  // Store review in database
  await storeGateReview(prdId, '1', score, results);

  // Exit with appropriate code
  if (score < 85) {
    console.log(`\nGate 1 failed: ${score}% < 85%`);
    exit(1);
  } else {
    console.log(`\nGate 1 passed: ${score}%`);
    exit(0);
  }
})().catch((error) => {
  console.error('Gate runner failed:', error);
  exit(2);
});
