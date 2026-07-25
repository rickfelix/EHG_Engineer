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

  // --- SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 FR-5: `-w new` is a CORRECTNESS requirement ---
  //
  // Bare `wt new-tab` adds a TAB TO AN EXISTING WINDOW, which creates NO new top-level window. FR-4
  // captures the session's window by diffing a before/after enumeration, so without `-w new` that diff
  // sees nothing appear and every capture returns no_new_window -- a correct enumerator that can never
  // fire. It also gives each session its own focusable window; tabs of one window cannot be raised
  // independently, which is what attach/Open needs.
  it('FR-5: every spawn path forces a NEW WINDOW, not a tab on an existing one', () => {
    for (const p of PATHS) {
      const args = p.make().args;
      const wIdx = args.indexOf('-w');
      expect(wIdx, `${p.name} must pass -w`).toBeGreaterThanOrEqual(0);
      expect(args[wIdx + 1], `${p.name} must pass -w new`).toBe('new');
    }
  });

  it('FR-5: -w new PRECEDES the new-tab subcommand (-w is a GLOBAL wt option)', () => {
    // Ordering is not stylistic: `wt new-tab -w new` parses -w as an argument TO new-tab rather than
    // as the window selector, so the window would silently still be a tab.
    for (const p of PATHS) {
      const args = p.make().args;
      const ntIdx = args.indexOf('new-tab');
      if (ntIdx < 0) continue;
      expect(args.indexOf('-w'), `${p.name}: -w must come before new-tab`).toBeLessThan(ntIdx);
    }
  });

  it('FR-5 NEGATIVE control: the contract REJECTS a bare new-tab and a mis-ordered -w', () => {
    const base = (args) => ({ program: 'wt.exe', args, env: {}, persistent: true });
    const claude = 'C:\\x\\claude.cmd';
    // Missing -w new entirely -> a tab, no new window for the enumerator to find.
    const bare = assertLaunchContract(base(['new-tab', '-d', 'R:\\r', '--', claude]));
    expect(bare.ok).toBe(false);
    expect(bare.violations.join(' ')).toMatch(/-w new/);
    // -w AFTER new-tab -> parsed as new-tab's argument; still a tab. Must be caught distinctly.
    const misordered = assertLaunchContract(base(['new-tab', '-w', 'new', '-d', 'R:\\r', '--', claude]));
    expect(misordered.ok).toBe(false);
    expect(misordered.violations.join(' ')).toMatch(/PRECEDE/);
    // A -w with the wrong value is not a new window either.
    expect(assertLaunchContract(base(['-w', '0', 'new-tab', '-d', 'R:\\r', '--', claude])).ok).toBe(false);
  });

  it('profile + auto-resume expectations are enforced when applicable', () => {
    const inv = buildSessionLaunch({ callsign: 'C', profile: 'canary', cwd: 'R:\\r', sdToResume: 'SD-Z' }, { env: { FLEET_ACCOUNT_PROFILES_DIR: 'C:\\p' } });
    expect(assertLaunchContract(inv, { expectProfile: true, expectResume: true }).ok).toBe(true);
  });
});
