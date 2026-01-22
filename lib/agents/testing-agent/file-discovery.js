/**
 * Testing Sub-Agent - File Discovery
 * Find test and source files in the project
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { TEST_PATTERNS, SOURCE_DIRS } from './config.js';

/**
 * Find test files in the project
 * @param {string} basePath - Project base path
 * @returns {Promise<string[]>} Array of test file paths
 */
export async function findTestFiles(basePath) {
  const testFiles = [];

  async function scan(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          // Check if it's a test file
          const isTest = TEST_PATTERNS.some(pattern =>
            entry.name.includes(pattern) || fullPath.includes(pattern)
          );

          if (isTest && (entry.name.endsWith('.js') || entry.name.endsWith('.ts') ||
                        entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx'))) {
            testFiles.push(fullPath);
          }
        }
      }
    } catch {
      // Directory access error
    }
  }

  await scan(basePath);
  return testFiles;
}

/**
 * Find source files in the project
 * @param {string} basePath - Project base path
 * @returns {Promise<string[]>} Array of source file paths
 */
export async function findSourceFiles(basePath) {
  const sourceFiles = [];

  for (const dir of SOURCE_DIRS) {
    const fullPath = path.join(basePath, dir);

    async function scan(scanDir) {
      try {
        const entries = await fs.readdir(scanDir, { withFileTypes: true });

        for (const entry of entries) {
          const entryPath = path.join(scanDir, entry.name);

          if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue;
          }

          if (entry.isDirectory()) {
            await scan(entryPath);
          } else if (entry.isFile() &&
                    (entry.name.endsWith('.js') || entry.name.endsWith('.ts') ||
                     entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx')) &&
                    !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
            sourceFiles.push(entryPath);
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    await scan(fullPath);
  }

  return sourceFiles;
}

/**
 * Find untested files and report findings
 * @param {string} basePath - Project base path
 * @param {Object} testHealth - Test health state object
 * @param {number} testRatio - Required test ratio threshold
 * @param {Function} addFinding - Function to add findings
 */
export async function findUntestedFiles(basePath, testHealth, testRatio, addFinding) {
  const sourceFiles = await findSourceFiles(basePath);
  const testFiles = await findTestFiles(basePath);

  // Create a map of tested files
  const testedFiles = new Set();

  for (const testFile of testFiles) {
    // Extract what file is being tested
    const testName = path.basename(testFile);
    const sourceFileName = testName
      .replace('.test.', '.')
      .replace('.spec.', '.')
      .replace('.test', '')
      .replace('.spec', '');

    testedFiles.add(sourceFileName);

    // Also check imports in test file
    try {
      const content = await fs.readFile(testFile, 'utf8');
      const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
      imports.forEach(imp => {
        const file = imp.match(/from\s+['"]([^'"]+)['"]/)[1];
        if (file.startsWith('.')) {
          testedFiles.add(path.basename(file));
        }
      });
    } catch {
      // Ignore read errors
    }
  }

  // Find untested files
  const untestedFiles = [];
  for (const sourceFile of sourceFiles) {
    const fileName = path.basename(sourceFile);

    // Skip index files and configs
    if (fileName === 'index.js' || fileName === 'index.ts' ||
        fileName.includes('.config.') || fileName.includes('.d.ts')) {
      continue;
    }

    if (!testedFiles.has(fileName) && !testedFiles.has(fileName.replace(/\.(js|ts)x?$/, ''))) {
      untestedFiles.push(sourceFile);
      testHealth.missingTests.push(sourceFile);
    }
  }

  if (untestedFiles.length > 0) {
    // Report most critical untested files
    const criticalUntested = untestedFiles.filter(file =>
      file.includes('auth') || file.includes('payment') ||
      file.includes('api') || file.includes('service')
    );

    if (criticalUntested.length > 0) {
      addFinding({
        type: 'CRITICAL_FILES_UNTESTED',
        severity: 'critical',
        confidence: 0.95,
        file: 'tests',
        description: `${criticalUntested.length} critical files have no tests`,
        recommendation: 'Add tests for critical business logic files',
        metadata: {
          files: criticalUntested.slice(0, 5).map(f => path.relative(basePath, f))
        }
      });
    }

    // General untested files
    const ratio = testFiles.length / sourceFiles.length;
    if (ratio < testRatio) {
      addFinding({
        type: 'LOW_TEST_RATIO',
        severity: 'high',
        confidence: 0.9,
        file: 'tests',
        description: `Only ${(ratio * 100).toFixed(1)}% of source files have tests`,
        recommendation: 'Increase test coverage for source files',
        metadata: {
          sourceFiles: sourceFiles.length,
          testFiles: testFiles.length,
          untested: untestedFiles.length
        }
      });
    }
  }
}
