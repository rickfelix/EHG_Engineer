import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
}));

import { writeFileSync } from 'node:fs';
import { writePrFailuresArtifact, annotateRegression } from '../../../scripts/compare-to-main-snapshot.mjs';

describe('writePrFailuresArtifact', () => {
  beforeEach(() => vi.clearAllMocks());

  const raw = {
    testResults: [
      {
        name: 'src/changed.js',
        assertionResults: [
          { status: 'failed', fullName: 'newly broken', failureMessages: ['Error: boom'] },
        ],
      },
      {
        name: 'src/unrelated.js',
        assertionResults: [
          { status: 'failed', fullName: 'pre-existing flaky', failureMessages: ['Error: flaky'] },
        ],
      },
    ],
  };

  it('identity mode: writes ONLY the genuine new_failures, excluding non-regressed current failures', () => {
    const result = {
      usedFallback: false,
      newRegressions: ['src/changed.js::newly broken'],
      newFailureCount: 1,
      isRegression: true,
    };
    writePrFailuresArtifact('test-failures-pr.json', raw, 2, result);
    const written = JSON.parse(writeFileSync.mock.calls[0][1]);
    expect(written.new_failures).toHaveLength(1);
    expect(written.new_failures[0].fullName).toBe('newly broken');
    expect(written.new_failures.some((f) => f.fullName === 'pre-existing flaky')).toBe(false);
  });

  it('fallback mode: dumps every current failure (legacy behavior, no identity data to filter by)', () => {
    const result = { usedFallback: true, newRegressions: [], newFailureCount: 1, isRegression: true };
    writePrFailuresArtifact('test-failures-pr.json', raw, 2, result);
    const written = JSON.parse(writeFileSync.mock.calls[0][1]);
    expect(written.new_failures).toHaveLength(2);
  });
});

describe('annotateRegression', () => {
  let stderrSpy;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('lists the actual regressed test identities in identity mode', () => {
    annotateRegression({
      usedFallback: false,
      newRegressions: ['src/changed.js::newly broken'],
      newFailureCount: 1,
      isRegression: true,
    });
    const output = stderrSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toMatch(/BASELINE_REGRESSION: 1 new test failure/);
    expect(output).toMatch(/src\/changed\.js::newly broken/);
    stderrSpy.mockRestore();
  });

  it('truncates to 10 identities with a "N more" suffix', () => {
    const many = Array.from({ length: 15 }, (_, i) => `src/x.js::t${i}`);
    annotateRegression({ usedFallback: false, newRegressions: many, newFailureCount: 15, isRegression: true });
    const output = stderrSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toMatch(/\.\.\. and 5 more/);
    stderrSpy.mockRestore();
  });

  it('omits the identity list in fallback mode (no identity data available)', () => {
    annotateRegression({ usedFallback: true, newRegressions: [], newFailureCount: 3, isRegression: true });
    const output = stderrSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toMatch(/BASELINE_REGRESSION: 3 new test failure/);
    stderrSpy.mockRestore();
  });
});
