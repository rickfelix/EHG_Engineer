/**
 * SD-FDBK-INFRA-TESTING-SUB-AGENT-001 SC#6 (Solomon plan input, row 5d28e1c5) — the ONE
 * structured test-execution representation shared by both writer paths (sub-agent code path
 * and worker-authored source='manual' evidence).
 */
import { describe, it, expect } from 'vitest';
import { buildTestExecution, isMeasuredExecution } from '../../../lib/sub-agents/testing/test-execution-record.js';

describe('buildTestExecution', () => {
  it('builds the canonical 8-field shape', () => {
    const te = buildTestExecution({ executed: 10, passed: 8, failed: 2, skipped: 0, artifactSha: 'abc123', runner: 'vitest', artifactPath: '/tmp/report.json', source: 'fresh' });
    expect(te).toEqual({ tests_executed: 10, tests_passed: 8, tests_failed: 2, tests_skipped: 0, artifact_sha: 'abc123', runner: 'vitest', artifact_path: '/tmp/report.json', source: 'fresh' });
  });

  it('defaults to a zeroed, non-measured record when called with no args', () => {
    const te = buildTestExecution();
    expect(te).toEqual({ tests_executed: 0, tests_passed: 0, tests_failed: 0, tests_skipped: 0, artifact_sha: null, runner: null, artifact_path: null, source: null });
    expect(isMeasuredExecution(te)).toBe(false);
  });
});

describe('isMeasuredExecution', () => {
  it('true when at least one test executed, REGARDLESS of pass/fail (a failing run is still measured)', () => {
    expect(isMeasuredExecution(buildTestExecution({ executed: 5, passed: 5, failed: 0 }))).toBe(true);
    expect(isMeasuredExecution(buildTestExecution({ executed: 5, passed: 3, failed: 2 }))).toBe(true);
  });

  it('false when zero tests executed (nothing was measured)', () => {
    expect(isMeasuredExecution(buildTestExecution({ executed: 0 }))).toBe(false);
  });

  it('false for undefined/null/malformed input — never throws', () => {
    expect(isMeasuredExecution(undefined)).toBe(false);
    expect(isMeasuredExecution(null)).toBe(false);
    expect(isMeasuredExecution('not an object')).toBe(false);
  });
});
