/**
 * lib/fleet/window-visibility-writer.js — SD-LEO-INFRA-SESSIONS-PAGE-TRUE-001-A (FR-2, FR-3).
 *
 * Durable, ATOMIC truth for window visibility on claude_sessions.metadata, plus the owner identity
 * the hide guard needs. Deliberately a copy of lib/fleet/attention-flag-writer.js's seam — same
 * table, same key column, same `metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb` merge via
 * the raw pg client.
 *
 * WHY REUSE RATHER THAN INVENT. The SD's spine asserted that every claude_sessions metadata write in
 * the repo is read-spread-write, and used that to justify designing a new mechanism. That is FALSE:
 * six atomic RPCs already exist (set_coordinator_flag, set_session_working_signal,
 * set_session_working_context, set_adam_flag, set_solomon_flag, create_or_replace_session) plus this
 * raw-pg merge. The atomicity REQUIREMENT stands — a read-spread-write here would silently drop a
 * concurrent writer's field — but the justification did not, so this is a third caller of a proven
 * seam rather than a third mechanism.
 *
 * *** THE OWNER PID PERSISTED HERE IS NEVER A KILL TARGET. READ THIS BEFORE USING IT. ***
 * window_owner_pid is the pid of the process that owns the WINDOW — on this host, one shared
 * WindowsTerminal host serving ALL NINE seats (measured: 9 visible terminal windows, 1 owning pid;
 * by contrast 9 cmd windows had 9 distinct pids, so this is a terminal-architecture property, not a
 * general one). Handing it to taskkill /T /F would terminate every seat at once. The per-seat
 * process is claude_sessions.pid, which is a DIFFERENT process and is what the kill paths already
 * use, cross-checked against the SessionStart marker pid and pidIsClaude. Before this SD no window-
 * owning pid existed anywhere in the session row; this file is what makes one reachable, which is
 * why the field is namespaced window_owner_* and why a test asserts no kill path references it.
 */
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

/** The metadata keys this module owns. Exported so tests and readers share one spelling. */
export const WINDOW_VISIBLE_KEY = 'window_visible';
export const WINDOW_OWNER_KEYS = Object.freeze(['window_owner_pid', 'window_owner_proc', 'window_owner_start_ticks']);

/** One atomic partial merge. Shared by both writers so the seam cannot drift between them. */
async function mergeSessionMetadata(sessionId, patch, opts = {}) {
  const { createClientFn = createDatabaseClient } = opts;
  let client;
  try {
    client = await createClientFn('engineer', { verify: false });
  } catch (connErr) {
    return { ok: false, sessionId, error: `db_connect_failed: ${connErr.message}` };
  }
  try {
    const result = await client.query(
      `UPDATE claude_sessions
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE session_id = $1`,
      [sessionId, JSON.stringify(patch)]
    );
    return { ok: result.rowCount > 0, sessionId };
  } catch (queryErr) {
    return { ok: false, sessionId, error: queryErr.message };
  } finally {
    try { await client.end(); } catch { /* best-effort close */ }
  }
}

/**
 * Record the INTENDED visibility of a session's window.
 *
 * This is an INTENTION, not an observation of the world. It is written after a verified
 * hide/show, and reconciliation (FR-6) is what compares it against reality — in BOTH directions,
 * because hidden windows are enumerable (measured: 312 of 348 top-level windows on this host were
 * hidden and still enumerable; they are excluded only by this repo's own IsWindowVisible predicate).
 */
export async function setWindowVisible(sessionId, { visible, by } = {}, opts = {}) {
  if (!sessionId || typeof sessionId !== 'string') throw new Error('setWindowVisible: sessionId is required');
  if (typeof visible !== 'boolean') throw new Error('setWindowVisible: visible must be a boolean');
  if (!by || typeof by !== 'string') throw new Error('setWindowVisible: by is required');
  const patch = {
    [WINDOW_VISIBLE_KEY]: visible,
    window_visible_set_at: new Date().toISOString(),
    window_visible_set_by: by,
  };
  const r = await mergeSessionMetadata(sessionId, patch, opts);
  return { written: r.ok, sessionId, ...(r.error ? { error: r.error } : {}) };
}

/**
 * Persist the window's OWNER IDENTITY at capture time: pid + process name + process START TIME.
 *
 * All three are required together and start time is the load-bearing one — owning-pid equality is
 * TRUE for every fleet window on this host, so a pid-only guard passes in exactly the recycled-
 * handle case it exists to catch. Start time is what defeats pid recycling.
 *
 * See the module header: window_owner_pid is NEVER a valid kill target.
 */
export async function setWindowOwner(sessionId, { pid, procName, startTicks } = {}, opts = {}) {
  if (!sessionId || typeof sessionId !== 'string') throw new Error('setWindowOwner: sessionId is required');
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('setWindowOwner: pid must be a positive integer');
  if (!procName || !/^[\w.-]+$/.test(String(procName))) throw new Error('setWindowOwner: procName is required and must be a bare process name');
  if (!/^\d+$/.test(String(startTicks ?? ''))) throw new Error('setWindowOwner: startTicks is required (process start time, digits only)');
  const patch = {
    window_owner_pid: pid,
    window_owner_proc: String(procName),
    window_owner_start_ticks: String(startTicks),
    window_owner_captured_at: new Date().toISOString(),
  };
  const r = await mergeSessionMetadata(sessionId, patch, opts);
  return { written: r.ok, sessionId, ...(r.error ? { error: r.error } : {}) };
}

/**
 * Read owner identity back into the shape setWindowVisibility() expects, or null when incomplete.
 *
 * HANDLE-LESS AND OWNER-LESS ARE BOTH MULTI-SHAPED. metadata.window_handle can be ABSENT (the spawn
 * session-bind loop never found a fresh row, so the update was never issued), present-but-null, or
 * present alongside handle_capture_failed:true. A falsy check alone misses a case, so callers get
 * null here and must refuse rather than proceed on a partial identity.
 */
export function readWindowOwner(metadata) {
  const m = metadata || {};
  const pid = m.window_owner_pid;
  const procName = m.window_owner_proc;
  const startTicks = m.window_owner_start_ticks;
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (!procName || typeof procName !== 'string') return null;
  if (!startTicks || !/^\d+$/.test(String(startTicks))) return null;
  return { pid, procName, startTicks: String(startTicks) };
}

/**
 * Classify why a session cannot be hidden. Returns null when it CAN be.
 *
 * Refuse what cannot be proven restorable: hiding a window whose handle or owner identity is
 * unknown is permanently unrecoverable through the normal path, because the only way back is the
 * unfiltered restore sweep (FR-7).
 */
export function classifyHideRefusal(metadata) {
  const m = metadata || {};
  if (m.handle_capture_failed === true) return 'handle_capture_failed';
  if (!('window_handle' in m)) return 'window_handle_absent';
  if (m.window_handle === null || m.window_handle === undefined) return 'window_handle_null';
  if (!Number.isFinite(Number(m.window_handle)) || Number(m.window_handle) === 0) return 'window_handle_invalid';
  if (!readWindowOwner(m)) return 'window_owner_identity_incomplete';
  return null;
}
