/**
 * Testing Sub-Agent - Configuration
 * Thresholds and pattern definitions
 */

/**
 * Testing thresholds for coverage and quality
 */
export const THRESHOLDS = {
  coverage: {
    statements: 80,
    branches: 75,
    functions: 80,
    lines: 80
  },
  testRatio: 0.5,  // Tests per source file
  assertionDensity: 2  // Assertions per test
};

/**
 * Patterns for identifying test files
 */
export const TEST_PATTERNS = ['.test.', '.spec.', '__tests__', 'test/', 'tests/'];

/**
 * Source directories to scan
 */
export const SOURCE_DIRS = ['src', 'lib', 'app', 'components', 'services', 'utils'];

/**
 * E2E test directories
 */
export const E2E_DIRS = ['e2e', 'integration', 'cypress', 'playwright'];

/**
 * Frontend frameworks that typically need E2E tests
 */
export const FRONTEND_FRAMEWORKS = ['react', 'vue', 'angular', 'next', 'nuxt', 'svelte'];

/**
 * Patterns that indicate flaky tests
 */
export const FLAKY_PATTERNS = [
  { pattern: /Math\.random/g, issue: 'Uses Math.random without seeding' },
  { pattern: /Date\.now/g, issue: 'Uses Date.now without mocking' },
  { pattern: /setTimeout.*expect/g, issue: 'Assertion inside setTimeout' },
  { pattern: /\.wait\(\d+\)/g, issue: 'Uses arbitrary wait times' },
  { pattern: /real.*api|fetch.*http/gi, issue: 'Makes real HTTP requests' }
];

/**
 * Assertion patterns to count
 */
export const ASSERTION_PATTERNS = [
  /expect\s*\(/g,
  /assert\./g,
  /should\./g,
  /\.to\./g,
  /\.toBe/g,
  /\.toEqual/g
];

/**
 * Initial test health state
 */
export function createTestHealthState() {
  return {
    totalTests: 0,
    passingTests: 0,
    failingTests: 0,
    skippedTests: 0,
    coverage: null,
    missingTests: []
  };
}
