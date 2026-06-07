/**
 * Pilot op: checkout-sync engine action — SD-LEO-INFRA-POLICY-GATED-AUTO-001D
 * (child of the policy-gated auto-execution engine).
 *
 * Codifies the manually-proven main-checkout deploy-sync as the FIRST REAL action
 * for the 001C engine, behind its OWN default-OFF flag. This is the highest-blast
 * op in the fleet, so it adds two safety primitives on top of the engine loop:
 *
 *  - ATOMIC WORKER-EXCLUSION LOCK (FM-E): the sync only runs when NO live worker is
 *    operating in the main checkout (a mid-build `git checkout` poisons that worker's
 *    PreToolUse hook). Acquire-or-abort + an atomic primitive so two engine runs
 *    cannot sync concurrently. Re-validated immediately before commit (TOCTOU).
 *  - ACTUAL-HARM CANARY (C5): the canary watches the REAL harm signal — worker
 *    PreToolUse/hook errors during the observation window — not a synthetic proxy.
 *
 * Rollback is git stash + preserved branch ref, proven to restore the exact
 * pre-sync state EVEN WHILE a worker is active (the engine surfaces a failed
 * rollback rather than swallowing it).
 *
 * SHIPS DISABLED: the flag defaults OFF and is NOT enable-eligible until the lock,
 * actual-harm canary, and proven concurrent rollback all exist and pass AND an
 * operator reviews them. There is no code path that enables the flag. The engine
 * (001C) never imports this module — the pilot is wired only by its own entry point
 * and ships in its own PR (structural pin enforced by a test).
 *
 * Fully dependency-injected (git runner, db, worker-error source, clock) so every
 * primitive is unit-testable without mutating a real checkout or a live worker.
 */

import { runAutoExec } from './auto-exec-engine.js';

const MAIN_WORKER_TTL_MS = 15 * 60 * 1000;

/**
 * Live workers operating in the MAIN checkout (not an isolated worktree). A worker
 * in main is the harm precondition the lock guards against.
 * @returns {Promise<Array>} live sessions in main (excluding the caller's own session)
 */
export async function liveWorkersInMain(db, { now = Date.now(), selfSession = null, ttlMs = MAIN_WORKER_TTL_MS } = {}) {
  try {
    const { data, error } = await db
      .from('claude_sessions')
      .select('session_id, worktree_path, heartbeat_at, status')
      .eq('status', 'active');
    if (error || !data) return []; // fail-OPEN here is unsafe → caller treats [] as "could not prove empty"? No:
    // NOTE: a read error returns [] which the lock treats as "no workers" — to avoid an
    // unsafe fail-open, acquireWorkerExclusionLock separately requires the query to have
    // succeeded (see `ok`). Here we surface only the rows.
    return data.filter((s) => {
      if (selfSession && s.session_id === selfSession) return false;
      const inMain = !s.worktree_path || /(^|[\\/])EHG_Engineer$/.test(String(s.worktree_path).replace(/[\\/]+$/, ''));
      const fresh = s.heartbeat_at && (now - new Date(s.heartbeat_at).getTime()) < ttlMs;
      return inMain && fresh;
    });
  } catch {
    return [];
  }
}

/**
 * Atomic worker-exclusion lock. Acquire-or-abort:
 *  1. prove NO live worker is in the main checkout (fail-CLOSED on a read error), then
 *  2. acquire an injected atomic primitive (e.g. pg_try_advisory_lock) so two runs
 *     cannot sync concurrently.
 * @param {object} deps {workersProbe(): {ok, workers}, acquireAtomic(): {acquired, release}}
 */
export async function acquireWorkerExclusionLock(deps = {}) {
  const { workersProbe, acquireAtomic } = deps;
  let probe;
  try { probe = await workersProbe(); } catch (e) { return { acquired: false, reason: 'worker_probe_failed', detail: e.message }; }
  if (!probe || probe.ok !== true) return { acquired: false, reason: 'worker_probe_unverified' }; // fail-closed
  if (probe.workers && probe.workers.length > 0) {
    return { acquired: false, reason: 'live_worker_in_main', workers: probe.workers };
  }
  const atomic = await acquireAtomic();
  if (!atomic?.acquired) return { acquired: false, reason: 'lock_held' };
  return { acquired: true, release: atomic.release || (async () => {}) };
}

/**
 * Build the checkout-sync action (engine-action interface). DI over a git runner,
 * a worker-error source (actual-harm canary), and a "is a worker in main now?" probe
 * (TOCTOU re-validate).
 */
export function makeCheckoutSyncAction(deps = {}) {
  const {
    git,
    getWorkerErrors = async () => [],
    isWorkerInMain = async () => false,
  } = deps;
  return {
    action_class: 'checkout_sync',
    target: 'main-checkout/deploy-sync',
    reversible: true,
    rollback_window_ms: 600000,
    outward_facing: false,
    snapshot: async () => ({ ref: await git.currentRef(), stash: await git.stashWIP() }),
    apply: async () => { await git.sync(); },
    rollback: async (snap) => { await git.restoreRef(snap.ref); await git.unstash(snap.stash); },
    // TOCTOU: a worker that entered main between observe and commit invalidates the run.
    validate: async () => !(await isWorkerInMain()),
    // Actual-harm canary: any worker PreToolUse/hook error during the window => unhealthy.
    canaryHealthy: async () => ((await getWorkerErrors()) || []).length === 0,
  };
}

/**
 * Compose the pilot run: acquire the worker-exclusion lock, then run the action
 * through the 001C engine, always releasing the lock. The flag (default-OFF) is
 * honored INSIDE runAutoExec — when OFF the whole thing is a no-op AND we never even
 * acquire the lock (checked first), so the checkout-sync stays human-gated.
 */
export async function runCheckoutSyncPilot(deps = {}) {
  const { flagEnabled = false, lock: lockDeps = {}, engine = {}, action: actionDeps = {} } = deps;

  // Honor the default-OFF flag before touching any lock — flag OFF => pure no-op.
  const enabled = typeof flagEnabled === 'function' ? await flagEnabled() : flagEnabled;
  if (!enabled) return { status: 'skipped', reason: 'flag_off' };

  const lock = await acquireWorkerExclusionLock(lockDeps);
  if (!lock.acquired) return { status: 'aborted', reason: lock.reason, detail: lock.workers ? { workers: lock.workers.length } : lock.detail };
  try {
    const action = makeCheckoutSyncAction(actionDeps);
    return await runAutoExec(action, { flagEnabled: true, ...engine });
  } finally {
    try { await lock.release(); } catch { /* best-effort release */ }
  }
}

/**
 * Enable-eligibility gate (C5). The flag may be enabled ONLY when all three safety
 * primitives are proven. Default-safe: any missing/false proof => NOT eligible.
 */
export function isEnableEligible(proof = {}) {
  return proof.atomicLockProven === true
    && proof.actualHarmCanaryProven === true
    && proof.concurrentRollbackProven === true;
}

export const ENABLEMENT_CRITERIA =
  'Operator-gated: enable ONLY after the atomic worker-exclusion lock, the actual-harm canary ' +
  '(worker PreToolUse/hook errors), and a proven concurrent rollback (git stash + preserved branch ref ' +
  'restoring while a worker is active) are all green AND reviewed. Until then the checkout-sync stays human-gated.';

// ── DB-backed default probe factory (the real wiring; injected so the action stays pure) ──

/** Worker-exclusion probe over claude_sessions. Returns {ok, workers}; ok=false on a read error (fail-closed). */
export function makeWorkersProbe(db, { selfSession = null } = {}) {
  return async () => {
    try {
      const { data, error } = await db
        .from('claude_sessions')
        .select('session_id, worktree_path, heartbeat_at, status')
        .eq('status', 'active');
      if (error || !data) return { ok: false, workers: [] };
      const workers = data.filter((s) => {
        if (selfSession && s.session_id === selfSession) return false;
        const inMain = !s.worktree_path || /(^|[\\/])EHG_Engineer$/.test(String(s.worktree_path).replace(/[\\/]+$/, ''));
        const fresh = s.heartbeat_at && (Date.now() - new Date(s.heartbeat_at).getTime()) < MAIN_WORKER_TTL_MS;
        return inMain && fresh;
      });
      return { ok: true, workers };
    } catch {
      return { ok: false, workers: [] };
    }
  };
}
