import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { parseVitestJson, parsePlaywrightReport, parseLcovCoverage, collectBuildFeedback } from '../bridge/build-feedback-collector.js';

// --- Sample Fixtures ---

const VITEST_JSON = {
  numTotalTests: 10,
  numPassedTests: 8,
  numFailedTests: 1,
  numPendingTests: 1,
  duration: 5200,
  testResults: [
    {
      name: 'tests/unit/parser.test.js',
      assertionResults: [
        { fullName: 'parser > parses input', status: 'passed', duration: 12 },
        { fullName: 'parser > handles edge case', status: 'failed', duration: 5, failureMessages: ['Expected 1 to be 2'] },
      ],
    },
  ],
};

const PLAYWRIGHT_JSON = {
  stats: { duration: 15000 },
  suites: [
    {
      title: 'Dashboard',
      specs: [
        {
          title: 'loads dashboard',
          tests: [{ status: 'expected', results: [{ status: 'passed', duration: 3200, attachments: [] }] }],
        },
        {
          title: 'shows error on failure',
          tests: [{ status: 'unexpected', results: [{ status: 'failed', duration: 1500, attachments: [{ name: 'screenshot' }] }] }],
        },
      ],
      suites: [],
    },
  ],
};

const LCOV_CONTENT = `SF:lib/module.js
FNF:5
FNH:4
LF:100
LH:85
BRF:20
BRH:16
end_of_record
SF:lib/other.js
FNF:3
FNH:3
LF:50
LH:50
BRF:10
BRH:10
end_of_record`;

// --- Tests ---

describe('parseVitestJson', () => {
  const tmpPath = '/tmp/test-vitest.json';

  afterEach(() => {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  });

  it('parses valid Vitest JSON output', () => {
    fs.writeFileSync(tmpPath, JSON.stringify(VITEST_JSON));
    const { data, warning } = parseVitestJson(tmpPath);
    expect(warning).toBeNull();
    expect(data.framework).toBe('vitest');
    expect(data.numPassed).toBe(8);
    expect(data.numFailed).toBe(1);
    expect(data.numSkipped).toBe(1);
    expect(data.numTotal).toBe(10);
    expect(data.totalDuration).toBe(5200);
    expect(data.success).toBe(false);
    expect(data.failures).toHaveLength(1);
    expect(data.failures[0].testName).toBe('parser > handles edge case');
  });

  it('returns warning when path is null', () => {
    const { data, warning } = parseVitestJson(null);
    expect(data).toBeNull();
    expect(warning).toContain('not provided');
  });

  it('returns warning when file does not exist', () => {
    const { data, warning } = parseVitestJson('/tmp/nonexistent.json');
    expect(data).toBeNull();
    expect(warning).toContain('not found');
  });

  it('returns warning on malformed JSON', () => {
    fs.writeFileSync(tmpPath, '{{invalid json');
    const { data, warning } = parseVitestJson(tmpPath);
    expect(data).toBeNull();
    expect(warning).toContain('parse error');
  });

  it('derives counts from testResults when top-level counts are zero', () => {
    const minimalJson = {
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [
        {
          name: 'test.js',
          assertionResults: [
            { status: 'passed', fullName: 'a' },
            { status: 'failed', fullName: 'b', failureMessages: ['err'] },
          ],
        },
      ],
    };
    fs.writeFileSync(tmpPath, JSON.stringify(minimalJson));
    const { data } = parseVitestJson(tmpPath);
    expect(data.numTotal).toBe(2);
    expect(data.numPassed).toBe(1);
    expect(data.numFailed).toBe(1);
  });
});

describe('parsePlaywrightReport', () => {
  const tmpPath = '/tmp/test-playwright.json';

  afterEach(() => {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  });

  it('parses valid Playwright JSON report', () => {
    fs.writeFileSync(tmpPath, JSON.stringify(PLAYWRIGHT_JSON));
    const { data, warning } = parsePlaywrightReport(tmpPath);
    expect(warning).toBeNull();
    expect(data.framework).toBe('playwright');
    expect(data.numTotal).toBe(2);
    expect(data.numPassed).toBe(1);
    expect(data.numFailed).toBe(1);
    expect(data.success).toBe(false);
    expect(data.tests[1].attachments).toContain('screenshot');
  });

  it('returns warning when path is null', () => {
    const { data, warning } = parsePlaywrightReport(null);
    expect(data).toBeNull();
    expect(warning).toContain('not provided');
  });

  it('returns warning when file does not exist', () => {
    const { data, warning } = parsePlaywrightReport('/tmp/nonexistent.json');
    expect(data).toBeNull();
    expect(warning).toContain('not found');
  });
});

describe('parseLcovCoverage', () => {
  const tmpPath = '/tmp/test-lcov.info';

  afterEach(() => {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  });

  it('parses valid lcov.info file', () => {
    fs.writeFileSync(tmpPath, LCOV_CONTENT);
    const { data, warning } = parseLcovCoverage(tmpPath);
    expect(warning).toBeNull();
    // Lines: 135/150 = 90%
    expect(data.lines).toBe(90);
    // Branches: 26/30 = 86.67%
    expect(data.branches).toBe(86.67);
    // Functions: 7/8 = 87.5%
    expect(data.functions).toBe(87.5);
    expect(data.linesFound).toBe(150);
    expect(data.linesHit).toBe(135);
  });

  it('returns warning when path is null', () => {
    const { data, warning } = parseLcovCoverage(null);
    expect(data).toBeNull();
    expect(warning).toContain('not provided');
  });

  it('handles 0% coverage', () => {
    fs.writeFileSync(tmpPath, 'SF:empty.js\nLF:10\nLH:0\nBRF:5\nBRH:0\nFNF:2\nFNH:0\nend_of_record');
    const { data } = parseLcovCoverage(tmpPath);
    expect(data.lines).toBe(0);
    expect(data.branches).toBe(0);
    expect(data.functions).toBe(0);
  });
});

describe('collectBuildFeedback', () => {
  it('returns partial results with warnings when no paths provided', async () => {
    const result = await collectBuildFeedback('fake-venture-id', {}, { skipWrite: true });
    expect(result.success).toBe(true);
    expect(result.data.unit_tests).toBeNull();
    expect(result.data.e2e_tests).toBeNull();
    expect(result.data.coverage).toBeNull();
    expect(result.warnings).toHaveLength(3);
  });

  it('parses all three artifacts when provided', async () => {
    const vitestPath = '/tmp/test-collect-vitest.json';
    const playwrightPath = '/tmp/test-collect-pw.json';
    const lcovPath = '/tmp/test-collect-lcov.info';

    fs.writeFileSync(vitestPath, JSON.stringify(VITEST_JSON));
    fs.writeFileSync(playwrightPath, JSON.stringify(PLAYWRIGHT_JSON));
    fs.writeFileSync(lcovPath, LCOV_CONTENT);

    try {
      const result = await collectBuildFeedback('fake-venture-id', {
        vitestJson: vitestPath,
        playwrightReport: playwrightPath,
        lcovInfo: lcovPath,
      }, { skipWrite: true });

      expect(result.success).toBe(true);
      expect(result.data.unit_tests).toBeTruthy();
      expect(result.data.unit_tests.framework).toBe('vitest');
      expect(result.data.e2e_tests).toBeTruthy();
      expect(result.data.e2e_tests.framework).toBe('playwright');
      expect(result.data.coverage).toBeTruthy();
      expect(result.data.coverage.lines).toBe(90);
      expect(result.warnings).toHaveLength(0);
    } finally {
      try { fs.unlinkSync(vitestPath); } catch { /* */ }
      try { fs.unlinkSync(playwrightPath); } catch { /* */ }
      try { fs.unlinkSync(lcovPath); } catch { /* */ }
    }
  });

  it('requires ventureId for database write', async () => {
    const result = await collectBuildFeedback(null, {});
    expect(result.success).toBe(false);
    expect(result.warnings.some(w => w.includes('ventureId'))).toBe(true);
  });

  it('collectBuildFeedback is exported as a function', async () => {
    expect(typeof collectBuildFeedback).toBe('function');
  });
});
