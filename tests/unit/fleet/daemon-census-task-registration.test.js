// SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001 FR-4 — daemon census scheduled-task registration.

import { describe, it, expect } from 'vitest';
import {
  buildCensusSchtasksArgs,
  buildWrapperScript,
  buildQueryArgs,
  buildRemoveArgs,
  TASK_NAME,
} from '../../../scripts/setup-daemon-census-task.mjs';

const WRAPPER_PATH = 'C:/repo/scripts/cron/daemon-census-task.cmd';

describe('buildWrapperScript (TESTING evidence 534ab65e finding F2: schtasks cwd is System32, not the repo)', () => {
  it('throws without repoRoot', () => {
    expect(() => buildWrapperScript({})).toThrow(/repoRoot required/);
  });

  it('cds into repoRoot BEFORE invoking node, so dotenv resolves .env correctly', () => {
    const content = buildWrapperScript({ repoRoot: 'C:/repo' });
    const lines = content.split('\r\n');
    const cdIdx = lines.findIndex((l) => l.includes('cd /d'));
    const nodeIdx = lines.findIndex((l) => l.includes('call node'));
    expect(cdIdx).toBeGreaterThan(-1);
    expect(nodeIdx).toBeGreaterThan(cdIdx); // cd must come first
    expect(lines[cdIdx]).toBe('cd /d "C:/repo"');
  });

  it('invokes assert-daemon-census.mjs without --cleanup by default', () => {
    const content = buildWrapperScript({ repoRoot: 'C:/repo' });
    expect(content).toMatch(/assert-daemon-census\.mjs"$/m);
    expect(content).not.toMatch(/--cleanup/);
  });

  it('includes --cleanup when explicitly opted in', () => {
    const content = buildWrapperScript({ repoRoot: 'C:/repo', cleanup: true });
    expect(content).toMatch(/assert-daemon-census\.mjs" --cleanup/);
  });
});

describe('FR4-TASK: argv shape', () => {
  it('is idempotent (/F) and targets the correct task name', () => {
    const args = buildCensusSchtasksArgs({ requireRunner: false, wrapperPath: WRAPPER_PATH });
    expect(args).toEqual(expect.arrayContaining(['/TN', TASK_NAME, '/F']));
  });

  it('/TR points at the WRAPPER, not directly at node+script (TESTING F2), UNQUOTED (TESTING N3)', () => {
    // execFileSync passes each argv element as its own token via CreateProcess -- no shell strips
    // wrapping quote characters, so embedding literal `"..."` would hand schtasks a path string
    // containing quote characters, not the real file. Matches setup-liveness-watcher-task.mjs /
    // setup-reboot-respawn-task.mjs / setup-eva-watcher-task.mjs / setup-console-creation-watcher-task.mjs,
    // which all pass wrapperPath bare for the same reason.
    const args = buildCensusSchtasksArgs({ requireRunner: false, wrapperPath: WRAPPER_PATH });
    const trArg = args[args.indexOf('/TR') + 1];
    expect(trArg).toBe(WRAPPER_PATH);
  });

  it('throws without wrapperPath', () => {
    expect(() => buildCensusSchtasksArgs({ requireRunner: false })).toThrow(/wrapperPath required/);
  });

  it('schedules on a MINUTE interval, default 60', () => {
    const args = buildCensusSchtasksArgs({ requireRunner: false, wrapperPath: WRAPPER_PATH });
    const i = args.indexOf('/MO');
    expect(args[i - 1]).toBe('MINUTE');
    expect(args[i + 1]).toBe('60');
  });

  it('honors a custom interval', () => {
    const args = buildCensusSchtasksArgs({ intervalMinutes: 15, requireRunner: false, wrapperPath: WRAPPER_PATH });
    const i = args.indexOf('/MO');
    expect(args[i + 1]).toBe('15');
  });

  it('rejects a nonsense interval rather than registering a task that never fires sanely', () => {
    for (const bad of [0, -1, 1440, 2.5, 'soon']) {
      expect(() => buildCensusSchtasksArgs({ intervalMinutes: bad, requireRunner: false, wrapperPath: WRAPPER_PATH })).toThrow(/interval-minutes/);
    }
  });

  it('REFUSES to build a command pointing at a MISSING runner', () => {
    // Same accepted-but-unread failure mode the console-reaper registrar guards against: a task
    // whose target does not exist registers happily and then fails silently every interval.
    expect(() => buildCensusSchtasksArgs({ requireRunner: true, runnerPath: 'C:/nope/missing-runner.mjs', wrapperPath: WRAPPER_PATH }))
      .toThrow(/runner not found/);
  });

  it('ACCEPTS the real runner (assert-daemon-census.mjs), which exists', () => {
    expect(() => buildCensusSchtasksArgs({ requireRunner: true, wrapperPath: WRAPPER_PATH })).not.toThrow();
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
