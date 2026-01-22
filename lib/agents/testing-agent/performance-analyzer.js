/**
 * Testing Sub-Agent - Performance Analyzer
 * Analyze test performance and configuration
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

/**
 * Analyze test performance
 * @param {string} basePath - Project base path
 * @param {string} framework - Test framework name
 * @param {Function} addFinding - Function to add findings
 */
export async function analyzeTestPerformance(basePath, framework, addFinding) {
  // Check if tests are too slow
  try {
    // Look for test timing information
    const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));

    if (pkg.scripts?.test) {
      console.log('   Checking test performance...');

      // SAFETY: Don't execute test commands automatically
      // Just analyze script complexity and provide recommendations
      const testScript = pkg.scripts.test;

      if (testScript.includes('--watchAll') || testScript.includes('--watch')) {
        addFinding({
          type: 'TEST_WATCH_MODE_IN_SCRIPT',
          severity: 'low',
          confidence: 0.8,
          file: 'package.json',
          description: 'Test script includes watch mode which may slow CI',
          recommendation: 'Use separate test:watch script for development',
          metadata: {
            testScript
          }
        });
      }

      // Check for performance recommendations
      addFinding({
        type: 'TEST_PERFORMANCE_RECOMMENDATION',
        severity: 'info',
        confidence: 1.0,
        file: 'tests',
        description: 'For performance analysis, run tests with timing: npm test -- --verbose',
        recommendation: 'Monitor test execution time and optimize slow tests',
        metadata: {
          framework,
          command: 'npm test -- --verbose'
        }
      });
    }
  } catch {
    // Package.json error
  }
}
