/**
 * CLI integration test for the observe-vs-enforce mode switch — the core
 * enforcement contract (AC-5). Spawns the real CLI so a regression in the
 * mode gating (log-only vs block) fails loudly instead of silently.
 * SD-LEO-INFRA-COST-TOKEN-GOVERNANCE-001 (FR-5, TESTING follow-up)
 *
 * Runs without a DB — the governor-log writer fails OPEN when the table is
 * absent, so these assertions cover the decision/mode path, not persistence.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '../../../scripts/cost-governor.mjs');

function runGovernor(extraArgs) {
  return spawnSync(process.execPath, [CLI, '--simulate-storm', '--target', 'eva:cli-test', '--count', '25', ...extraArgs], {
    encoding: 'utf8',
    timeout: 60000,
  });
}

describe('cost-governor CLI observe/enforce switch (AC-5)', () => {
  it('OBSERVE mode (default): a storm is logged, NOT blocked — exit 0', () => {
    const r = runGovernor([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/THROTTLE \[observe\]/);
    expect(r.stdout).toMatch(/observe-only/i);
    expect(r.stdout).not.toMatch(/UV_HANDLE_CLOSING/); // no libuv abort on clean exit
  });

  it('ENFORCE mode (--enforce): the same storm is blocked — exit 1 + ENFORCED', () => {
    const r = runGovernor(['--enforce']);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/THROTTLE \[enforce\]/);
    expect(r.stdout).toMatch(/ENFORCED/);
  });

  it('below-threshold count ALLOWs even in enforce mode — exit 0', () => {
    const r = spawnSync(process.execPath, [CLI, '--simulate-storm', '--target', 'eva:cli-test', '--count', '3', '--enforce'], {
      encoding: 'utf8', timeout: 60000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/ALLOW/);
  });
});
