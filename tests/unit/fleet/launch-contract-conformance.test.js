// SD-LEO-INFRA-LEO-APP-LAUNCHER-001 (FR-3) — per-path launch-contract CONFORMANCE.
// The durable tripwire: EVERY fleet spawn path must route through the canonical buildSessionLaunch and
// satisfy the launch contract (full claude.cmd + explicit -d cwd + PERSISTENT wt.exe + CLAUDE_CONFIG_DIR
// when profiled + auto-resume). REDS the moment any path diverges — reverts to bare `claude`, headless
// `-p`, or drops the explicit cwd (the divergences that produced the 2-day CP3 stall + the ghost session).
import { describe, it, expect } from 'vitest';
import { buildLiveSpawnInvocation } from '../../../lib/fleet/spawn-control.js';
import { buildSpawnInvocation } from '../../../scripts/fleet/worker-spawn-executor.cjs';
import { buildSessionLaunch, assertLaunchContract } from '../../../lib/fleet/build-session-launch.cjs';

// name + a factory returning the invocation that path produces (reboot-respawn uses buildLiveSpawnInvocation).
const PATHS = [
  { name: 'spawn-control.buildLiveSpawnInvocation', make: () => buildLiveSpawnInvocation({ role: 'worker', callsign: 'C', cwd: 'R:\\r' }) },
  { name: 'spawn-control + reboot-respawn (resume)', make: () => buildLiveSpawnInvocation({ callsign: 'C', resumeUuid: 'u-1', cwd: 'R:\\r' }) },
  { name: 'worker-spawn-executor.buildSpawnInvocation', make: () => buildSpawnInvocation('C', 'the /loop prompt') },
  { name: 'buildSessionLaunch (direct / CP3 drill launcher)', make: () => buildSessionLaunch({ callsign: 'C', cwd: 'R:\\r', sdToResume: 'SD-Z' }) },
];

describe('launch-contract conformance — every spawn path routes through buildSessionLaunch', () => {
  for (const p of PATHS) {
    it(`${p.name} satisfies the launch contract`, () => {
      const inv = p.make();
      const r = assertLaunchContract(inv);
      expect(r.violations, `${p.name}: ${r.violations.join('; ')}`).toEqual([]);
      expect(inv.program).toBe('wt.exe');       // persistent tab, not headless/bare claude
      expect(inv.persistent).toBe(true);
      expect(inv.args).not.toContain('-p');      // never headless -p/--print
      expect(inv.args[inv.args.indexOf('-d') + 1]).toBeTruthy(); // explicit cwd start-dir
      expect(inv.args[inv.args.indexOf('--') + 1]).toMatch(/claude(\.cmd|\.exe)?$/i); // resolved claude token
    });
  }

  it('NEGATIVE control: old-style headless / no-cwd invocations FAIL the contract (the tripwire bites)', () => {
    expect(assertLaunchContract({ program: 'claude', args: ['-p', 'prompt'], env: {}, persistent: false }).ok).toBe(false);
    expect(assertLaunchContract({ program: 'wt.exe', args: ['new-tab', '--', 'claude'], env: {}, persistent: true }).ok).toBe(false); // missing -d cwd
  });

  it('profile + auto-resume expectations are enforced when applicable', () => {
    const inv = buildSessionLaunch({ callsign: 'C', profile: 'canary', cwd: 'R:\\r', sdToResume: 'SD-Z' }, { env: { FLEET_ACCOUNT_PROFILES_DIR: 'C:\\p' } });
    expect(assertLaunchContract(inv, { expectProfile: true, expectResume: true }).ok).toBe(true);
  });
});
