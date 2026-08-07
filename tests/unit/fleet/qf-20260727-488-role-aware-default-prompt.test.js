/**
 * QF-20260727-488 — role-to-startup-prompt mapping was applied ONLY at the add-session route
 * (server/routes/fleet-actions.js addSession, via resolveRoleSpawnOpts(role)). Every OTHER spawn
 * path — spawn-control.js spawnReplacement() behind restart()/relaunchUnderProfile(), and
 * reboot-respawn-runner.js — fell through to callsign-namespace selection, which classifies any
 * non-canary callsign as 'worker' and hands back the 1406-byte claiming-worker directive
 * regardless of the ROLE the caller declared. relaunching a coordinator/solomon/adam session
 * therefore handed it the self-claiming /loop.
 *
 * THE FIX taught defaultStartupPrompt (spawn-control.js, reboot-respawn-runner.js) this order:
 *   (a) couldBeCanaryCallsign(callsign) -> canary prompt or null. ALWAYS FIRST, UNCONDITIONALLY
 *       WINS — canaries ARE role='worker', so role-keying alone would hand every canary the
 *       claiming directive (startup-prompt-selection.js's own header forbids exactly that).
 *   (b) role is a known non-worker spawnable role (coordinator/solomon/adam) -> that role's
 *       directive.
 *   (c) otherwise -> today's callsign-namespace selection, unchanged.
 * Plus a STRUCTURAL BACKSTOP in buildSessionLaunch (beside the existing canary guard): throw
 * LaunchResolveError when spec.role is a non-worker spawnable role AND startupPrompt is
 * byte-equal to the worker directive — the single funnel every spawner passes through, so a
 * fourth spawner inherits the guarantee.
 *
 * This suite pins the invariant that forbids role-alone keying (a canary must win regardless of
 * what role a caller declares) alongside the positive case (a declared non-worker role gets its
 * own directive on every current path), plus the backstop tripwire itself.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { FLEET_WORKER_STARTUP_PROMPT } = require('../../../lib/coordinator/coordination-events.cjs');

const tmpCwd = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qf488-'));

describe('spawn-control.spawn() — defaultStartupPrompt is role-aware (QF-20260727-488, SITE 1)', () => {
  const { spawn } = require('../../../lib/fleet/spawn-control.js');

  /** Resolves the actual bytes delivered for a given role/callsign, or null if none. */
  const promptFor = async (role, callsign) => {
    const { invocation } = await spawn({ role, callsign }, { live: false, cwd: tmpCwd() });
    if (!invocation.promptFilePath || !fs.existsSync(invocation.promptFilePath)) return null;
    return fs.readFileSync(invocation.promptFilePath, 'utf8');
  };

  it('a canary callsign with role="worker" still gets the CANARY arm, never the worker directive', async () => {
    expect(await promptFor('worker', 'Canary-pilot')).not.toBe(FLEET_WORKER_STARTUP_PROMPT);
  });

  it('a canary callsign gets the CANARY arm even when role="coordinator" — canary wins unconditionally', async () => {
    // THE invariant this QF forbids violating: role-alone keying would deliver '/coordinator
    // start' here. It must not, regardless of what role the caller (wrongly or rightly) declares.
    const prompt = await promptFor('coordinator', 'Canary-pilot');
    expect(prompt).not.toBe(FLEET_WORKER_STARTUP_PROMPT);
    expect(prompt).not.toBe('/coordinator start');
  });

  it('role="coordinator" with a NON-canary callsign gets the coordinator directive, not the worker one', async () => {
    expect(await promptFor('coordinator', 'Alpha-1')).toBe('/coordinator start');
  });

  it('role="solomon" with a NON-canary callsign gets the solomon directive', async () => {
    expect(await promptFor('solomon', 'Alpha-2')).toBe('/solomon');
  });

  it('role="adam" with a NON-canary callsign gets the adam directive', async () => {
    expect(await promptFor('adam', 'Alpha-3')).toBe('/adam');
  });

  it('CONTROL: a plain worker callsign with role="worker" (or no role) still gets today\'s result, unchanged', async () => {
    expect(await promptFor('worker', 'Charlie')).toBe(FLEET_WORKER_STARTUP_PROMPT);
    expect(await promptFor(undefined, 'Charlie')).toBe(FLEET_WORKER_STARTUP_PROMPT);
  });
});

describe('reboot-respawn-runner — defaultStartupPrompt is role-aware (QF-20260727-488, SITE 2)', () => {
  const { runRebootRespawn } = require('../../../lib/fleet/reboot-respawn-runner.js');

  /** Captures the {callsign, role, startupPrompt} the runner resolved for each desired slot. */
  const runFor = async (slots) => {
    const seen = [];
    await runRebootRespawn({
      loadFn: async () => slots,
      rosterFn: (s) => s.map((x) => x.name),
      buildInvocationFn: ({ callsign, role, startupPrompt }) => {
        seen.push({ callsign, role, startupPrompt });
        return { program: 'wt.exe', args: [], env: {}, sessionId: 'sid' };
      },
      live: false, log: () => {}, logFn: () => {},
    });
    return seen;
  };

  it('a canary slot with role="worker" never gets the worker directive', async () => {
    const [canary] = await runFor([{ name: 'Canary-pilot', role: 'worker' }]);
    expect(canary.startupPrompt).not.toBe(FLEET_WORKER_STARTUP_PROMPT);
  });

  it('a canary slot gets the CANARY arm even when role="coordinator" — canary wins unconditionally', async () => {
    const [canary] = await runFor([{ name: 'Canary-pilot', role: 'coordinator' }]);
    expect(canary.startupPrompt).not.toBe(FLEET_WORKER_STARTUP_PROMPT);
    expect(canary.startupPrompt).not.toBe('/coordinator start');
  });

  it('a coordinator slot with a NON-canary name gets the coordinator directive (LATENT until a non-worker slot exists)', async () => {
    const [coord] = await runFor([{ name: 'Coord-1', role: 'coordinator' }]);
    expect(coord.startupPrompt).toBe('/coordinator start');
  });

  it('solomon / adam slots with NON-canary names get their own directives', async () => {
    const [solomon, adam] = await runFor([
      { name: 'Sol-1', role: 'solomon' },
      { name: 'Adam-1', role: 'adam' },
    ]);
    expect(solomon.startupPrompt).toBe('/solomon');
    expect(adam.startupPrompt).toBe('/adam');
  });

  it('CONTROL: a mixed roster still delivers the unchanged worker directive to plain workers', async () => {
    const [worker, noRole] = await runFor([
      { name: 'Worker-1', role: 'worker' },
      { name: 'Worker-2', role: null }, // runner defaults slot.role || 'worker'
    ]);
    expect(worker.startupPrompt).toBe(FLEET_WORKER_STARTUP_PROMPT);
    expect(noRole.startupPrompt).toBe(FLEET_WORKER_STARTUP_PROMPT);
  });
});

describe('buildSessionLaunch F2 — structural backstop refuses a non-worker role carrying the worker directive', () => {
  const { buildSessionLaunch, LaunchResolveError } = require('../../../lib/fleet/build-session-launch.cjs');

  it('THROWS for role="coordinator" + the byte-equal worker directive', () => {
    expect(() => buildSessionLaunch({
      role: 'coordinator', callsign: 'Alpha-1', cwd: tmpCwd(), startupPrompt: FLEET_WORKER_STARTUP_PROMPT,
    })).toThrow(LaunchResolveError);
  });

  it('THROWS for role="solomon" and role="adam" too', () => {
    expect(() => buildSessionLaunch({
      role: 'solomon', callsign: 'Alpha-2', cwd: tmpCwd(), startupPrompt: FLEET_WORKER_STARTUP_PROMPT,
    })).toThrow(LaunchResolveError);
    expect(() => buildSessionLaunch({
      role: 'adam', callsign: 'Alpha-3', cwd: tmpCwd(), startupPrompt: FLEET_WORKER_STARTUP_PROMPT,
    })).toThrow(LaunchResolveError);
  });

  it('CONTROL: does NOT throw for a legitimate worker spawn carrying the worker directive', () => {
    expect(() => buildSessionLaunch({
      role: 'worker', callsign: 'Alpha-4', cwd: tmpCwd(), startupPrompt: FLEET_WORKER_STARTUP_PROMPT,
    })).not.toThrow();
    // Absent role defaults to 'worker' throughout this module — must not throw either.
    expect(() => buildSessionLaunch({
      callsign: 'Alpha-5', cwd: tmpCwd(), startupPrompt: FLEET_WORKER_STARTUP_PROMPT,
    })).not.toThrow();
  });

  it('CONTROL: does NOT throw when a non-worker role carries its OWN directive', () => {
    expect(() => buildSessionLaunch({
      role: 'coordinator', callsign: 'Alpha-6', cwd: tmpCwd(), startupPrompt: '/coordinator start',
    })).not.toThrow();
  });

  it('CONTROL: does NOT throw for an unknown/non-spawnable role, even carrying the worker directive', () => {
    // The backstop is keyed on isSpawnableRole, not "any string that is not literally worker" —
    // narrower than that would risk refusing a legitimate future role before it is allowlisted.
    expect(() => buildSessionLaunch({
      role: 'not-a-real-role', callsign: 'Alpha-7', cwd: tmpCwd(), startupPrompt: FLEET_WORKER_STARTUP_PROMPT,
    })).not.toThrow();
  });
});
