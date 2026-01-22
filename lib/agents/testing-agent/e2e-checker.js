/**
 * Testing Sub-Agent - E2E Checker
 * Check for end-to-end test coverage
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { E2E_DIRS, FRONTEND_FRAMEWORKS } from './config.js';
import { findTestFiles } from './file-discovery.js';

/**
 * Check for E2E tests
 * @param {string} basePath - Project base path
 * @param {Function} addFinding - Function to add findings
 */
export async function checkE2ETests(basePath, addFinding) {
  let hasE2E = false;

  for (const dir of E2E_DIRS) {
    try {
      await fs.access(path.join(basePath, dir));
      hasE2E = true;

      // Count E2E tests
      const e2eFiles = await findTestFiles(path.join(basePath, dir));

      if (e2eFiles.length === 0) {
        addFinding({
          type: 'EMPTY_E2E_DIRECTORY',
          severity: 'medium',
          confidence: 0.9,
          file: dir,
          description: 'E2E test directory exists but contains no tests',
          recommendation: 'Add end-to-end tests for critical user flows',
          metadata: {
            directory: dir
          }
        });
      }

      break;
    } catch {
      // Directory doesn't exist
    }
  }

  // Check if project needs E2E but doesn't have it
  if (!hasE2E) {
    const needsE2E = await projectNeedsE2E(basePath);

    if (needsE2E) {
      addFinding({
        type: 'MISSING_E2E_TESTS',
        severity: 'high',
        confidence: 0.85,
        file: 'e2e',
        description: 'No end-to-end tests found',
        recommendation: 'Add E2E tests using Playwright or Cypress',
        metadata: {
          suggestion: 'Critical user journeys should be tested end-to-end'
        }
      });
    }
  }
}

/**
 * Detect if project needs E2E tests based on dependencies
 * @param {string} basePath - Project base path
 * @returns {Promise<boolean>} True if project likely needs E2E tests
 */
export async function projectNeedsE2E(basePath) {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    return FRONTEND_FRAMEWORKS.some(fw => fw in deps);
  } catch {
    return false;
  }
}
