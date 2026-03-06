/**
 * Test Categorizer — Gap 1: Unit vs Integration Distinction
 *
 * Classifies test files as unit, integration, or e2e based on:
 * 1. Directory heuristic (high confidence): tests/unit/ → unit, tests/integration/ → integration
 * 2. Content heuristic (medium confidence): mock patterns → unit, real client patterns → integration
 *
 * Used by GATE_INTEGRATION_TEST_REQUIREMENT to detect when "integration" tests
 * are actually mocked unit tests.
 */

import { readFileSync } from 'fs';
import { relative } from 'path';

/**
 * Mock patterns that indicate a unit test (test doubles, no real I/O)
 */
const MOCK_PATTERNS = [
  /vi\.mock\s*\(/,
  /jest\.mock\s*\(/,
  /mockResolvedValue/,
  /mockReturnValue/,
  /mockImplementation/,
  /\.spyOn\s*\(/,
  /sinon\.(stub|mock|fake)\s*\(/
];

/**
 * Real client patterns that indicate an integration test (actual I/O)
 */
const REAL_CLIENT_PATTERNS = [
  /createClient\s*\(/,
  /new\s+Client\s*\(/,
  /fetch\s*\(/,
  /axios\.(get|post|put|delete|patch)\s*\(/,
  /\.connect\s*\(/,
  /supertest\s*\(/,
  /request\s*\(/,
  /http\.request\s*\(/
];

/**
 * @typedef {'unit'|'integration'|'e2e'|'unknown'} TestCategory
 * @typedef {'directory'|'content'|'mixed'} CategorySource
 *
 * @typedef {Object} CategorizedTest
 * @property {string} file - Relative file path
 * @property {TestCategory} category - Determined category
 * @property {CategorySource} source - How category was determined
 * @property {boolean} hasMocks - Whether file contains mock patterns
 * @property {boolean} hasRealClients - Whether file contains real client patterns
 */

/**
 * Categorize a single test file.
 *
 * @param {string} filePath - Absolute path to the test file
 * @param {string} repoRoot - Repository root for relative path calculation
 * @returns {CategorizedTest}
 */
export function categorizeTestFile(filePath, repoRoot) {
  const relPath = relative(repoRoot, filePath).replace(/\\/g, '/');

  // 1. Directory heuristic (high confidence)
  const dirCategory = getDirectoryCategory(relPath);

  // 2. Content heuristic
  let hasMocks = false;
  let hasRealClients = false;
  try {
    const content = readFileSync(filePath, 'utf8');
    hasMocks = MOCK_PATTERNS.some(p => p.test(content));
    hasRealClients = REAL_CLIENT_PATTERNS.some(p => p.test(content));
  } catch {
    // Can't read file — rely on directory heuristic only
  }

  // Determine final category
  if (dirCategory) {
    return {
      file: relPath,
      category: dirCategory,
      source: 'directory',
      hasMocks,
      hasRealClients
    };
  }

  // No directory signal — use content heuristics
  if (hasMocks && !hasRealClients) {
    return { file: relPath, category: 'unit', source: 'content', hasMocks, hasRealClients };
  }
  if (hasRealClients && !hasMocks) {
    return { file: relPath, category: 'integration', source: 'content', hasMocks, hasRealClients };
  }
  if (hasMocks && hasRealClients) {
    return { file: relPath, category: 'integration', source: 'mixed', hasMocks, hasRealClients };
  }

  return { file: relPath, category: 'unknown', source: 'content', hasMocks, hasRealClients };
}

/**
 * Determine category from directory path.
 * @param {string} relPath - Relative path with forward slashes
 * @returns {TestCategory|null}
 */
function getDirectoryCategory(relPath) {
  if (/\btests\/unit\b/.test(relPath) || /\b__tests__\/unit\b/.test(relPath)) return 'unit';
  if (/\btests\/integration\b/.test(relPath) || /\b__tests__\/integration\b/.test(relPath)) return 'integration';
  if (/\btests\/e2e\b/.test(relPath) || /\b__tests__\/e2e\b/.test(relPath)) return 'e2e';
  return null;
}

/**
 * Categorize multiple test files and return a summary.
 *
 * @param {string[]} filePaths - Absolute paths to test files
 * @param {string} repoRoot - Repository root
 * @returns {{ files: CategorizedTest[], summary: { mockOnlyIntegration: boolean, counts: Record<TestCategory, number> } }}
 */
export function categorizeTestFiles(filePaths, repoRoot) {
  const files = filePaths.map(fp => categorizeTestFile(fp, repoRoot));

  const counts = { unit: 0, integration: 0, e2e: 0, unknown: 0 };
  for (const f of files) {
    counts[f.category] = (counts[f.category] || 0) + 1;
  }

  // Key detection: files in tests/integration/ that are actually mocked unit tests
  const integrationFiles = files.filter(f => f.category === 'integration');
  const mockOnlyIntegration = integrationFiles.length > 0 &&
    integrationFiles.every(f => f.hasMocks && !f.hasRealClients);

  return {
    files,
    summary: {
      mockOnlyIntegration,
      counts,
      integrationFileCount: integrationFiles.length,
      mockOnlyCount: integrationFiles.filter(f => f.hasMocks && !f.hasRealClients).length
    }
  };
}
