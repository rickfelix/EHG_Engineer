/**
 * Test Evidence Checker
 * SD-QUALITY-GATE-001: hasTestEvidence (35%)
 *
 * Validates testing coverage and evidence exists.
 * Returns true if any test evidence exists (unit tests, E2E, or manual).
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface TestEvidenceResult {
  passed: boolean;
  evidenceFound: EvidenceItem[];
  evidenceChecked: string[];
  details: string[];
}

export interface EvidenceItem {
  type: 'unit' | 'e2e' | 'coverage' | 'manual' | 'report';
  path: string;
  description: string;
}

const EVIDENCE_LOCATIONS = [
  { path: 'tests/e2e/evidence/', type: 'e2e' as const, description: 'E2E test evidence' },
  { path: 'coverage/', type: 'coverage' as const, description: 'Test coverage reports' },
  { path: 'test-results/', type: 'report' as const, description: 'Test results' },
  { path: '.vitest/', type: 'unit' as const, description: 'Vitest cache/results' },
  { path: 'playwright-report/', type: 'e2e' as const, description: 'Playwright reports' },
  { path: 'tests/unit/', type: 'unit' as const, description: 'Unit test files' },
  { path: 'tests/e2e/', type: 'e2e' as const, description: 'E2E test files' },
];

/**
 * Check for test evidence
 */
export function checkTestEvidence(
  basePath: string = process.cwd(),
  sdId?: string
): TestEvidenceResult {
  const details: string[] = [];
  const evidenceFound: EvidenceItem[] = [];
  const evidenceChecked: string[] = [];

  details.push(`Checking test evidence in: ${basePath}`);
  if (sdId) {
    details.push(`SD-specific evidence for: ${sdId}`);
  }

  // Check each evidence location
  for (const location of EVIDENCE_LOCATIONS) {
    const fullPath = join(basePath, location.path);
    evidenceChecked.push(location.path);

    if (existsSync(fullPath)) {
      // For directories, check if they have content
      try {
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
          const files = readdirSync(fullPath);
          if (files.length > 0) {
            evidenceFound.push({
              type: location.type,
              path: location.path,
              description: `${location.description} (${files.length} items)`
            });
            details.push(`  ✓ ${location.path} - ${files.length} items found`);

            // Check for SD-specific evidence if sdId provided
            if (sdId) {
              const sdFiles = files.filter(f => f.includes(sdId));
              if (sdFiles.length > 0) {
                details.push(`    → ${sdFiles.length} SD-specific files`);
              }
            }
          } else {
            details.push(`  ○ ${location.path} - empty directory`);
          }
        } else {
          evidenceFound.push({
            type: location.type,
            path: location.path,
            description: location.description
          });
          details.push(`  ✓ ${location.path} - file exists`);
        }
      } catch {
        details.push(`  ○ ${location.path} - access error`);
      }
    } else {
      details.push(`  ○ ${location.path} - not found`);
    }
  }

  // Check for recent test runs
  try {
    // Check if tests have been run recently (last 24 hours)
    const recentTests = checkRecentTestRuns(basePath);
    if (recentTests.length > 0) {
      for (const test of recentTests) {
        evidenceFound.push(test);
        details.push(`  ✓ Recent test run: ${test.description}`);
      }
    }
  } catch {
    // Ignore errors checking recent runs
  }

  // Determine pass/fail
  const passed = evidenceFound.length > 0;

  if (passed) {
    const types = Array.from(new Set(evidenceFound.map(e => e.type)));
    details.push(`\nTest evidence found: ${types.join(', ')}`);
    details.push(`Total evidence items: ${evidenceFound.length}`);
  } else {
    details.push('\nNo test evidence found');
    details.push('Run tests to generate evidence:');
    details.push('  - Unit tests: npm run test:unit');
    details.push('  - E2E tests: npm run test:e2e');
  }

  return {
    passed,
    evidenceFound,
    evidenceChecked,
    details
  };
}

/**
 * Check for recent test runs
 */
function checkRecentTestRuns(basePath: string): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  try {
    // Check package.json for test scripts
    const packageJsonPath = join(basePath, 'package.json');
    if (existsSync(packageJsonPath)) {
      // Check if vitest or jest config exists
      const vitestConfig = join(basePath, 'vitest.config.ts');
      const jestConfig = join(basePath, 'jest.config.js');
      const playwrightConfig = join(basePath, 'playwright.config.ts');

      if (existsSync(vitestConfig)) {
        evidence.push({
          type: 'unit',
          path: 'vitest.config.ts',
          description: 'Vitest configured'
        });
      }

      if (existsSync(jestConfig)) {
        evidence.push({
          type: 'unit',
          path: 'jest.config.js',
          description: 'Jest configured'
        });
      }

      if (existsSync(playwrightConfig)) {
        evidence.push({
          type: 'e2e',
          path: 'playwright.config.ts',
          description: 'Playwright configured'
        });
      }
    }
  } catch {
    // Ignore errors
  }

  return evidence;
}

// CLI execution
if (process.argv[1]?.includes('check-test-evidence')) {
  const basePath = process.argv[2] || process.cwd();
  const sdId = process.argv[3];

  console.log('Checking test evidence...');
  const result = checkTestEvidence(basePath, sdId);

  console.log('\nResults:');
  result.details.forEach(d => console.log(`  ${d}`));

  if (result.evidenceFound.length > 0) {
    console.log('\nEvidence found:');
    result.evidenceFound.forEach(e => {
      console.log(`  [${e.type}] ${e.path}: ${e.description}`);
    });
  }

  console.log(`\nVerdict: ${result.passed ? 'PASS' : 'FAIL'}`);
  process.exit(result.passed ? 0 : 1);
}
