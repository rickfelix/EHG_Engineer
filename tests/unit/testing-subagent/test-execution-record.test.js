/**
 * SD-FDBK-INFRA-TESTING-SUB-AGENT-001 SC#6 (Solomon plan input, row 5d28e1c5) — the ONE
 * structured test-execution representation shared by both writer paths (sub-agent code path
 * and worker-authored source='manual' evidence).
 */
import { describe, it, expect } from 'vitest';
import { buildTestExecution, isMeasuredExecution } from '../../../lib/sub-agents/testing/test-execution-record.js';

describe('buildTestExecution', () => {
  it('builds the canonical 6-field shape', () => {
    const te = buildTestExecution({ executed: 10, passed: 8, failed: 2, skipped: 0, artifactSha: 'abc123', runner: 'vitest' });
    expect(te).toEqual({ tests_executed: 10, tests_passed: 8, tests_failed: 2, tests_skipped: 0, artifact_sha: 'abc123', runner: 'vitest' });
  });

  it('defaults to a zeroed, non-measured record when called with no args', () => {
    const te = buildTestExecution();
    expect(te).toEqual({ tests_executed: 0, tests_passed: 0, tests_failed: 0, tests_skipped: 0, artifact_sha: null, runner: null });
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

  // SUPERSEDES the old "false for undefined/null/malformed input" expectation (RCA
  // 2026-09-02, SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012 FR-1 corrective): `false` must mean
  // "confirmed tests_executed===0", never "cannot tell". Collapsing both into `false` is what
  // silently hard-blocked legacy partial-shape rows at the EXEC-TO-PLAN gate.
  it('null for undefined/null/malformed input — cannot confirm, not confirmed-zero — never throws', () => {
    expect(isMeasuredExecution(undefined)).toBeNull();
    expect(isMeasuredExecution(null)).toBeNull();
    expect(isMeasuredExecution('not an object')).toBeNull();
  });

  it('null when tests_executed key is absent, even with other counters present (legacy partial shape)', () => {
    expect(isMeasuredExecution({ tests_passed: 960, tests_failed: 0 })).toBeNull();
    expect(isMeasuredExecution({ tests_run: 224, tests_passed: 224 })).toBeNull();
  });

  it('null when tests_executed IS present but the other three keys are not — incomplete shape never trusted as measured, even at >0', () => {
    expect(isMeasuredExecution({ tests_executed: 500, tests_failed: 500 })).toBeNull();
  });
});
