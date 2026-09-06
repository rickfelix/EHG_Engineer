// SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001 FR-5 — alarm-cron host task registration.
// Pure argv/content assertions only, mirroring daemon-census-task-registration.test.js's own
// pattern -- no schtasks invocation, no host mutation.

import { describe, it, expect } from 'vitest';
import {
  buildWrapperScript,
  buildHiddenTrAction,
  buildCreateArgs,
  buildRemoveArgs,
  buildQueryArgs,
  verifyHiddenLaunch,
  parseArgs,
  ALARM_TASKS,
  HIDDEN_LAUNCHER_REL_PATH,
} from '../../../scripts/setup-alarm-cron-tasks.mjs';

describe('ALARM_TASKS', () => {
  it('registers exactly the three FR-5 crons, each with a distinct task name and wrapper', () => {
    expect(ALARM_TASKS).toHaveLength(3);
    const names = new Set(ALARM_TASKS.map((t) => t.taskName));
    const wrappers = new Set(ALARM_TASKS.map((t) => t.wrapperRelPath));
    expect(names.size).toBe(3);
    expect(wrappers.size).toBe(3);
  });

  it('every task has a valid HH:MM startTime and a positive interval', () => {
    for (const t of ALARM_TASKS) {
      expect(t.startTime).toMatch(/^\d{2}:\d{2}$/);
      expect(t.intervalMinutes).toBeGreaterThan(0);
    }
  });

  it('the periodic-liveness-watcher task scopes LIVENESS_CLASSES to the non-PID timestamp classes (PID class stays on setup-liveness-watcher-task.mjs)', () => {
    const t = ALARM_TASKS.find((x) => x.script.includes('periodic-liveness-watcher'));
    expect(t.env.LIVENESS_CLASSES).not.toMatch(/claude_sessions_heartbeat/);
    expect(t.env.LIVENESS_CLASSES).toMatch(/self_stamped/);
  });
});

describe('buildWrapperScript', () => {
  it('throws without repoRoot or script', () => {
    expect(() => buildWrapperScript({ script: 'x.mjs' })).toThrow(/repoRoot required/);
    expect(() => buildWrapperScript({ repoRoot: 'C:/repo' })).toThrow(/script required/);
  });

  it('cds into repoRoot before invoking node (schtasks cwd is System32, not the repo)', () => {
    const content = buildWrapperScript({ repoRoot: 'C:/repo', script: 'scripts/fleet-down-alert.mjs' });
    const lines = content.split('\r\n');
    const cdIdx = lines.findIndex((l) => l.includes('cd /d'));
    const nodeIdx = lines.findIndex((l) => l.includes('call node'));
    expect(cdIdx).toBeGreaterThan(-1);
    expect(nodeIdx).toBeGreaterThan(cdIdx);
    expect(content).toMatch(/call node scripts\/fleet-down-alert\.mjs/);
  });

  it('sets env vars ahead of the cd/call lines', () => {
    const content = buildWrapperScript({ repoRoot: 'C:/repo', script: 'x.mjs', env: { FOO: 'bar' } });
    expect(content).toMatch(/set FOO=bar/);
  });
});

describe('buildHiddenTrAction (TR-3, QF-20260904-169; quoting per SECURITY sub-agent finding SEC-2)', () => {
  it('never returns the wrapper path bare — always wraps it in the hidden-window launcher', () => {
    const action = buildHiddenTrAction({ hiddenLauncherPath: 'C:/repo/scripts/cron/run-hidden.vbs', wrapperPath: 'C:/repo/scripts/cron/foo.cmd' });
    expect(action).toBe('wscript.exe //B "C:/repo/scripts/cron/run-hidden.vbs" "C:/repo/scripts/cron/foo.cmd"');
    expect(action).not.toBe('C:/repo/scripts/cron/foo.cmd');
  });

  it('quotes both paths, matching the REAL live-registered EHG EVA Scheduler Watcher task\'s own stored <Arguments> shape', () => {
    // Measured via `schtasks /Query /TN "EHG EVA Scheduler Watcher" /XML`:
    //   <Arguments>//B "C:\...\run-hidden.vbs" "C:\...\eva-watcher-task.cmd"</Arguments>
    const action = buildHiddenTrAction({ hiddenLauncherPath: 'C:\\repo\\scripts\\cron\\run-hidden.vbs', wrapperPath: 'C:\\repo\\scripts\\cron\\foo.cmd' });
    expect(action).toBe('wscript.exe //B "C:\\repo\\scripts\\cron\\run-hidden.vbs" "C:\\repo\\scripts\\cron\\foo.cmd"');
  });

  it('throws without either path', () => {
    expect(() => buildHiddenTrAction({ wrapperPath: 'x' })).toThrow(/hiddenLauncherPath required/);
    expect(() => buildHiddenTrAction({ hiddenLauncherPath: 'x' })).toThrow(/wrapperPath required/);
  });
});

describe('buildCreateArgs', () => {
  const trAction = 'wscript.exe //B "C:/repo/scripts/cron/run-hidden.vbs" "C:/repo/scripts/cron/foo.cmd"';

  it('/TR is the hidden-launch action, never the bare wrapper (regression guard for QF-20260904-169)', () => {
    const args = buildCreateArgs({ taskName: 'T', trAction, intervalMinutes: 15, startTime: '00:11' });
    const trArg = args[args.indexOf('/TR') + 1];
    expect(trArg).toBe(trAction);
    expect(trArg).toMatch(/^wscript\.exe/);
  });

  it('is idempotent (/F) and schedules MINUTE/interval/start-time', () => {
    const args = buildCreateArgs({ taskName: 'T', trAction, intervalMinutes: 15, startTime: '00:11' });
    expect(args).toEqual(expect.arrayContaining(['/F', '/SC', 'MINUTE', '/MO', '15', '/ST', '00:11', '/TN', 'T']));
  });

  it('rejects a missing/invalid interval or start time rather than registering a nonsense cadence', () => {
    expect(() => buildCreateArgs({ taskName: 'T', trAction, intervalMinutes: 0, startTime: '00:11' })).toThrow(/invalid intervalMinutes/);
    expect(() => buildCreateArgs({ taskName: 'T', trAction, intervalMinutes: 15, startTime: 'soon' })).toThrow(/invalid startTime/);
  });

  it('throws without taskName or trAction', () => {
    expect(() => buildCreateArgs({ trAction, intervalMinutes: 15, startTime: '00:11' })).toThrow(/taskName required/);
    expect(() => buildCreateArgs({ taskName: 'T', intervalMinutes: 15, startTime: '00:11' })).toThrow(/trAction required/);
  });
});

describe('buildRemoveArgs / buildQueryArgs', () => {
  it('target the given task name', () => {
    expect(buildRemoveArgs('T')).toEqual(['/Delete', '/TN', 'T', '/F']);
    expect(buildQueryArgs('T')).toEqual(['/Query', '/TN', 'T', '/V', '/FO', 'LIST']);
  });
});

// Real shape, measured via `schtasks /Query /TN "EHG EVA Scheduler Watcher" /XML`: Task
// Scheduler splits a multi-token action into SEPARATE <Command> and <Arguments> elements --
// <Command>wscript.exe</Command> alone, never the whole "wscript.exe //B ..." string.
const REAL_HIDDEN_LAUNCH_XML = '<Task><Actions><Exec><Command>wscript.exe</Command><Arguments>//B "C:\\repo\\scripts\\cron\\run-hidden.vbs" "C:\\repo\\scripts\\cron\\foo.cmd"</Arguments></Exec></Actions><Triggers><Repetition><Interval>PT15M</Interval></Repetition></Triggers></Task>';

describe('verifyHiddenLaunch (reads the OS-returned XML, never our own input; SECURITY sub-agent finding SEC-1)', () => {
  it('passes for a hidden-launch, enabled, repeating task (REAL Command+Arguments split, not a synthetic single-element fixture)', () => {
    expect(verifyHiddenLaunch(REAL_HIDDEN_LAUNCH_XML).ok).toBe(true);
  });

  it('FAILS for a task whose /TR is the bare .cmd — the exact QF-20260904-169 shape', () => {
    const xml = '<Task><Actions><Exec><Command>C:\\repo\\scripts\\cron\\foo.cmd</Command></Exec></Actions><Triggers><Repetition><Interval>PT15M</Interval></Repetition></Triggers></Task>';
    const v = verifyHiddenLaunch(xml);
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/hidden-window launcher/);
  });

  it('FAILS if <Command> is wscript.exe but <Arguments> never names run-hidden.vbs (e.g. a future edit that swaps the launcher)', () => {
    const xml = '<Task><Actions><Exec><Command>wscript.exe</Command><Arguments>//B "C:\\repo\\other-launcher.vbs" "C:\\repo\\foo.cmd"</Arguments></Exec></Actions><Triggers><Repetition><Interval>PT15M</Interval></Repetition></Triggers></Task>';
    const v = verifyHiddenLaunch(xml);
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/run-hidden\.vbs/);
  });

  it('FAILS for a disabled task', () => {
    const xml = REAL_HIDDEN_LAUNCH_XML.replace('</Task>', '<Settings><Enabled>false</Enabled></Settings></Task>');
    expect(verifyHiddenLaunch(xml).ok).toBe(false);
  });

  it('FAILS for a non-repeating task', () => {
    const xml = '<Task><Actions><Exec><Command>wscript.exe</Command><Arguments>//B run-hidden.vbs foo.cmd</Arguments></Exec></Actions></Task>';
    expect(verifyHiddenLaunch(xml).ok).toBe(false);
  });

  it('FAILS (not throws) on empty/absent input', () => {
    expect(verifyHiddenLaunch('').ok).toBe(false);
    expect(verifyHiddenLaunch(null).ok).toBe(false);
  });
});

describe('parseArgs', () => {
  it('defaults to register mode, no dry-run', () => {
    expect(parseArgs(['node', 'script'])).toEqual({ mode: 'register', dryRun: false, help: false });
  });
  it('recognizes each mode flag', () => {
    expect(parseArgs(['node', 'script', '--verify']).mode).toBe('verify');
    expect(parseArgs(['node', 'script', '--status']).mode).toBe('status');
    expect(parseArgs(['node', 'script', '--remove']).mode).toBe('remove');
    expect(parseArgs(['node', 'script', '--dry-run']).dryRun).toBe(true);
  });
});

describe('HIDDEN_LAUNCHER_REL_PATH', () => {
  it('points at the tracked run-hidden.vbs (QF-20260902-191 — must stay tracked)', () => {
    expect(HIDDEN_LAUNCHER_REL_PATH).toMatch(/run-hidden\.vbs$/);
  });
});
