/**
 * Testing Sub-Agent - Flaky Test Detector
 * Detect common patterns that cause flaky tests
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { FLAKY_PATTERNS } from './config.js';
import { findTestFiles } from './file-discovery.js';

/**
 * Detect flaky tests by scanning for common anti-patterns
 * @param {string} basePath - Project base path
 * @param {Function} addFinding - Function to add findings
 */
export async function detectFlakyTests(basePath, addFinding) {
  // Look for common flaky test patterns
  const testFiles = await findTestFiles(basePath);

  for (const testFile of testFiles.slice(0, 10)) { // Check sample
    try {
      const content = await fs.readFile(testFile, 'utf8');
      const relativePath = path.relative(basePath, testFile);

      for (const { pattern, issue } of FLAKY_PATTERNS) {
        const matches = content.match(pattern);
        if (matches && matches.length > 0) {
          addFinding({
            type: 'FLAKY_TEST_PATTERN',
            severity: 'medium',
            confidence: 0.8,
            file: relativePath,
            description: `Potential flaky test: ${issue}`,
            recommendation: 'Fix test to be deterministic',
            metadata: {
              pattern: pattern.source,
              occurrences: matches.length
            }
          });
        }
      }
    } catch {
      // File read error
    }
  }
}
