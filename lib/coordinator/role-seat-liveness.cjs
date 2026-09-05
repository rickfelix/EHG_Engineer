'use strict';
/**
 * Role-seat process liveness — shared by the Adam and Solomon singleton guards.
 *
 * WHY THIS EXISTS (measured 2026-09-05 08:29Z on the live Adam restart): the singleton guards
 * classify a prior seat as FRESH purely from claude_sessions.heartbeat_at (10-minute window) plus
 * tool activity. When the chairman closes a seat and immediately opens its successor, the prior's
 * heartbeat is seconds old, so the successor is REFUSED for up to 10 minutes even though the
 * prior's Claude Code process (pid 57172) was already gone from the process table. The guard had
 * no signal that could tell "closed 27 seconds ago" from "alive".
 *
 * SOUNDNESS — ONE DIRECTION ONLY. `process.kill(pid, 0)` throwing ESRCH PROVES the process is
 * gone. Its NOT throwing proves nothing (Windows recycles PIDs; EPERM means "exists, not ours").
 * This helper therefore only ever answers "provably dead" (true) or "cannot say" (false); a false
 * result falls back to the heartbeat classification unchanged. It can never make a live seat read
 * as dead, only a dead seat read as dead sooner. Same contract as lib/fleet/console-reaper.mjs
 * ("sound ONLY as a negative") and lib/fleet/claimant-liveness.cjs.
 *
 * FAIL-CLOSED INPUT GUARDS (each returns false, i.e. "cannot say"):
 *   - row.hostname must equal THIS host — a PID is only meaningful on the host that owns it.
 *   - row.pid must be a positive integer.
 *   - row.pid must equal metadata.cc_pid (or cc_parent_pid): the row's pid must be the Claude Code
 *     process itself, never a child node pid that dies routinely while the seat lives on.
 *   - the probe must return ESRCH specifically; EPERM, EINVAL or any other error is "unknown".
 */
const os = require('node:os');

/** @returns {'ALIVE'|'ESRCH'|'UNKNOWN'} */
function probeEsrch(pid) {
  try { process.kill(pid, 0); return 'ALIVE'; }
  catch (err) { return err && err.code === 'ESRCH' ? 'ESRCH' : 'UNKNOWN'; }
}

/**
 * True iff the seat's Claude Code process is PROVABLY gone on this host.
 * @param {{hostname?: string, pid?: number|string, metadata?: object}} row a claude_sessions row
 * @param {{hostname?: string, probe?: (pid:number)=>string}} [opts] seams for tests
 * @returns {boolean}
 */
function isSeatProcessDead(row, { hostname = os.hostname(), probe = probeEsrch } = {}) {
  if (!row || typeof row !== 'object') return false;
  if (typeof row.hostname !== 'string' || !hostname) return false;
  if (row.hostname.toLowerCase() !== String(hostname).toLowerCase()) return false;
  const pid = Number(row.pid);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const cc = meta.cc_pid !== undefined && meta.cc_pid !== null ? meta.cc_pid : meta.cc_parent_pid;
  if (cc === undefined || cc === null || Number(cc) !== pid) return false;
  try { return probe(pid) === 'ESRCH'; } catch { return false; }
}

module.exports = { isSeatProcessDead, probeEsrch };
