/**
 * File Utilities Domain
 * File and branch-aware utilities for test intelligence
 *
 * @module test-intelligence/file-utils
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get filename from test file (handles both string and object formats)
 * @param {string|Object} testFile - Test file path or object
 * @returns {string} Filename
 */
export function getTestFileName(testFile) {
  if (typeof testFile === 'object') {
    return testFile.filename || path.basename(testFile.path);
  }
  return path.basename(testFile);
}

/**
 * Get file path from test file (handles both string and object formats)
 * @param {string|Object} testFile - Test file path or object
 * @returns {string} File path
 */
export function getTestFilePath(testFile) {
  if (typeof testFile === 'object') {
    return testFile.path;
  }
  return testFile;
}

/**
 * Find test files for an SD - branch-aware for LEO protocol compliance
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Options including branch context
 * @returns {Promise<Array>} List of test file info objects
 */
export async function findTestFiles(sdId, options = {}) {
  const repoPath = options.repoPath || path.resolve(__dirname, '../../../../../ehg');
  const branch = options.branch || options.featureBranch;
  const testDir = options.testDir || 'tests/e2e';

  // Patterns to search for (order of preference)
  const searchPatterns = [
    sdId.toLowerCase().replace('sd-', '').replace(/-/g, '-'),
    sdId.toLowerCase(),
    ...(options.semanticPatterns || [])
  ];

  // If we have branch context, use git to read from the branch
  if (branch) {
    console.log(`   🌿 Using branch-aware scanning: ${branch}`);
    return findTestFilesFromBranch(repoPath, branch, testDir, searchPatterns);
  }

  // Fallback to filesystem
  console.log('   ⚠️  No branch context - falling back to filesystem scan');
  const fullTestDir = path.join(repoPath, testDir);

  try {
    const files = await fs.readdir(fullTestDir);
    const matches = files.filter(f => {
      const fLower = f.toLowerCase();
      return searchPatterns.some(p => fLower.includes(p)) && f.endsWith('.spec.ts');
    });
    return matches.map(f => ({
      path: path.join(fullTestDir, f),
      filename: f,
      source: 'filesystem'
    }));
  } catch (error) {
    console.warn(`   ⚠️  Could not read test directory: ${error.message}`);
    return [];
  }
}

/**
 * Find test files from a specific git branch without checking it out
 * @param {string} repoPath - Repository path
 * @param {string} branch - Branch name
 * @param {string} testDir - Test directory
 * @param {Array} searchPatterns - Patterns to search for
 * @returns {Array} List of test file objects
 */
export function findTestFilesFromBranch(repoPath, branch, testDir, searchPatterns) {
  const results = [];

  try {
    // List all test files on the branch
    const allTests = execSync(
      `cd "${repoPath}" && git ls-tree -r --name-only "${branch}" -- "${testDir}" 2>/dev/null || true`,
      { encoding: 'utf-8' }
    ).trim();

    if (!allTests) {
      console.log(`   ⚠️  No test directory found on branch: ${testDir}`);
      return results;
    }

    const testFiles = allTests.split('\n').filter(f => f && f.endsWith('.spec.ts'));

    console.log(`   📁 Found ${testFiles.length} total test files on branch`);

    // Try to find exact pattern matches
    for (const pattern of searchPatterns) {
      const matches = testFiles.filter(f => f.toLowerCase().includes(pattern));
      if (matches.length > 0) {
        console.log(`   ✅ Pattern "${pattern}" matched ${matches.length} file(s)`);
        for (const match of matches) {
          if (!results.some(r => r.path === match)) {
            results.push({
              path: match,
              filename: path.basename(match),
              source: 'branch',
              branch,
              pattern
            });
          }
        }
      }
    }

    if (results.length === 0 && searchPatterns.length > 0) {
      console.log('   ℹ️  No pattern matches, will use e2e_test_path from user stories if available');
    }

  } catch (error) {
    console.warn(`   ⚠️  Error reading from branch: ${error.message}`);
  }

  return results;
}

/**
 * Read file content from a branch
 * @param {string} repoPath - Repository path
 * @param {string} branch - Branch name
 * @param {string} filePath - File path
 * @returns {string|null} File content or null
 */
export function readFileFromBranch(repoPath, branch, filePath) {
  try {
    return execSync(
      `cd "${repoPath}" && git show "${branch}:${filePath}" 2>/dev/null`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
  } catch {
    return null;
  }
}

/**
 * Check if a component exists at any of the possible paths
 * @param {Object} componentRef - Component reference
 * @returns {Promise<boolean>} Whether component exists
 */
export async function checkComponentExists(componentRef) {
  const ehgPath = path.resolve(__dirname, '../../../../../ehg');
  const possiblePaths = [
    path.join(ehgPath, `src/components/${componentRef.name}.tsx`),
    path.join(ehgPath, `src/components/stages/${componentRef.name}.tsx`),
    path.join(ehgPath, `src/components/ui/${componentRef.name}.tsx`)
  ];

  for (const checkPath of possiblePaths) {
    try {
      await fs.access(checkPath);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

/**
 * Find all components in the project
 * @returns {Promise<Array>} List of components
 */
export async function findAllComponents() {
  // Simplified - would recursively scan component directories
  return [];
}

/**
 * Check if a component has a corresponding test file
 * @param {Object} component - Component object
 * @param {Array} testFiles - List of test files
 * @returns {boolean} Whether component has test
 */
export function checkComponentHasTest(component, testFiles) {
  const componentName = component.name.toLowerCase();
  return testFiles.some(testFile =>
    path.basename(typeof testFile === 'object' ? testFile.path : testFile).toLowerCase().includes(componentName)
  );
}

/**
 * Check if a component is testable
 * @param {Object} component - Component object
 * @returns {boolean} Whether component is testable
 */
export function isTestableComponent(component) {
  return component.name.match(/^(Stage|Page|Dialog|Form|Button)/);
}

export default {
  getTestFileName,
  getTestFilePath,
  findTestFiles,
  findTestFilesFromBranch,
  readFileFromBranch,
  checkComponentExists,
  findAllComponents,
  checkComponentHasTest,
  isTestableComponent
};
