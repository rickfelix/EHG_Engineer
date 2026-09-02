/**
 * SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001
 *
 * Unit tests for lib/sub-agents/testing/artifact-verification.js -- the module that lets
 * the TESTING sub-agent's evidence-reuse fast-path verify a claimed artifact instead of
 * trusting a DB row's own pass/fail counts. All fs/crypto access is via the real,
 * injectable readFile parameter fed a synthetic implementation -- no real filesystem
 * access in this suite (TR-3).
 */
import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';
import {
  readArtifact,
  computeArtifactSha,
  readArtifactWithSha,
  isArtifactFresh,
  isReportHashMismatch,
  classifyProvenance,
  deriveCountsFromArtifact,
  RUNNER_TRIGGER_ALLOWLIST,
  MAX_ARTIFACT_BYTES
} from '../../../lib/sub-agents/testing/artifact-verification.js';

function fakeReadFile(content) {
  return () => content;
}

describe('readArtifact', () => {
  it('TS-1/happy: parses a native Playwright report with a valid stats object', () => {
    const report = JSON.stringify({ stats: { expected: 51, unexpected: 0, skipped: 0, flaky: 0, startTime: '2026-09-01T22:00:00.000Z' } });
    const result = readArtifact('/fake/path.json', fakeReadFile(report));
    expect(result).toEqual({ expected: 51, unexpected: 0, skipped: 0, flaky: 0, startTime: '2026-09-01T22:00:00.000Z' });
  });

  it('TS-3: parses a majority-failing artifact faithfully (the witnessed incident shape)', () => {
    const report = JSON.stringify({ stats: { expected: 481, unexpected: 1276, skipped: 1673, startTime: '2026-09-01T00:58:49.000Z' } });
    const result = readArtifact('/fake/path.json', fakeReadFile(report));
    expect(result.unexpected).toBe(1276);
    expect(result.flaky).toBe(0); // absent flaky defaults to 0, never undefined
  });

  it('returns null for a null/undefined path', () => {
    expect(readArtifact(null)).toBeNull();
    expect(readArtifact(undefined)).toBeNull();
  });

  it('TS-7: returns null when the file read throws (missing file)', () => {
    const readFile = () => { throw new Error('ENOENT'); };
    expect(readArtifact('/does/not/exist.json', readFile)).toBeNull();
  });

  it('TS-8: returns null for malformed JSON, never throws', () => {
    expect(() => readArtifact('/fake/path.json', fakeReadFile('{not valid json'))).not.toThrow();
    expect(readArtifact('/fake/path.json', fakeReadFile('{not valid json'))).toBeNull();
  });

  it('TS-12: returns null for a vitest-shaped report with no stats object (never coerces undefined>0 to false-as-zero)', () => {
    const vitestReport = JSON.stringify({ testResults: [{ status: 'passed' }], numPassedTests: 51, numFailedTests: 0 });
    expect(readArtifact('/fake/path.json', fakeReadFile(vitestReport))).toBeNull();
  });

  it('returns null when stats fields are not integers (malformed shape)', () => {
    const report = JSON.stringify({ stats: { expected: '51', unexpected: 0, skipped: 0 } });
    expect(readArtifact('/fake/path.json', fakeReadFile(report))).toBeNull();
  });

  it('defaults flaky to 0 when absent, and to 0 when non-integer', () => {
    const report1 = JSON.stringify({ stats: { expected: 1, unexpected: 0, skipped: 0 } });
    expect(readArtifact('/fake/path.json', fakeReadFile(report1)).flaky).toBe(0);
    const report2 = JSON.stringify({ stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 'nope' } });
    expect(readArtifact('/fake/path.json', fakeReadFile(report2)).flaky).toBe(0);
  });

  it('defaults startTime to null when absent or non-string', () => {
    const report = JSON.stringify({ stats: { expected: 1, unexpected: 0, skipped: 0 } });
    expect(readArtifact('/fake/path.json', fakeReadFile(report)).startTime).toBeNull();
  });
});

describe('computeArtifactSha', () => {
  it('computes a stable sha256, matching test-evidence-ingest.js\'s own computeReportHash method (sha256 of JSON.stringify(parsed)), so it is comparable to test_runs.report_hash', () => {
    const report = { stats: { expected: 1, unexpected: 0, skipped: 0 } };
    const sha1 = computeArtifactSha('/fake/path.json', fakeReadFile(JSON.stringify(report)));
    const expected = createHash('sha256').update(JSON.stringify(JSON.parse(JSON.stringify(report)))).digest('hex');
    expect(sha1).toBe(expected);
    expect(sha1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for genuinely different content', () => {
    const sha1 = computeArtifactSha('/fake/path.json', fakeReadFile(JSON.stringify({ stats: { expected: 1, unexpected: 0, skipped: 0 } })));
    const sha2 = computeArtifactSha('/fake/path.json', fakeReadFile(JSON.stringify({ stats: { expected: 2, unexpected: 0, skipped: 0 } })));
    expect(sha1).not.toBe(sha2);
  });

  it('returns null on read failure, missing path, or malformed JSON, never throws', () => {
    expect(computeArtifactSha(null)).toBeNull();
    expect(() => computeArtifactSha('/x', () => { throw new Error('boom'); })).not.toThrow();
    expect(computeArtifactSha('/x', () => { throw new Error('boom'); })).toBeNull();
    expect(computeArtifactSha('/x', fakeReadFile('{not valid json'))).toBeNull();
  });
});

describe('isReportHashMismatch', () => {
  it('FR-5 AC-4: reports a mismatch only when BOTH hashes are present and differ', () => {
    expect(isReportHashMismatch('abc123', 'abc123')).toBe(false);
    expect(isReportHashMismatch('abc123', 'def456')).toBe(true);
  });

  it('is never a mismatch when either side is absent (older rows predate this SD)', () => {
    expect(isReportHashMismatch(null, 'def456')).toBe(false);
    expect(isReportHashMismatch('abc123', null)).toBe(false);
    expect(isReportHashMismatch(null, null)).toBe(false);
    expect(isReportHashMismatch(undefined, undefined)).toBe(false);
  });
});

describe('size cap (DoS hardening)', () => {
  it('refuses an artifact exceeding MAX_ARTIFACT_BYTES rather than parsing an unbounded file', () => {
    const oversized = 'x'.repeat(MAX_ARTIFACT_BYTES + 1);
    expect(readArtifact('/fake/huge.json', fakeReadFile(oversized))).toBeNull();
    expect(computeArtifactSha('/fake/huge.json', fakeReadFile(oversized))).toBeNull();
    expect(readArtifactWithSha('/fake/huge.json', fakeReadFile(oversized))).toEqual({ artifact: null, sha: null });
  });
});

describe('readArtifactWithSha (TOCTOU hardening)', () => {
  it('reads the file exactly once, deriving both the artifact and its sha from the SAME bytes', () => {
    const report = { stats: { expected: 51, unexpected: 0, skipped: 0, flaky: 0, startTime: '2026-09-01T22:00:00.000Z' } };
    const raw = JSON.stringify(report);
    const readFile = vi.fn(() => raw);

    const { artifact, sha } = readArtifactWithSha('/fake/path.json', readFile);

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(artifact).toEqual({ expected: 51, unexpected: 0, skipped: 0, flaky: 0, startTime: '2026-09-01T22:00:00.000Z' });
    expect(sha).toBe(createHash('sha256').update(JSON.stringify(JSON.parse(raw))).digest('hex'));
  });

  it('returns {artifact:null, sha:null} on missing path, read failure, or malformed JSON, never throws', () => {
    expect(readArtifactWithSha(null)).toEqual({ artifact: null, sha: null });
    expect(() => readArtifactWithSha('/x', () => { throw new Error('boom'); })).not.toThrow();
    expect(readArtifactWithSha('/x', () => { throw new Error('boom'); })).toEqual({ artifact: null, sha: null });
    expect(readArtifactWithSha('/x', fakeReadFile('{not valid json'))).toEqual({ artifact: null, sha: null });
  });
});

describe('isArtifactFresh', () => {
  it('TS-4: is fresh when artifact startTime is at or after the commit timestamp', () => {
    expect(isArtifactFresh('2026-09-01T22:00:00.000Z', '2026-09-01T21:00:00.000Z')).toBe(true);
    expect(isArtifactFresh('2026-09-01T21:00:00.000Z', '2026-09-01T21:00:00.000Z')).toBe(true);
  });

  it('TS-4: is NOT fresh when artifact startTime predates the commit timestamp (stale artifact refused)', () => {
    expect(isArtifactFresh('2026-09-01T00:58:49.000Z', '2026-09-01T21:12:54.000Z')).toBe(false);
  });

  it('TS-9: fails toward "not fresh" when either input is missing or unparseable', () => {
    expect(isArtifactFresh(null, '2026-09-01T21:00:00.000Z')).toBe(false);
    expect(isArtifactFresh('2026-09-01T21:00:00.000Z', null)).toBe(false);
    expect(isArtifactFresh('not-a-date', '2026-09-01T21:00:00.000Z')).toBe(false);
    expect(isArtifactFresh('2026-09-01T21:00:00.000Z', 'not-a-date')).toBe(false);
  });
});

describe('classifyProvenance', () => {
  it('TS-5: allowlists PLAYWRIGHT_REPORTER and CI_PIPELINE', () => {
    expect(classifyProvenance('PLAYWRIGHT_REPORTER')).toBe(true);
    expect(classifyProvenance('CI_PIPELINE')).toBe(true);
  });

  it('TS-5: does not allowlist a hand-written/human ingest source', () => {
    expect(classifyProvenance('claude-code')).toBe(false);
    expect(classifyProvenance('manual')).toBe(false);
    expect(classifyProvenance('exec_validation')).toBe(false);
    expect(classifyProvenance('testing-agent')).toBe(false);
  });

  it('is case-sensitive and fails closed on non-string/missing input', () => {
    expect(classifyProvenance('playwright_reporter')).toBe(false);
    expect(classifyProvenance(null)).toBe(false);
    expect(classifyProvenance(undefined)).toBe(false);
  });

  it('RUNNER_TRIGGER_ALLOWLIST is exported as an extensible named constant', () => {
    expect(RUNNER_TRIGGER_ALLOWLIST).toBeInstanceOf(Set);
    expect(RUNNER_TRIGGER_ALLOWLIST.has('PLAYWRIGHT_REPORTER')).toBe(true);
  });
});

describe('deriveCountsFromArtifact', () => {
  it('mirrors runFullE2ESuite\'s own formula: executed=expected+unexpected+flaky, passed=expected+flaky, failed=unexpected', () => {
    const counts = deriveCountsFromArtifact({ expected: 45, unexpected: 3, skipped: 2, flaky: 5 });
    expect(counts).toEqual({ tests_executed: 53, tests_passed: 50, failed_tests: 3, skipped_tests: 2 });
  });

  it('TS-11: an all-skipped artifact (expected=0) yields tests_executed=0, routing to the existing no-evidence path downstream', () => {
    const counts = deriveCountsFromArtifact({ expected: 0, unexpected: 0, skipped: 1673, flaky: 0 });
    expect(counts.tests_executed).toBe(0);
  });

  it('TS-11: a flaky-but-ultimately-passing run (flaky>0, unexpected=0) is NOT zero-evidence', () => {
    const counts = deriveCountsFromArtifact({ expected: 48, unexpected: 0, skipped: 0, flaky: 3 });
    expect(counts.tests_executed).toBe(51);
    expect(counts.failed_tests).toBe(0);
  });
});
