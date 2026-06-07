/**
 * Auto-execution engine control loop — SD-LEO-INFRA-POLICY-GATED-AUTO-001C
 * (child of the policy-gated auto-execution engine).
 *
 * The loop: flag-gate -> kill-switch -> 001B eligibility gate -> write-before-act
 * audit -> snapshot -> canary apply -> observe -> TOCTOU re-validate ->
 * kill-switch re-check -> commit-or-rollback -> audit + telemetry.
 *
 * SAFETY INVARIANTS (this child ships them as code, not aspirations):
 *  - DEFAULT-OFF (FM-A): when the flag is off the loop is a pure no-op — no
 *    snapshot, no apply, no audit, no DB write. Golden-test asserts byte-identity.
 *  - RELIABLE ROLLBACK (FM-B): any apply/observe/revalidate/commit failure or
 *    unhealthy canary rolls back to the pre-action snapshot. A rollback that
 *    itself fails returns status 'rollback_failed' + killSwitchRecommended — it is
 *    never silently swallowed.
 *  - TOCTOU (FM-E): the loop re-validates the world immediately before commit and
 *    rolls back on any mismatch.
 *  - WRITE-BEFORE-ACT, FAIL-CLOSED AUDIT: intent is recorded before the act; if
 *    the audit write fails the loop aborts WITHOUT acting.
 *  - META-STABILITY: the loop only ever touches the injected action; it never
 *    writes guardrail tables (the leo_engine_ro role + path-overlap guard from
 *    001B make that guarantee enforceable).
 *
 * Runs ONLY against a SYNTHETIC, fully-reversible action here — no real
 * shared-infra op is wired until 001D. The loop is dependency-injected so it is
 * unit-testable without a live DB.
 */

import { decideAutoExecEligibility } from './auto-exec-policy.js';

const resolveMaybe = async (v) => (typeof v === 'function' ? await v() : v);

async function safeAudit(audit, row) {
  // Post-act audits are best-effort (the act already happened / is being undone);
  // they must never throw out of the loop. Write-before-act audit is handled
  // separately and IS fail-closed.
  try { await audit(row); return true; } catch { return false; }
}

/**
 * Run one auto-execution attempt for a synthetic/real action.
 *
 * @param {object} action {action_class, target, reversible, rollback_window_ms,
 *   outward_facing?, snapshot(), apply(), rollback(snap), validate(snap), canaryHealthy(), commit?()}
 * @param {object} deps {flagEnabled, killSwitchActive, policy, forbiddenClasses,
 *   guardrailPaths, audit, sleep, observeWindowMs, emitTelemetry, runId}
 *   flagEnabled / killSwitchActive may be a value or an async function.
 * @returns {Promise<{status:string, ...}>}
 */
export async function runAutoExec(action, deps = {}) {
  const {
    flagEnabled = false,
    killSwitchActive = false,
    policy = null,
    forbiddenClasses = [],
    guardrailPaths,
    audit = async () => {},
    sleep = async () => {},
    observeWindowMs = 0,
    emitTelemetry,
    runId = 'run',
  } = deps;

  // 1. Flag gate — DEFAULT-OFF. Zero side effects when off (golden path).
  if (!(await resolveMaybe(flagEnabled))) {
    return { status: 'skipped', reason: 'flag_off' };
  }

  // 2. Kill-switch at entry. Fail-safe: any error => treat as active (stop).
  let killed;
  try { killed = await resolveMaybe(killSwitchActive); } catch { killed = true; }
  if (killed) return { status: 'aborted', reason: 'kill_switch' };

  const base = { runId, action_class: action?.action_class, target: action?.target };

  // 3. Eligibility (001B gates: reversibility + path-overlap + fail-closed policy).
  const decision = decideAutoExecEligibility(action, { policy, forbiddenClasses, guardrailPaths });
  if (!decision.eligible) {
    await safeAudit(audit, { ...base, phase: 'eligibility', decision, outcome: 'rejected' });
    return { status: 'rejected', gate: decision.gate, reason: decision.reason };
  }

  // 4. Write-before-act audit — FAIL-CLOSED. If we can't record intent, we don't act.
  try {
    await audit({ ...base, phase: 'start', decision, outcome: 'started' });
  } catch (e) {
    return { status: 'aborted', reason: 'audit_write_failed', detail: e.message };
  }

  // 5. Snapshot (no mutation yet → snapshot failure needs no rollback).
  let snapshot;
  try {
    snapshot = await action.snapshot();
  } catch (e) {
    await safeAudit(audit, { ...base, phase: 'snapshot', outcome: 'error', detail: { error: e.message } });
    return { status: 'aborted', reason: 'snapshot_failed', detail: e.message };
  }

  const doRollback = async (reason, phase) => {
    let rolledBack = false; let rbErr = null;
    try { await action.rollback(snapshot); rolledBack = true; } catch (e) { rbErr = e.message; }
    await safeAudit(audit, { ...base, phase, snapshot, outcome: rolledBack ? 'rolled_back' : 'rollback_failed', detail: { reason, rbErr } });
    return rolledBack
      ? { status: 'rolled_back', reason }
      : { status: 'rollback_failed', reason, detail: rbErr, killSwitchRecommended: true };
  };

  // 6. Canary apply (smallest safe scope).
  try { await action.apply(); } catch (e) { return doRollback(`apply_failed:${e.message}`, 'canary'); }

  // 7. Observe window, then check canary health.
  await sleep(observeWindowMs);
  let healthy;
  try { healthy = await action.canaryHealthy(); } catch { healthy = false; }
  if (!healthy) return doRollback('canary_unhealthy', 'observe');

  // 8. TOCTOU: re-validate the world immediately before commit.
  let valid;
  try { valid = await action.validate(snapshot); } catch { valid = false; }
  if (!valid) return doRollback('toctou_revalidate_failed', 'revalidate');

  // 9. Kill-switch re-check before commit (operator may have hit stop mid-observe).
  let killed2;
  try { killed2 = await resolveMaybe(killSwitchActive); } catch { killed2 = true; }
  if (killed2) return doRollback('kill_switch_pre_commit', 'commit');

  // 10. Commit.
  try { if (action.commit) await action.commit(); } catch (e) { return doRollback(`commit_failed:${e.message}`, 'commit'); }
  await safeAudit(audit, { ...base, phase: 'commit', outcome: 'committed' });
  if (emitTelemetry) { try { await emitTelemetry({ ...base, outcome: 'committed' }); } catch { /* telemetry is best-effort */ } }
  return { status: 'committed' };
}

/**
 * In-memory synthetic action — safe, deterministic, fully reversible. Used by the
 * demo CLI, the rollback-rehearsal harness, and unit tests. No real infra.
 */
export function makeSyntheticAction(opts = {}) {
  const state = { value: opts.initial ?? 'A' };
  const ext = { changed: false }; // simulate a concurrent change for TOCTOU tests
  const failAt = opts.failAt ?? null; // 'apply' | 'observe' | 'revalidate' | 'commit'
  return {
    action_class: opts.action_class ?? 'synthetic_toggle',
    target: opts.target ?? 'synthetic/value',
    reversible: true,
    rollback_window_ms: opts.rollback_window_ms ?? 600000,
    outward_facing: false,
    snapshot: () => ({ value: state.value }),
    apply: () => {
      if (failAt === 'apply') throw new Error('synthetic apply failure');
      state.value = opts.next ?? 'B';
    },
    rollback: (snap) => { state.value = snap.value; },
    canaryHealthy: () => failAt !== 'observe',
    validate: () => failAt !== 'revalidate' && !ext.changed,
    commit: () => { if (failAt === 'commit') throw new Error('synthetic commit failure'); },
    // test/inspection helpers (not part of the action contract the loop uses):
    read: () => state.value,
    markExternalChange: () => { ext.changed = true; },
  };
}

/**
 * Rollback-rehearsal harness (FR-3): drive the loop with a synthetic action forced
 * to fail at `failAt` and assert the target is restored to its pre-action value.
 * Returns {failAt, status, restored}. `restored` MUST be true for every phase.
 */
export async function rehearseRollback(failAt, deps = {}) {
  const action = makeSyntheticAction({ failAt });
  const before = action.read();
  const result = await runAutoExec(action, {
    flagEnabled: true,
    killSwitchActive: false,
    policy: completeSyntheticPolicy(),
    forbiddenClasses: [],
    ...deps,
  });
  const after = action.read();
  return { failAt, status: result.status, restored: before === after, result };
}

/** A complete in-memory policy for the synthetic action (all six facets present). */
export function completeSyntheticPolicy() {
  return {
    preconditions: { note: 'synthetic — always eligible' },
    canary: { scope: 'smallest' },
    rollback: { strategy: 'snapshot-restore' },
    blast_radius: { max: 'synthetic-only' },
    observe_window: { ms: 0 },
    escalation: { to: 'operator-email' },
  };
}

// ── DB-backed default factories (the real wiring; injected so the loop stays pure) ──

/** Flag reader: engine flag enabled AND no global feature-flag kill-switch (CONST-009). */
export function makeFlagReader(db, flagKey = 'auto_exec_engine_v1') {
  return async () => {
    try {
      const { data: flag } = await db.from('leo_feature_flags').select('is_enabled').eq('flag_key', flagKey).maybeSingle();
      if (!flag?.is_enabled) return false;
      const { data: ks } = await db.from('leo_kill_switches').select('is_active').eq('switch_key', 'CONST-009').maybeSingle();
      return !ks?.is_active; // global flag kill-switch forces OFF
    } catch {
      return false; // fail-safe: unknown flag state => OFF
    }
  };
}

/** Kill-switch reader for the engine itself. Fail-safe: error => active (stop). */
export function makeKillSwitchReader(db, switchKey = 'auto_exec_engine') {
  return async () => {
    try {
      const { data } = await db.from('leo_kill_switches').select('is_active').eq('switch_key', switchKey).maybeSingle();
      return !!data?.is_active;
    } catch {
      return true;
    }
  };
}

/** Append-only audit writer backed by leo_auto_exec_audit. */
export function makeDbAudit(db, runId) {
  return async (row) => {
    const { error } = await db.from('leo_auto_exec_audit').insert({
      run_id: runId,
      action_class: row.action_class ?? null,
      phase: row.phase ?? null,
      target: row.target ?? null,
      decision: row.decision ?? null,
      snapshot: row.snapshot ?? null,
      outcome: row.outcome ?? null,
      detail: row.detail ?? null,
    });
    if (error) throw new Error(`audit insert failed: ${error.message}`);
  };
}
