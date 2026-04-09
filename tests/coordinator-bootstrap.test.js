/**
 * Unit tests for lib/execute/coordinator-bootstrap.cjs
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-D (Phase 4 of /execute)
 *
 * Pure-function tests with mocked filesystem (injected via fsImpl param).
 */

import { describe, test, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const bootstrap = require('../lib/execute/coordinator-bootstrap.cjs');

function mockFs({ exists = true, mtimeMinutesAgo = 1, throwOnExists = null, throwOnStat = null }) {
  return {
    existsSync: (p) => {
      if (throwOnExists) throw new Error(throwOnExists);
      return exists;
    },
    statSync: (p) => {
      if (throwOnStat) throw new Error(throwOnStat);
      return { mtimeMs: Date.now() - mtimeMinutesAgo * 60000 };
    }
  };
}

describe('coordinator-bootstrap.checkCoordinatorRunning', () => {
  test('exports expected constants', () => {
    expect(bootstrap.DEFAULT_LOCK_PATH).toBeTruthy();
    expect(typeof bootstrap.DEFAULT_LOCK_PATH).toBe('string');
    expect(bootstrap.FRESHNESS_THRESHOLD_MINUTES).toBe(10);
  });

  test('running=true when lock file exists and is fresh (<10 min)', () => {
    const fsMock = mockFs({ exists: true, mtimeMinutesAgo: 2 });
    const r = bootstrap.checkCoordinatorRunning('/fake/lock', fsMock);
    expect(r.running).toBe(true);
    expect(r.reason).toBe('lock_fresh');
    expect(r.ageMinutes).toBeCloseTo(2, 0);
  });

  test('running=true at edge (just under 10 min)', () => {
    const fsMock = mockFs({ exists: true, mtimeMinutesAgo: 9.5 });
    const r = bootstrap.checkCoordinatorRunning('/fake/lock', fsMock);
    expect(r.running).toBe(true);
  });

  test('running=false when lock file is stale (>10 min)', () => {
    const fsMock = mockFs({ exists: true, mtimeMinutesAgo: 30 });
    const r = bootstrap.checkCoordinatorRunning('/fake/lock', fsMock);
    expect(r.running).toBe(false);
    expect(r.reason).toMatch(/lock_stale_30min_old/);
    expect(r.ageMinutes).toBeCloseTo(30, 0);
  });

  test('running=false when lock file is missing', () => {
    const fsMock = mockFs({ exists: false });
    const r = bootstrap.checkCoordinatorRunning('/fake/lock', fsMock);
    expect(r.running).toBe(false);
    expect(r.reason).toBe('lock_file_missing');
    expect(r.lastModified).toBeNull();
  });

  test('running=false when no lockPath provided', () => {
    const r = bootstrap.checkCoordinatorRunning(null);
    expect(r.running).toBe(false);
    expect(r.reason).toBe('no_lock_path_provided');
    expect(r.lockPath).toBeNull();
  });

  test('running=false when existsSync throws', () => {
    const fsMock = mockFs({ exists: true, throwOnExists: 'permission denied' });
    const r = bootstrap.checkCoordinatorRunning('/fake/lock', fsMock);
    expect(r.running).toBe(false);
    expect(r.reason).toMatch(/existsSync_failed/);
  });

  test('running=false when statSync throws', () => {
    const fsMock = mockFs({ exists: true, throwOnStat: 'access denied' });
    const r = bootstrap.checkCoordinatorRunning('/fake/lock', fsMock);
    expect(r.running).toBe(false);
    expect(r.reason).toMatch(/statSync_failed/);
  });

  test('uses DEFAULT_LOCK_PATH when no path argument', () => {
    // We can't easily test the default since it depends on real fs,
    // but we can verify the default is exported and a string.
    expect(bootstrap.DEFAULT_LOCK_PATH).toContain('.claude');
    expect(bootstrap.DEFAULT_LOCK_PATH).toMatch(/scheduled_tasks\.lock$/);
  });

  test('does not mutate global state (called twice returns same shape)', () => {
    const fsMock = mockFs({ exists: true, mtimeMinutesAgo: 1 });
    const r1 = bootstrap.checkCoordinatorRunning('/fake/lock', fsMock);
    const r2 = bootstrap.checkCoordinatorRunning('/fake/lock', fsMock);
    expect(r1.running).toBe(r2.running);
    expect(r1.reason).toBe(r2.reason);
  });
});

describe('coordinator-bootstrap.buildWarningMessage', () => {
  test('empty string when running', () => {
    const msg = bootstrap.buildWarningMessage({ running: true });
    expect(msg).toBe('');
  });

  test('multi-line warning when not running (missing lock)', () => {
    const result = {
      running: false,
      reason: 'lock_file_missing',
      lockPath: '/fake/lock'
    };
    const msg = bootstrap.buildWarningMessage(result);
    expect(msg).toContain('/coordinator cron loops are not running');
    expect(msg).toContain('lock_file_missing');
    expect(msg).toContain('/fake/lock');
    expect(msg).toContain('/coordinator start');
    expect(msg).toContain('chairman opt-in policy');
  });

  test('warning when not running (stale lock)', () => {
    const result = {
      running: false,
      reason: 'lock_stale_45min_old',
      lockPath: '/fake/lock'
    };
    const msg = bootstrap.buildWarningMessage(result);
    expect(msg).toContain('lock_stale_45min_old');
  });

  test('handles null lockPath in warning', () => {
    const result = { running: false, reason: 'no_lock_path_provided', lockPath: null };
    const msg = bootstrap.buildWarningMessage(result);
    expect(msg).toContain('(none)');
  });
});

describe('coordinator-bootstrap end-to-end shape', () => {
  test('result includes all documented fields', () => {
    const fsMock = mockFs({ exists: true, mtimeMinutesAgo: 5 });
    const r = bootstrap.checkCoordinatorRunning('/some/path', fsMock);
    expect(r).toHaveProperty('running');
    expect(r).toHaveProperty('lockPath');
    expect(r).toHaveProperty('lastModified');
    expect(r).toHaveProperty('ageMinutes');
    expect(r).toHaveProperty('reason');
  });

  test('lastModified is a Date when running', () => {
    const fsMock = mockFs({ exists: true, mtimeMinutesAgo: 5 });
    const r = bootstrap.checkCoordinatorRunning('/some/path', fsMock);
    expect(r.lastModified).toBeInstanceOf(Date);
  });

  test('lastModified is null when missing', () => {
    const fsMock = mockFs({ exists: false });
    const r = bootstrap.checkCoordinatorRunning('/some/path', fsMock);
    expect(r.lastModified).toBeNull();
  });
});
