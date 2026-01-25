/**
 * Test Parser Library
 * SD-TEST-MGMT-SCANNER-001
 *
 * Parses test files to extract test cases, describe blocks, and metadata.
 * Supports Vitest, Jest, and Playwright test formats.
 */

import fs from 'fs';
import path from 'path';

/**
 * Parse a test file and extract test cases
 * @param {string} filePath - Path to the test file
 * @returns {Object} Parsed test data
 */
export function parseTestFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath);
  const basename = path.basename(filePath);

  // Determine test framework based on file patterns
  const isPlaywright = basename.includes('.spec.') || content.includes('@playwright/test');
  const isVitest = content.includes('vitest') || content.includes('vi.mock');

  const testCases = [];
  const describes = [];

  // Parse describe blocks
  const describeRegex = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = describeRegex.exec(content)) !== null) {
    describes.push({
      name: match[1],
      position: match.index
    });
  }

  // Parse test/it blocks
  const testRegex = /(?:test|it)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((match = testRegex.exec(content)) !== null) {
    const testName = match[1];
    const position = match.index;

    // Find parent describe block
    const parentDescribe = describes
      .filter(d => d.position < position)
      .sort((a, b) => b.position - a.position)[0];

    // Detect test type from patterns
    const testType = detectTestType(content, testName);

    // Check for common patterns
    const isAsync = hasAsyncPattern(content, position);
    const hasTimeout = /timeout:\s*\d+/.test(content.slice(position, position + 500));

    testCases.push({
      name: testName,
      fullName: parentDescribe ? `${parentDescribe.name} > ${testName}` : testName,
      parentDescribe: parentDescribe?.name || null,
      testType,
      isAsync,
      hasTimeout,
      position
    });
  }

  // Extract imports to detect dependencies
  const imports = extractImports(content);

  return {
    filePath,
    fileName: basename,
    framework: isPlaywright ? 'playwright' : isVitest ? 'vitest' : 'jest',
    language: ext === '.ts' || ext === '.tsx' ? 'typescript' : 'javascript',
    testCount: testCases.length,
    describeCount: describes.length,
    describes: describes.map(d => d.name),
    testCases,
    imports,
    hasFixtures: content.includes('test.extend') || content.includes('beforeEach'),
    hasSetup: /beforeAll|beforeEach/.test(content),
    hasTeardown: /afterAll|afterEach/.test(content),
    lineCount: content.split('\n').length
  };
}

/**
 * Detect test type from content patterns
 * @param {string} content - File content
 * @param {string} testName - Test name
 * @returns {string} Test type
 */
function detectTestType(content, testName) {
  const lowerContent = content.toLowerCase();
  const lowerName = testName.toLowerCase();

  if (lowerContent.includes('page.') || lowerContent.includes('expect(page')) {
    return 'e2e';
  }
  if (lowerContent.includes('accessibility') || lowerContent.includes('wcag') || lowerContent.includes('axe')) {
    return 'accessibility';
  }
  if (lowerContent.includes('performance') || lowerContent.includes('lighthouse')) {
    return 'performance';
  }
  if (lowerContent.includes('security') || lowerName.includes('xss') || lowerName.includes('csrf')) {
    return 'security';
  }
  if (lowerContent.includes('mock') || lowerContent.includes('stub') || lowerContent.includes('spy')) {
    return 'unit';
  }
  if (lowerContent.includes('supabase') || lowerContent.includes('database')) {
    return 'integration';
  }

  return 'functional';
}

/**
 * Check if test is async
 * @param {string} content - File content
 * @param {number} position - Test position
 * @returns {boolean}
 */
function hasAsyncPattern(content, position) {
  const slice = content.slice(position, position + 200);
  return /async\s*\(/.test(slice) || /await\s+/.test(slice);
}

/**
 * Extract imports from file
 * @param {string} content - File content
 * @returns {string[]} List of imported modules
 */
function extractImports(content) {
  const imports = [];
  const importRegex = /import\s+.*?from\s+['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

/**
 * Parse multiple test files
 * @param {string[]} filePaths - Array of file paths
 * @returns {Object[]} Array of parsed test data
 */
export function parseTestFiles(filePaths) {
  const results = [];

  for (const filePath of filePaths) {
    try {
      const parsed = parseTestFile(filePath);
      results.push(parsed);
    } catch (err) {
      results.push({
        filePath,
        fileName: path.basename(filePath),
        error: err.message,
        testCount: 0,
        testCases: []
      });
    }
  }

  return results;
}

/**
 * Generate summary statistics from parsed tests
 * @param {Object[]} parsedTests - Array of parsed test data
 * @returns {Object} Summary statistics
 */
export function generateSummary(parsedTests) {
  const summary = {
    totalFiles: parsedTests.length,
    totalTests: 0,
    totalDescribes: 0,
    byFramework: {},
    byLanguage: {},
    byTestType: {},
    filesWithErrors: 0
  };

  for (const parsed of parsedTests) {
    if (parsed.error) {
      summary.filesWithErrors++;
      continue;
    }

    summary.totalTests += parsed.testCount;
    summary.totalDescribes += parsed.describeCount;

    // Count by framework
    summary.byFramework[parsed.framework] = (summary.byFramework[parsed.framework] || 0) + 1;

    // Count by language
    summary.byLanguage[parsed.language] = (summary.byLanguage[parsed.language] || 0) + 1;

    // Count by test type
    for (const tc of parsed.testCases) {
      summary.byTestType[tc.testType] = (summary.byTestType[tc.testType] || 0) + 1;
    }
  }

  return summary;
}

export default {
  parseTestFile,
  parseTestFiles,
  generateSummary
};
