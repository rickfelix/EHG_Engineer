/**
 * SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-1 / FR-3.
 *
 * FR-1: resolveProfileDir (both build-session-launch.cjs and spawn-control.js) now recognizes the
 * 'host-default' sentinel (returns null, a deliberate no-isolation choice) and fails loud on a
 * falsy profileName. reboot-respawn-runner.js's per-slot loop CHANGED from fail-soft (a bad/absent
 * profile degraded to profileDir=null and still spawned un-isolated) to fail-loud-but-locally-
 * scoped: skip ONLY the offending slot, every other slot in the same run still gets attempted.
 * spawn-control.js's generic spawn() verb deliberately KEEPS its old fail-soft behavior -- ordinary,
 * non-singleton worker spawns correctly have no account_profile, and that stays byte-identical.
 *
 * FR-3: a boot-window-gated (15min), coordinator-role-only dedup guard was added to the same loop,
 * reusing an injectable coordinatorResolverFn (production default: getActiveCoordinatorId). Adam
 * and Solomon are deliberately untouched -- they already have their own adequate singleton guards.
 */
import { describe, it, expect, vi } from 'vitest';
import { runRebootRespawn } from '../../../lib/fleet/reboot-respawn-runner.js';
import { resolveProfileDir as resolveProfileDirCjs, HOST_DEFAULT_PROFILE as HOST_DEFAULT_CJS } from '../../../lib/fleet/build-session-launch.cjs';
import { resolveProfileDir as resolveProfileDirEsm, HOST_DEFAULT_PROFILE as HOST_DEFAULT_ESM } from '../../../lib/fleet/spawn-control.js';

const baseOpts = { baseDir: 'C:\\profiles' };

describe('resolveProfileDir contract matrix — both implementations agree (TS-13)', () => {
  const impls = [
    ['build-session-launch.cjs', resolveProfileDirCjs, HOST_DEFAULT_CJS],
    ['spawn-control.js', resolveProfileDirEsm, HOST_DEFAULT_ESM],
  ];

  for (const [label, resolveProfileDir, HOST_DEFAULT_PROFILE] of impls) {
    describe(label, () => {
      it('throws on undefined, null, and empty-string profileName (no account intent recorded)', () => {
        expect(() => resolveProfileDir(undefined, baseOpts)).toThrow();
        expect(() => resolveProfileDir(null, baseOpts)).toThrow();
        expect(() => resolveProfileDir('', baseOpts)).toThrow();
      });

      it("returns null (not a path) for the 'host-default' sentinel, even with no baseDir configured", () => {
        expect(resolveProfileDir(HOST_DEFAULT_PROFILE, baseOpts)).toBeNull();
        expect(resolveProfileDir(HOST_DEFAULT_PROFILE, { baseDir: null })).toBeNull();
      });

      it('resolves a normal profile name to a path, unchanged from before this SD', () => {
        expect(resolveProfileDir('canary', baseOpts)).toBe('C:\\profiles\\canary');
      });

      it('still throws on an invalid profile name (path traversal etc.), unchanged from before this SD', () => {
        expect(() => resolveProfileDir('../etc/passwd', baseOpts)).toThrow();
        expect(() => resolveProfileDir('a/b', baseOpts)).toThrow();
      });

      it('still throws when baseDir is unconfigured for a real (non-sentinel) name', () => {
        expect(() => resolveProfileDir('canary', { baseDir: null })).toThrow();
      });
    });
  }
});

describe('reboot-respawn-runner per-slot skip semantics (FR-1) — TS-10, TS-11, TS-12', () => {
  it("TS-11: a slot with account_profile='host-default' spawns normally with no CLAUDE_CONFIG_DIR", async () => {
    const spawnCalls = [];
    const res = await runRebootRespawn({
      supabase: {},
      loadFn: async () => [{ name: 'Adam', role: 'adam', account_profile: 'host-default' }],
      spawnFn: (program, args, env) => { spawnCalls.push(env); return { pid: 1 }; },
      logFn: async () => ({ ok: true }), live: true, sleepFn: vi.fn(),
    });
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]).not.toHaveProperty('CLAUDE_CONFIG_DIR');
    expect(res.results[0]).toMatchObject({ spawned: true, skip_reason: null });
  });

  it('TS-10: a slot with no account_profile at all is skipped, not spawned un-isolated', async () => {
    const spawnFn = vi.fn(() => ({ pid: 1 }));
    const events = [];
    const res = await runRebootRespawn({
      supabase: {},
      loadFn: async () => [{ name: 'Mystery', role: 'worker' }],
      spawnFn, logFn: async (_s, ev) => { events.push(ev); return { ok: true }; }, live: true, sleepFn: vi.fn(),
    });
    expect(spawnFn).not.toHaveBeenCalled();
    expect(res.results[0]).toMatchObject({ spawned: false, invocation: null, skip_reason: 'no_account_profile' });
    expect(events[0].payload).toMatchObject({ outcome: 'skipped_no_account_profile', skip_reason: 'no_account_profile' });
  });

  it('TS-12: a skipped slot does not abort the run — every other slot still gets attempted (isolation)', async () => {
    const spawnCalls = [];
    const res = await runRebootRespawn({
      supabase: {},
      loadFn: async () => [
        { name: 'Broken', role: 'worker' }, // no account_profile -> skipped
        { name: 'Healthy', role: 'worker', account_profile: 'host-default' },
      ],
      spawnFn: (p, a, env) => { spawnCalls.push(env); return { pid: 1 }; },
      logFn: async () => ({ ok: true }), live: true, sleepFn: vi.fn(),
    });
    expect(res.slotCount).toBe(2);
    expect(res.results[0]).toMatchObject({ spawned: false, skip_reason: 'no_account_profile' });
    expect(res.results[1]).toMatchObject({ spawned: true, skip_reason: null });
    expect(spawnCalls).toHaveLength(1); // only Healthy actually spawned
  });
});

describe('reboot-respawn-runner coordinator dedup guard (FR-3) — TS-5, TS-6, TS-7, TS-8, TS-14', () => {
  const coordSlot = { name: 'Coordinator', role: 'coordinator', account_profile: 'host-default' };
  const adamSlot = { name: 'Adam', role: 'adam', account_profile: 'host-default' };
  const solomonSlot = { name: 'Solomon', role: 'solomon', account_profile: 'host-default' };

  async function runWith({ slots, uptimeSeconds, coordinatorResolverFn }) {
    const spawnFn = vi.fn(() => ({ pid: 1 }));
    const res = await runRebootRespawn({
      supabase: {}, loadFn: async () => slots, spawnFn, logFn: async () => ({ ok: true }),
      live: true, sleepFn: vi.fn(),
      uptimeFn: () => uptimeSeconds,
      coordinatorResolverFn,
    });
    return { res, spawnFn };
  }

  it('TS-5: within the 15-minute boot window, the coordinator slot is ALWAYS attempted regardless of a live coordinator', async () => {
    const coordinatorResolverFn = vi.fn(async () => 'some-other-live-session-id');
    const { res, spawnFn } = await runWith({ slots: [coordSlot], uptimeSeconds: 5 * 60, coordinatorResolverFn });
    expect(coordinatorResolverFn).not.toHaveBeenCalled(); // never even consulted inside the window
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(res.results[0]).toMatchObject({ spawned: true, skip_reason: null });
  });

  it('TS-6: outside the boot window, a live coordinator SKIPS the coordinator slot', async () => {
    const coordinatorResolverFn = vi.fn(async () => 'some-other-live-session-id');
    const { res, spawnFn } = await runWith({ slots: [coordSlot], uptimeSeconds: 30 * 60, coordinatorResolverFn });
    expect(coordinatorResolverFn).toHaveBeenCalledTimes(1);
    expect(spawnFn).not.toHaveBeenCalled();
    expect(res.results[0]).toMatchObject({ spawned: false, invocation: null, skip_reason: 'coordinator_already_live' });
  });

  it('TS-7: outside the boot window, NO live coordinator still attempts the slot normally', async () => {
    const coordinatorResolverFn = vi.fn(async () => null);
    const { res, spawnFn } = await runWith({ slots: [coordSlot], uptimeSeconds: 30 * 60, coordinatorResolverFn });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(res.results[0]).toMatchObject({ spawned: true, skip_reason: null });
  });

  it('TS-14: outside the boot window, a resolver that THROWS fails TOWARD attempting the spawn, never toward skipping', async () => {
    const coordinatorResolverFn = vi.fn(async () => { throw new Error('DB unreachable'); });
    const { res, spawnFn } = await runWith({ slots: [coordSlot], uptimeSeconds: 30 * 60, coordinatorResolverFn });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(res.results[0]).toMatchObject({ spawned: true, skip_reason: null });
  });

  it('TS-8: Adam and Solomon slots are NEVER touched by the dedup guard, in every scenario above', async () => {
    for (const uptimeSeconds of [5 * 60, 30 * 60]) {
      for (const coordinatorResolverFn of [
        vi.fn(async () => 'some-live-session-id'),
        vi.fn(async () => null),
        vi.fn(async () => { throw new Error('boom'); }),
      ]) {
        const { res, spawnFn } = await runWith({ slots: [adamSlot, solomonSlot], uptimeSeconds, coordinatorResolverFn });
        expect(spawnFn).toHaveBeenCalledTimes(2);
        expect(res.results.map((r) => r.spawned)).toEqual([true, true]);
        expect(res.results.map((r) => r.skip_reason)).toEqual([null, null]);
      }
    }
  });

  it('a coordinator-dedup skip does not abort the run — Adam/Solomon slots in the SAME run still spawn', async () => {
    const coordinatorResolverFn = vi.fn(async () => 'some-other-live-session-id');
    const { res, spawnFn } = await runWith({
      slots: [coordSlot, adamSlot, solomonSlot], uptimeSeconds: 30 * 60, coordinatorResolverFn,
    });
    expect(res.results[0]).toMatchObject({ spawned: false, skip_reason: 'coordinator_already_live' });
    expect(res.results[1]).toMatchObject({ spawned: true, skip_reason: null });
    expect(res.results[2]).toMatchObject({ spawned: true, skip_reason: null });
    expect(spawnFn).toHaveBeenCalledTimes(2);
  });

  it('uses getActiveCoordinatorId as the DEFAULT resolver when none is injected (production wiring)', async () => {
    // Confirms the lazy CJS import wiring resolves without throwing when the module loads, using
    // the real default -- a supabase stub with no matching rows resolves to null (no live
    // coordinator), so the slot is attempted. This proves the seam is wired, not just injectable.
    const spawnFn = vi.fn(() => ({ pid: 1 }));
    const res = await runRebootRespawn({
      supabase: { from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) },
      loadFn: async () => [coordSlot],
      spawnFn, logFn: async () => ({ ok: true }), live: true, sleepFn: vi.fn(),
      uptimeFn: () => 30 * 60, // outside boot window -> the default resolver IS consulted
    });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(res.results[0].spawned).toBe(true);
  });
});
