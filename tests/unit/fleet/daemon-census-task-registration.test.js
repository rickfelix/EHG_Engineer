// SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001 FR-4 — daemon census scheduled-task registration.

import { describe, it, expect } from 'vitest';
import {
  buildCensusSchtasksArgs,
  buildQueryArgs,
  buildRemoveArgs,
  TASK_NAME,
} from '../../../scripts/setup-daemon-census-task.mjs';

describe('FR4-TASK: argv shape', () => {
  it('is idempotent (/F) and targets the correct task name', () => {
    const args = buildCensusSchtasksArgs({ requireRunner: false });
    expect(args).toEqual(expect.arrayContaining(['/TN', TASK_NAME, '/F']));
  });

  it('schedules on a MINUTE interval, default 60', () => {
    const args = buildCensusSchtasksArgs({ requireRunner: false });
    const i = args.indexOf('/MO');
    expect(args[i - 1]).toBe('MINUTE');
    expect(args[i + 1]).toBe('60');
  });

  it('honors a custom interval', () => {
    const args = buildCensusSchtasksArgs({ intervalMinutes: 15, requireRunner: false });
    const i = args.indexOf('/MO');
    expect(args[i + 1]).toBe('15');
  });

  it('rejects a nonsense interval rather than registering a task that never fires sanely', () => {
    for (const bad of [0, -1, 1440, 2.5, 'soon']) {
      expect(() => buildCensusSchtasksArgs({ intervalMinutes: bad, requireRunner: false })).toThrow(/interval-minutes/);
    }
  });

  it('does NOT include --cleanup by default (report-only)', () => {
    const args = buildCensusSchtasksArgs({ requireRunner: false });
    const trArg = args[args.indexOf('/TR') + 1];
    expect(trArg).not.toMatch(/--cleanup/);
  });

  it('includes --cleanup when explicitly opted in', () => {
    const args = buildCensusSchtasksArgs({ cleanup: true, requireRunner: false });
    const trArg = args[args.indexOf('/TR') + 1];
    expect(trArg).toMatch(/--cleanup/);
  });

  it('REFUSES to build a command pointing at a MISSING runner', () => {
    // Same accepted-but-unread failure mode the console-reaper registrar guards against: a task
    // whose target does not exist registers happily and then fails silently every interval.
    expect(() => buildCensusSchtasksArgs({ requireRunner: true, runnerPath: 'C:/nope/missing-runner.mjs' }))
      .toThrow(/runner not found/);
  });

  it('ACCEPTS the real runner (assert-daemon-census.mjs), which exists', () => {
    expect(() => buildCensusSchtasksArgs({ requireRunner: true })).not.toThrow();
  });
});

describe('FR4-TASK: query/remove argv', () => {
  it('builds a query for this task name', () => {
    expect(buildQueryArgs()).toEqual(['/Query', '/TN', TASK_NAME, '/V', '/FO', 'LIST']);
  });
  it('builds a forced delete for this task name', () => {
    expect(buildRemoveArgs()).toEqual(['/Delete', '/TN', TASK_NAME, '/F']);
  });
});
