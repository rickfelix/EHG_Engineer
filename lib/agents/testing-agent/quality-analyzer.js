/**
 * Testing Sub-Agent - Quality Analyzer
 * Analyze test quality (assertions, patterns, anti-patterns)
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { ASSERTION_PATTERNS } from './config.js';

/**
 * Analyze test quality for a single test file
 * @param {string} testFile - Path to test file
 * @param {string} basePath - Project base path
 * @param {number} assertionDensityThreshold - Minimum assertions per test
 * @param {Object} testHealth - Test health state object
 * @param {Function} addFinding - Function to add findings
 */
export async function analyzeTestQuality(testFile, basePath, assertionDensityThreshold, testHealth, addFinding) {
  try {
    const content = await fs.readFile(testFile, 'utf8');
    const relativePath = path.relative(basePath, testFile);

    // Count test cases
    const testMatches = content.match(/\b(it|test|describe)\s*\(/g) || [];
    const testCount = testMatches.length;

    // Count assertions
    let assertionCount = 0;
    for (const pattern of ASSERTION_PATTERNS) {
      const matches = content.match(pattern) || [];
      assertionCount += matches.length;
    }

    // Check assertion density
    if (testCount > 0) {
      const density = assertionCount / testCount;

      if (density < assertionDensityThreshold) {
        addFinding({
          type: 'LOW_ASSERTION_DENSITY',
          severity: 'medium',
          confidence: 0.8,
          file: relativePath,
          description: `Only ${density.toFixed(1)} assertions per test (recommended: ${assertionDensityThreshold}+)`,
          recommendation: 'Add more assertions to thoroughly test behavior',
          metadata: {
            tests: testCount,
            assertions: assertionCount,
            density: density.toFixed(1)
          }
        });
      }
    }

    // Check for skipped tests
    checkSkippedTests(content, relativePath, testHealth, addFinding);

    // Check for console.log in tests
    checkConsoleLogs(content, relativePath, addFinding);

    // Check for async tests without proper handling
    checkAsyncTests(content, relativePath, addFinding);

    // Check for test timeouts
    checkTestTimeouts(content, relativePath, addFinding);

  } catch {
    // File read error
  }
}

/**
 * Check for skipped tests
 */
function checkSkippedTests(content, relativePath, testHealth, addFinding) {
  const skippedTests = content.match(/\.(skip|only)\s*\(/g) || [];
  if (skippedTests.length > 0) {
    addFinding({
      type: 'SKIPPED_TESTS',
      severity: 'medium',
      confidence: 1.0,
      file: relativePath,
      description: `${skippedTests.length} skipped or focused tests found`,
      recommendation: 'Remove .skip() and .only() modifiers',
      metadata: {
        count: skippedTests.length
      }
    });
    testHealth.skippedTests += skippedTests.length;
  }
}

/**
 * Check for console.log in tests
 */
function checkConsoleLogs(content, relativePath, addFinding) {
  if (content.includes('console.log')) {
    addFinding({
      type: 'CONSOLE_LOG_IN_TESTS',
      severity: 'low',
      confidence: 0.9,
      file: relativePath,
      description: 'Console.log statements found in tests',
      recommendation: 'Remove console.log statements from tests',
      metadata: {
        count: (content.match(/console\.log/g) || []).length
      }
    });
  }
}

/**
 * Check for async tests without await
 */
function checkAsyncTests(content, relativePath, addFinding) {
  const asyncTests = content.match(/async\s+(?:function|\(\))/g) || [];
  const awaitStatements = content.match(/await\s+/g) || [];

  if (asyncTests.length > 0 && awaitStatements.length === 0) {
    addFinding({
      type: 'ASYNC_WITHOUT_AWAIT',
      severity: 'high',
      confidence: 0.85,
      file: relativePath,
      description: 'Async test functions without await statements',
      recommendation: 'Add await statements or remove async keyword',
      metadata: {
        asyncTests: asyncTests.length
      }
    });
  }
}

/**
 * Check for long test timeouts
 */
function checkTestTimeouts(content, relativePath, addFinding) {
  if (content.includes('timeout(') || content.includes('setTimeout')) {
    const timeoutMatch = content.match(/timeout\((\d+)\)/);
    if (timeoutMatch) {
      const timeout = parseInt(timeoutMatch[1]);
      if (timeout > 5000) {
        addFinding({
          type: 'LONG_TEST_TIMEOUT',
          severity: 'medium',
          confidence: 0.9,
          file: relativePath,
          description: `Test timeout set to ${timeout}ms (too long)`,
          recommendation: 'Optimize test to run faster or mock slow operations',
          metadata: {
            timeout
          }
        });
      }
    }
  }
}
