/**
 * Stage-line CLOSURE health — the judgments a stopped venture production line turns on.
 *
 * QF-20260725-697 (LIVE INCIDENT 2026-07-25). The line executed ZERO stages for eleven days
 * (last stage_executions row 2026-07-13T21:18Z, all succeeded) while every health signal in
 * the chain stayed GREEN: eva-scheduler-watcher-cron reported "scheduler alive - no action",
 * software-factory-poll green. Both were telling the truth — they monitor LIVENESS, and the
 * things they watch were alive. Nothing asked whether a stage actually RAN.
 *
 * Liveness answers "is the process up". CLOSURE answers "did the work happen". This module is
 * the second question, kept as pure predicates so the judgment is testable without a live DB
 * or process table.
 *
 * The two failure modes are INDEPENDENT and each is separately actionable, so they are
 * reported separately rather than AND-ed:
 *   workerAbsent — the pidfile names a PID that is not running. The line CANNOT execute.
 *                  This is the 07-13 shape: the supervisor in scripts/start-stage-worker.js
 *                  respawns its CHILD on exit, but nothing supervises the supervisor, so once
 *                  the supervisor process itself is gone the auto-restart is gone with it and
 *                  a stale pidfile is all that remains. (That resolves the QF's open question:
 *                  the watch IS running as designed — its design just cannot survive its own
 *                  host process dying.)
 *   lineSilent   — zero stage_executions in the window. The line DID not execute. Catches the
 *                  worker-looks-alive-but-produces-nothing case that a PID check cannot see.
 *
 * DELIBERATELY NOT GATED ON PENDING-VENTURE COUNT. The obvious formulation is "alarm when zero
 * executions AND ventures sit workflow_status=pending". It was rejected: the ventures table is
 * roughly half unflagged test fixtures — of the 40 active+workflow_status=pending rows verified
 * 2026-07-25, most are TS-fixture, HCGate and Pipeline-Test harness rows carrying
 * is_demo=false, so the flag cannot separate them. Gating on that count makes the probe fire
 * permanently (it is never zero) and so mean nothing. Silence of the execution table is the
 * honest signal; it needs no venture classification to be correct.
 *
 * @module lib/eva/stage-line-closure
 */

/** Default silence tolerated before the line is called stalled. */
export const DEFAULT_SILENT_HOURS = 6;

/**
 * Is the stage worker gone? True only when a pidfile names a PID that is NOT running — the
 * exact stale-pidfile shape of the incident. Fail-QUIET on an unreadable/absent/malformed
 * pidfile and on an unknown liveness result: "we cannot tell" must never be reported as
 * "the worker is dead", or the probe cries wolf on any host that never ran the worker.
 *
 * @param {{pid?: number|string|null, pidAlive?: boolean|null}} input
 *   pid — PID parsed from stage-execution-worker.pid (null/absent when there is no pidfile)
 *   pidAlive — result of checking the live process table (null when it could not be checked)
 * @returns {boolean}
 */
export function isWorkerAbsent({ pid, pidAlive } = {}) {
  const parsed = Number.parseInt(pid, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return false;
  if (pidAlive !== false) return false; // true = alive; null/undefined = unknown, stay quiet
  return true;
}

/**
 * Has the production line gone silent? Pure age comparison against the most recent
 * stage_executions row. A NEVER-executed line (no timestamp at all) is NOT silent — a fresh
 * deployment with an empty table is not a stopped line, and reporting it as one would make the
 * very first green run of a new environment a false alarm.
 *
 * @param {{lastExecutionAt?: string|Date|null, now?: Date, silentHours?: number}} input
 * @returns {boolean}
 */
export function isLineSilent({ lastExecutionAt, now = new Date(), silentHours = DEFAULT_SILENT_HOURS } = {}) {
  if (!lastExecutionAt) return false;
  const last = new Date(lastExecutionAt).getTime();
  if (!Number.isFinite(last)) return false;
  const hours = Number.isFinite(silentHours) && silentHours > 0 ? silentHours : DEFAULT_SILENT_HOURS;
  return now.getTime() - last > hours * 3600_000;
}

/**
 * Combine both probes into one verdict. `healthy` is false when EITHER fires, so a caller
 * that only reads the boolean still cannot miss a stopped line.
 *
 * @returns {{healthy: boolean, workerAbsent: boolean, lineSilent: boolean, reasons: string[]}}
 */
export function classifyStageLine({ pid, pidAlive, lastExecutionAt, now, silentHours } = {}) {
  const workerAbsent = isWorkerAbsent({ pid, pidAlive });
  const lineSilent = isLineSilent({ lastExecutionAt, now, silentHours });
  const reasons = [];
  if (workerAbsent) reasons.push(`worker_absent: pidfile PID ${pid} is not running`);
  if (lineSilent) reasons.push(`line_silent: no stage executed since ${new Date(lastExecutionAt).toISOString()}`);
  return { healthy: !workerAbsent && !lineSilent, workerAbsent, lineSilent, reasons };
}
