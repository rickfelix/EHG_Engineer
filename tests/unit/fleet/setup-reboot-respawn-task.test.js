/**
 * SD-LEO-INFRA-LEO-COMPLETION-001-D FR-6 — forked ONSTART/ONLOGON scheduled-task registrar.
 * Pure argv/wrapper builders + parseArgs + a dry-run main that mutates nothing (NO live schtasks call).
 */
import { describe, it, expect } from 'vitest';
import {
  buildRebootSchtasksArgs,
  buildRebootWrapperScript,
  buildRemoveArgs,
  buildQueryArgs,
  parseArgs,
  main,
  TASK_NAME,
  RUNNER_REL_PATH,
} from '../../../scripts/setup-reboot-respawn-task.mjs';

describe('buildRebootSchtasksArgs (FR-6)', () => {
  it('emits /SC ONSTART with /RL HIGHEST, /RU SYSTEM and /F by default', () => {
    const args = buildRebootSchtasksArgs({ wrapperPath: 'C:\\repo\\scripts\\cron\\reboot-respawn-task.cmd' });
    expect(args).toContain('/Create');
    expect(args).toContain('/TN');
    expect(args).toContain(TASK_NAME);
    // /SC ONSTART
    expect(args[args.indexOf('/SC') + 1]).toBe('ONSTART');
    // /RL HIGHEST
    expect(args[args.indexOf('/RL') + 1]).toBe('HIGHEST');
    // /RU SYSTEM
    expect(args[args.indexOf('/RU') + 1]).toBe('SYSTEM');
    // /F for idempotent re-register
    expect(args).toContain('/F');
  });

  it('supports the /SC ONLOGON variant (desktop available for wt.exe)', () => {
    const args = buildRebootSchtasksArgs({ wrapperPath: 'w.cmd', schedule: 'ONLOGON' });
    expect(args[args.indexOf('/SC') + 1]).toBe('ONLOGON');
  });

  it('honors a custom /RU and appends extraArgs', () => {
    const args = buildRebootSchtasksArgs({ wrapperPath: 'w.cmd', runAs: 'FLEET', extraArgs: ['/DELAY', '0000:30'] });
    expect(args[args.indexOf('/RU') + 1]).toBe('FLEET');
    expect(args).toContain('/DELAY');
  });

  it('throws on an unsupported schedule (never silently mis-registers)', () => {
    expect(() => buildRebootSchtasksArgs({ wrapperPath: 'w.cmd', schedule: 'MINUTE' })).toThrow(/ONSTART or ONLOGON/);
  });

  it('throws when wrapperPath is missing', () => {
    expect(() => buildRebootSchtasksArgs({})).toThrow(/wrapperPath required/);
  });
});

describe('buildRebootWrapperScript (FR-6)', () => {
  it('sets the FLEET_SPAWN_CONTROL_LIVE gate, cd\'s to the repo root, and calls the runner entrypoint', () => {
    const cmd = buildRebootWrapperScript({ repoRoot: 'C:\\repo', env: { FLEET_SPAWN_CONTROL_LIVE: 'true' } });
    expect(cmd).toMatch(/^@echo off/);
    expect(cmd).toContain('set FLEET_SPAWN_CONTROL_LIVE=true');
    expect(cmd).toContain('cd /d "C:\\repo"');
    expect(cmd).toContain(`call node ${RUNNER_REL_PATH}`);
    expect(cmd.endsWith('\r\n')).toBe(true);
  });

  it('throws when repoRoot is missing', () => {
    expect(() => buildRebootWrapperScript({})).toThrow(/repoRoot required/);
  });
});

describe('buildRemoveArgs / buildQueryArgs (parity with source module)', () => {
  it('remove uses /Delete /F', () => {
    expect(buildRemoveArgs()).toEqual(['/Delete', '/TN', TASK_NAME, '/F']);
  });
  it('query uses /Query /V /FO LIST', () => {
    expect(buildQueryArgs()).toEqual(['/Query', '/TN', TASK_NAME, '/V', '/FO', 'LIST']);
  });
});

describe('parseArgs (FR-6)', () => {
  it('defaults to register on ONSTART, run-as SYSTEM, inert (live=false)', () => {
    expect(parseArgs(['node', 'x'])).toMatchObject({ mode: 'register', schedule: 'ONSTART', runAs: 'SYSTEM', live: false, dryRun: false });
  });
  it('parses --onlogon, --live, --ru <user>, --dry-run, --remove, --status', () => {
    expect(parseArgs(['node', 'x', '--onlogon', '--live'])).toMatchObject({ schedule: 'ONLOGON', live: true });
    expect(parseArgs(['node', 'x', '--ru', 'FLEET'])).toMatchObject({ runAs: 'FLEET' });
    expect(parseArgs(['node', 'x', '--dry-run'])).toMatchObject({ dryRun: true });
    expect(parseArgs(['node', 'x', '--remove'])).toMatchObject({ mode: 'remove' });
    expect(parseArgs(['node', 'x', '--status'])).toMatchObject({ mode: 'status' });
  });
});

describe('main --dry-run (mutates nothing, no live schtasks)', () => {
  it('prints the wrapper + schtasks argv and returns dry_run_register without writing', async () => {
    const logs = [];
    const logger = { log: (m) => logs.push(String(m)), error: (m) => logs.push(String(m)) };
    const res = await main(['node', 'x', '--onlogon', '--live', '--dry-run'], { platform: 'win32', repoRoot: 'C:\\repo', logger });
    expect(res).toMatchObject({ exitCode: 0, action: 'dry_run_register', schedule: 'ONLOGON', live: true });
    const joined = logs.join('\n');
    expect(joined).toContain('set FLEET_SPAWN_CONTROL_LIVE=true');
    expect(joined).toContain('/SC ONLOGON');
  });

  it('is win32-only: on POSIX it returns not_win32 with a cron fallback note', async () => {
    const logs = [];
    const logger = { log: (m) => logs.push(String(m)), error: (m) => logs.push(String(m)) };
    const res = await main(['node', 'x'], { platform: 'linux', repoRoot: '/repo', logger });
    expect(res).toMatchObject({ exitCode: 2, action: 'not_win32' });
    expect(logs.join('\n')).toMatch(/@reboot/);
  });
});
