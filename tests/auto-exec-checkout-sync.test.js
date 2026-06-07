/**
 * Unit tests (no DB, no real git) for the checkout-sync pilot.
 * SD-LEO-INFRA-POLICY-GATED-AUTO-001D.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  acquireWorkerExclusionLock,
  makeCheckoutSyncAction,
  runCheckoutSyncPilot,
  isEnableEligible,
  ENABLEMENT_CRITERIA,
} from '../lib/auto-exec-checkout-sync.js';
import { completeSyntheticPolicy } from '../lib/auto-exec-engine.js';

const POLICY = completeSyntheticPolicy();

// A fake git runner that records state without touching a real repo.
function fakeGit(initial = 'main@abc') {
  const st = { ref: initial, synced: false, stash: null, wip: 'dirty', failSync: false, failRestore: false };
  return {
    st,
    currentRef: async () => st.ref,
    stashWIP: async () => { st.stash = st.wip; st.wip = null; return 'stash@{0}'; },
    sync: async () => { if (st.failSync) throw new Error('sync failed'); st.synced = true; st.ref = 'main@def'; },
    restoreRef: async (ref) => { if (st.failRestore) throw new Error('restore failed'); st.ref = ref; st.synced = false; },
    unstash: async () => { st.wip = st.stash; st.stash = null; },
  };
}
const lockOk = { workersProbe: async () => ({ ok: true, workers: [] }), acquireAtomic: async () => ({ acquired: true, release: async () => {} }) };

describe('acquireWorkerExclusionLock (FM-E)', () => {
  it('aborts when a live worker is in main', async () => {
    const r = await acquireWorkerExclusionLock({ workersProbe: async () => ({ ok: true, workers: [{ session_id: 'w1' }] }), acquireAtomic: async () => ({ acquired: true }) });
    expect(r).toMatchObject({ acquired: false, reason: 'live_worker_in_main' });
  });
  it('fail-CLOSED when the worker probe could not verify (ok=false)', async () => {
    const r = await acquireWorkerExclusionLock({ workersProbe: async () => ({ ok: false, workers: [] }), acquireAtomic: async () => ({ acquired: true }) });
    expect(r).toMatchObject({ acquired: false, reason: 'worker_probe_unverified' });
  });
  it('fail-closed when the probe throws', async () => {
    const r = await acquireWorkerExclusionLock({ workersProbe: async () => { throw new Error('db down'); }, acquireAtomic: async () => ({ acquired: true }) });
    expect(r).toMatchObject({ acquired: false, reason: 'worker_probe_failed' });
  });
  it('atomic: a second acquire fails while the first holds the primitive', async () => {
    const r = await acquireWorkerExclusionLock({ workersProbe: async () => ({ ok: true, workers: [] }), acquireAtomic: async () => ({ acquired: false }) });
    expect(r).toMatchObject({ acquired: false, reason: 'lock_held' });
  });
  it('acquires + releases when no worker and primitive free', async () => {
    let released = false;
    const r = await acquireWorkerExclusionLock({ workersProbe: async () => ({ ok: true, workers: [] }), acquireAtomic: async () => ({ acquired: true, release: async () => { released = true; } }) });
    expect(r.acquired).toBe(true);
    await r.release();
    expect(released).toBe(true);
  });
});

describe('runCheckoutSyncPilot — default-OFF (FM-PREMATURE)', () => {
  it('flag OFF is a pure no-op: lock never acquired, no sync', async () => {
    const git = fakeGit();
    let probed = false;
    const r = await runCheckoutSyncPilot({
      flagEnabled: false,
      lock: { workersProbe: async () => { probed = true; return { ok: true, workers: [] }; }, acquireAtomic: async () => ({ acquired: true }) },
      action: { git },
    });
    expect(r).toEqual({ status: 'skipped', reason: 'flag_off' });
    expect(probed).toBe(false);        // lock not even probed when OFF
    expect(git.st.synced).toBe(false); // human-gated, no sync
  });
  it('aborts (no sync) when a worker is in main, even with flag ON', async () => {
    const git = fakeGit();
    const r = await runCheckoutSyncPilot({
      flagEnabled: true,
      lock: { workersProbe: async () => ({ ok: true, workers: [{ session_id: 'w1' }] }), acquireAtomic: async () => ({ acquired: true }) },
      action: { git },
      engine: { policy: POLICY },
    });
    expect(r).toMatchObject({ status: 'aborted', reason: 'live_worker_in_main' });
    expect(git.st.synced).toBe(false);
  });
});

describe('checkout-sync action through the engine', () => {
  it('happy path: flag ON + no worker + clean canary → commits the sync, releases lock', async () => {
    const git = fakeGit();
    let released = false;
    const r = await runCheckoutSyncPilot({
      flagEnabled: true,
      lock: { workersProbe: async () => ({ ok: true, workers: [] }), acquireAtomic: async () => ({ acquired: true, release: async () => { released = true; } }) },
      action: { git, getWorkerErrors: async () => [], isWorkerInMain: async () => false },
      engine: { policy: POLICY },
    });
    expect(r.status).toBe('committed');
    expect(git.st.synced).toBe(true);
    expect(released).toBe(true);
  });
  it('TOCTOU: a worker enters main between observe and commit → rollback, no committed sync', async () => {
    const git = fakeGit();
    const r = await runCheckoutSyncPilot({
      flagEnabled: true, lock: lockOk,
      action: { git, getWorkerErrors: async () => [], isWorkerInMain: async () => true },
      engine: { policy: POLICY },
    });
    expect(r).toMatchObject({ status: 'rolled_back', reason: 'toctou_revalidate_failed' });
    expect(git.st.ref).toBe('main@abc'); // restored
    expect(git.st.synced).toBe(false);
  });
  it('actual-harm canary: a worker hook error during the window → rollback', async () => {
    const git = fakeGit();
    const r = await runCheckoutSyncPilot({
      flagEnabled: true, lock: lockOk,
      action: { git, getWorkerErrors: async () => [{ type: 'PreToolUse', error: 'internal error' }], isWorkerInMain: async () => false },
      engine: { policy: POLICY },
    });
    expect(r).toMatchObject({ status: 'rolled_back', reason: 'canary_unhealthy' });
    expect(git.st.ref).toBe('main@abc');
  });
  it('concurrent rollback restores ref + unstashes WIP exactly', async () => {
    const git = fakeGit();
    await runCheckoutSyncPilot({
      flagEnabled: true, lock: lockOk,
      action: { git, getWorkerErrors: async () => [{ error: 'boom' }], isWorkerInMain: async () => false },
      engine: { policy: POLICY },
    });
    expect(git.st.ref).toBe('main@abc');
    expect(git.st.wip).toBe('dirty');   // stash restored
    expect(git.st.stash).toBe(null);
  });
  it('surfaces rollback_failed (not swallowed) when restore throws', async () => {
    const git = fakeGit(); git.st.failRestore = true;
    const r = await runCheckoutSyncPilot({
      flagEnabled: true, lock: lockOk,
      action: { git, getWorkerErrors: async () => [{ error: 'boom' }], isWorkerInMain: async () => false },
      engine: { policy: POLICY },
    });
    expect(r).toMatchObject({ status: 'rollback_failed', killSwitchRecommended: true });
  });
});

describe('isEnableEligible (C5, ships OFF)', () => {
  it('false until all three primitives are proven', () => {
    expect(isEnableEligible({})).toBe(false);
    expect(isEnableEligible({ atomicLockProven: true })).toBe(false);
    expect(isEnableEligible({ atomicLockProven: true, actualHarmCanaryProven: true })).toBe(false);
  });
  it('true only when lock + canary + concurrent rollback all proven', () => {
    expect(isEnableEligible({ atomicLockProven: true, actualHarmCanaryProven: true, concurrentRollbackProven: true })).toBe(true);
  });
  it('documents the operator enablement gate', () => {
    expect(ENABLEMENT_CRITERIA).toMatch(/operator-gated/i);
    expect(ENABLEMENT_CRITERIA).toMatch(/human-gated/i);
  });
});

describe('structural pin (C1): engine is independent of the pilot', () => {
  it('lib/auto-exec-engine.js does NOT import the checkout-sync pilot', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const engineSrc = readFileSync(resolve(here, '../lib/auto-exec-engine.js'), 'utf8');
    expect(engineSrc).not.toMatch(/auto-exec-checkout-sync/);
  });
});
