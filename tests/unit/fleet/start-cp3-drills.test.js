// SD-LEO-INFRA-LEO-APP-LAUNCHER-001 (FR-4) — worker-startable CP3 drill starter.
import { describe, it, expect, vi } from 'vitest';
import { planDrills, main } from '../../../scripts/fleet/start-cp3-drills.js';
import { LaunchResolveError } from '../../../lib/fleet/build-session-launch.cjs';

const OKENV = { FLEET_ACCOUNT_PROFILES_DIR: 'C:\\fleet\\profiles' };

describe('planDrills — fail-loud precondition + leg plan', () => {
  it('lists the 3 S4-S6 legs with their fleet_verb_* targets when the canary resolves', () => {
    const plan = planDrills({ live: false }, { env: OKENV });
    expect(plan.legs).toHaveLength(3);
    expect(plan.legs.map((l) => l.verb)).toEqual(['fleet_verb_restart', 'fleet_verb_respawn', 'fleet_verb_relaunch_under_profile']);
    expect(plan.canaryProfileDir).toBe('C:\\fleet\\profiles\\canary');
  });
  it('FAILS LOUD when the canary profile cannot resolve (no FLEET_ACCOUNT_PROFILES_DIR)', () => {
    expect(() => planDrills({}, { env: {} })).toThrow(LaunchResolveError);
  });
});

describe('main — worker-startable, dry-run default', () => {
  it('--dry-run (default) lists the legs and spawns/kills NOTHING', async () => {
    const logs = [];
    const r = await main([], { env: OKENV, log: (m) => logs.push(m), runDrills: () => { throw new Error('must not run live in dry-run'); } });
    expect(r.ok).toBe(true);
    expect(r.live).toBe(false);
    expect(r.legs).toHaveLength(3);
    expect(logs.join('\n')).toMatch(/DRY-RUN/);
  });
  it('returns ok:false (fail-loud) when the canary precondition is unmet', async () => {
    const r = await main([], { env: {}, log: () => {} });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/FLEET_ACCOUNT_PROFILES_DIR/);
  });
  it('--live delegates to the (injected) drill runners without the unit spawning', async () => {
    const runDrills = vi.fn(async () => ({ reboot: { ok: true }, u4: { ok: true } }));
    const r = await main(['--live'], { env: OKENV, log: () => {}, runDrills });
    expect(r.ok).toBe(true);
    expect(r.live).toBe(true);
    expect(runDrills).toHaveBeenCalledTimes(1);
  });
});
