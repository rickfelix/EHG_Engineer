/**
 * Testing Sub-Agent - Coverage Analyzer
 * Analyze test coverage reports
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { THRESHOLDS } from './config.js';

/**
 * Analyze test coverage - SAFE MODE (no automatic command execution)
 * @param {string} basePath - Project base path
 * @param {string} framework - Test framework name
 * @param {Object} testHealth - Test health state object
 * @param {Function} addFinding - Function to add findings
 */
export async function analyzeCoverage(basePath, framework, testHealth, addFinding) {
  try {
    // SAFETY: Only read existing coverage data, never execute commands
    let coverageData = null;

    // Check if coverage already exists
    const coverageFile = path.join(basePath, 'coverage', 'coverage-summary.json');
    try {
      coverageData = JSON.parse(await fs.readFile(coverageFile, 'utf8'));
      console.log('   Found existing coverage report');
    } catch {
      // Recommend running coverage instead of auto-executing
      console.log('   No existing coverage found - recommend running: npm test -- --coverage');
      addFinding({
        type: 'NO_COVERAGE_REPORT',
        severity: 'medium',
        confidence: 1.0,
        file: 'coverage',
        description: 'No coverage report found',
        recommendation: `Run coverage manually: npm test -- --coverage${framework === 'jest' ? ' --coverageReporters=json-summary' : ''}`,
        metadata: {
          framework,
          command: `npm test -- --coverage${framework === 'jest' ? ' --coverageReporters=json-summary' : ''}`
        }
      });
    }

    if (coverageData && coverageData.total) {
      testHealth.coverage = coverageData.total;

      // Check coverage thresholds
      for (const [metric, threshold] of Object.entries(THRESHOLDS.coverage)) {
        const value = coverageData.total[metric]?.pct || 0;

        if (value < threshold) {
          addFinding({
            type: 'LOW_TEST_COVERAGE',
            severity: value < threshold * 0.5 ? 'high' : 'medium',
            confidence: 1.0,
            file: 'coverage',
            description: `${metric} coverage is ${value.toFixed(1)}% (threshold: ${threshold}%)`,
            recommendation: `Increase ${metric} coverage to at least ${threshold}%`,
            metadata: {
              metric,
              current: value,
              threshold,
              gap: threshold - value
            }
          });
        }
      }

      console.log(`   Coverage: ${coverageData.total.lines.pct.toFixed(1)}% lines`);
    } else {
      addFinding({
        type: 'NO_COVERAGE_DATA',
        severity: 'high',
        confidence: 0.9,
        file: 'coverage',
        description: 'No test coverage data available',
        recommendation: 'Run tests with coverage enabled',
        metadata: {
          command: 'npm test -- --coverage'
        }
      });
    }
  } catch (error) {
    console.log('   Coverage analysis failed:', error.message);
  }
}
