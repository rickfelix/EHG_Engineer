/**
 * Unit tests: centralized WAIT-verdict helper (FR-1)
 * SD-LEO-INFRA-EXTEND-WAIT-VERDICT-001
 *
 * Covers TS-1..TS-9 plus the RISK-2 regression-pin: a user-thrown Error whose
 * message merely contains "timeout" must classify as 'failure', NOT 'timeout'.
 */

import { describe, it, expect } from 'vitest';
import {
  buildWaitResult,
  buildFailResult,
  classifyTestRunnerExit,
  isWithinRaceWindow,
  hasExceededMaxWait,
} from '../../../lib/handoff/wait-verdict.js';

describe('buildWaitResult', () => {
  // TS-5: shape matches prerequisite-check.js wait verdict
  it('produces the canonical wait shape (passed:false, wait:true, all 7 keys)', () => {
    const r = buildWaitResult({
      score: 0,
      max_score: 100,
      wait_reason: 'evidence row not yet written',
      issues: [],
      details: { reason: 'RACE_WINDOW' },
    });
    expect(r.passed).toBe(false);
    expect(r.wait).toBe(true);
    expect(r.score).toBe(0);
    expect(r.max_score).toBe(100);
    expect(r.issues).toEqual([]);
    expect(r.wait_reason).toBe('evidence row not yet written');
    expect(r.details).toEqual({ reason: 'RACE_WINDOW' });
    // mirrors prerequisite-check.js which also carries warnings
    expect(Array.isArray(r.warnings)).toBe(true);
  });

  it('defaults a warning from wait_reason when none supplied', () => {
    const r = buildWaitResult({ wait_reason: 'parent waiting on children' });
    expect(r.warnings[0]).toMatch(/WAIT: parent waiting on children/);
  });

  it('passes through explicit warnings and remediation', () => {
    const r = buildWaitResult({
      wait_reason: 'x',
      warnings: ['custom warn'],
      remediation: 'wait and retry',
    });
    expect(r.warnings).toEqual(['custom warn']);
    expect(r.remediation).toBe('wait and retry');
  });
});

describe('buildFailResult', () => {
  it('produces a normal failure with wait:false', () => {
    const r = buildFailResult({
      score: 0,
      max_score: 100,
      issues: ['ERR_TESTING_REQUIRED'],
      remediation: 'run TESTING',
      details: { tier: 'REQUIRED' },
    });
    expect(r.passed).toBe(false);
    expect(r.wait).toBe(false);
    expect(r.issues).toEqual(['ERR_TESTING_REQUIRED']);
    expect(r.remediation).toBe('run TESTING');
    expect(r.details).toEqual({ tier: 'REQUIRED' });
  });

  it('never sets wait:true', () => {
    const r = buildFailResult({ issues: ['boom'] });
    expect(r.wait).toBe(false);
  });
});

describe('classifyTestRunnerExit', () => {
  // TS-1
  it('TS-1: exit 124 → timeout (GNU coreutils timeout)', () => {
    expect(classifyTestRunnerExit(124, '')).toBe('timeout');
  });

  it('exit 137 (SIGKILL/OOM) → timeout', () => {
    expect(classifyTestRunnerExit(137, '')).toBe('timeout');
  });

  it('exit 143 (SIGTERM) → timeout', () => {
    expect(classifyTestRunnerExit(143, '')).toBe('timeout');
  });

  it('jest async-callback timeout marker → timeout', () => {
    expect(
      classifyTestRunnerExit(1, 'Timeout - Async callback was not invoked within the 5000 ms timeout')
    ).toBe('timeout');
  });

  it('playwright per-test timeout marker → timeout', () => {
    expect(classifyTestRunnerExit(1, 'Test timeout of 30000ms exceeded')).toBe('timeout');
  });

  it('vitest "Test timed out in 5000ms" marker → timeout', () => {
    expect(classifyTestRunnerExit(1, 'Error: Test timed out in 5000ms.')).toBe('timeout');
  });

  // TS-2
  it('TS-2: assertion error → failure', () => {
    expect(classifyTestRunnerExit(1, 'AssertionError: expected 1 to equal 2')).toBe('failure');
  });

  // TS-3 — RISK-2 REGRESSION PIN
  it('TS-3 [REGRESSION-PIN]: user Error containing "timeout" → failure (NOT timeout)', () => {
    expect(classifyTestRunnerExit(1, 'Error: connection timeout')).toBe('failure');
    expect(classifyTestRunnerExit(1, 'Error: connection timeout at db.connect (db.js:10)')).toBe(
      'failure'
    );
  });

  // TS-4
  it('TS-4: exit 0, no marker → pass', () => {
    expect(classifyTestRunnerExit(0, '')).toBe('pass');
  });

  it('unknown non-zero exit with no marker → failure (never timeout)', () => {
    expect(classifyTestRunnerExit(255, 'some unknown crash')).toBe('failure');
  });
});

describe('isWithinRaceWindow', () => {
  const NOW = new Date('2026-04-24T20:00:30.000Z').getTime();

  // TS-6
  it('TS-6: started 5s ago, window 30s → true', () => {
    const started = new Date(NOW - 5_000).toISOString();
    expect(isWithinRaceWindow(started, 30, NOW)).toBe(true);
  });

  // TS-7
  it('TS-7: started 35s ago, window 30s → false', () => {
    const started = new Date(NOW - 35_000).toISOString();
    expect(isWithinRaceWindow(started, 30, NOW)).toBe(false);
  });

  it('exactly at the boundary (30s, window 30s) → true (inclusive)', () => {
    const started = new Date(NOW - 30_000).toISOString();
    expect(isWithinRaceWindow(started, 30, NOW)).toBe(true);
  });

  it('naive (no-TZ) timestamp is treated as UTC', () => {
    // 5s before NOW, expressed naively
    const started = '2026-04-24T20:00:25.000';
    expect(isWithinRaceWindow(started, 30, NOW)).toBe(true);
  });

  it('missing/unparseable startedAt → false (safe default → FAIL not WAIT-forever)', () => {
    expect(isWithinRaceWindow(null, 30, NOW)).toBe(false);
    expect(isWithinRaceWindow('not-a-date', 30, NOW)).toBe(false);
  });
});

describe('hasExceededMaxWait', () => {
  // TS-8
  it('TS-8: wait_attempts=10, maxAttempts=10 → exceeded (WAIT_LIMIT_EXCEEDED)', () => {
    const r = hasExceededMaxWait({ wait_attempts: 10, maxAttempts: 10 });
    expect(r.exceeded).toBe(true);
    expect(r.reason).toBe('WAIT_LIMIT_EXCEEDED');
  });

  it('wait_attempts=9, maxAttempts=10 → not exceeded', () => {
    const r = hasExceededMaxWait({ wait_attempts: 9, maxAttempts: 10 });
    expect(r.exceeded).toBe(false);
    expect(r.reason).toBe(null);
  });

  // TS-9
  it('TS-9: first_wait_at 25h ago → exceeded (WAIT_TIMEOUT_EXCEEDED)', () => {
    const now = Date.now();
    const first = new Date(now - 25 * 60 * 60 * 1000).toISOString();
    const r = hasExceededMaxWait({ wait_attempts: 1, first_wait_at: first, now });
    expect(r.exceeded).toBe(true);
    expect(r.reason).toBe('WAIT_TIMEOUT_EXCEEDED');
  });

  it('first_wait_at 1h ago, few attempts → not exceeded', () => {
    const now = Date.now();
    const first = new Date(now - 1 * 60 * 60 * 1000).toISOString();
    const r = hasExceededMaxWait({ wait_attempts: 2, first_wait_at: first, now });
    expect(r.exceeded).toBe(false);
  });

  it('attempt-limit trips even when wall-clock is fresh', () => {
    const now = Date.now();
    const first = new Date(now - 1000).toISOString();
    const r = hasExceededMaxWait({ wait_attempts: 10, first_wait_at: first, now });
    expect(r.exceeded).toBe(true);
    expect(r.reason).toBe('WAIT_LIMIT_EXCEEDED');
  });
});
