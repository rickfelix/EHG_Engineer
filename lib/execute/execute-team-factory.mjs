/**
 * execute-team-factory.mjs
 *
 * Team creation + slot identity mapping for /execute multi-session team supervisor.
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-A (FR-003)
 * Source: ARCH-EXECUTE-COMMAND-001 § Implementation Phases > Phase 1
 *
 * Reuses existing infrastructure:
 *   - lib/virtual-session-factory.mjs (createVirtualSession, terminateVirtualSession)
 *   - Fleet identity NATO/COLOR palettes from scripts/assign-fleet-identities.cjs
 *
 * Slot identity persists in execute_teams.metadata.slots[]: callsign and color
 * remain stable across worker respawns; only virtual_session_id changes per spawn.
 */

import { createVirtualSession, terminateVirtualSession } from '../virtual-session-factory.mjs';
import os from 'os';

// NATO callsigns + colors (capped at 8 — supervisor enforces worker_count <= 8)
const NATO = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
const COLORS = ['blue', 'green', 'purple', 'orange', 'cyan', 'pink', 'yellow', 'red'];
export const MAX_WORKERS = 8;

/**
 * Build the slot identity table for a new team.
 * @param {number} workerCount
 * @returns {Array<{slot: number, callsign: string, color: string}>}
 */
export function buildSlotIdentities(workerCount) {
  if (workerCount < 1 || workerCount > MAX_WORKERS) {
    throw new Error(`worker_count must be between 1 and ${MAX_WORKERS}, got ${workerCount}`);
  }
  return Array.from({ length: workerCount }, (_, i) => ({
    slot: i,
    callsign: NATO[i],
    color: COLORS[i]
  }));
}

/**
 * Create a new execute_teams row + virtual claude_sessions for each slot.
 * The team starts in pending_spawn; supervisor moves it to active after first
 * successful worker spawn.
 *
 * @param {Object} opts
 * @param {Object} opts.supabase - Service-role Supabase client
 * @param {string} opts.spawnedBySession - parent claude_sessions.session_id
 * @param {number} opts.workerCount
 * @param {string|null} opts.trackFilter - 'A' | 'B' | 'C' | 'STANDALONE' | null
 * @param {number} opts.supervisorPid
 * @param {Object} [opts.preflightResult] - From execute-preflight.runChecks()
 * @param {Object} [opts.circuitBreakerInit] - From execute-circuit-breaker.initState()
 * @returns {Promise<{teamId: string, slots: Array, error?: string}>}
 */
export async function createTeam({
  supabase,
  spawnedBySession,
  workerCount,
  trackFilter = null,
  supervisorPid,
  preflightResult = null,
  circuitBreakerInit = null
}) {
  const slots = buildSlotIdentities(workerCount);

  // virtual-session-factory needs a non-null parent string to derive its
  // session ID prefix. The execute_teams.spawned_by_session FK column accepts
  // null (ON DELETE SET NULL), but the virtual session ID generator does not.
  // When the supervisor was started outside a real CC session (e.g. cron, test),
  // we synthesize a stable parent string per supervisor PID.
  const parentForVirtualSessions = spawnedBySession || `orphan_supervisor_${supervisorPid}`;

  // Pre-create virtual sessions so we have IDs to put in worker_session_ids[]
  const virtualSessions = [];
  for (const s of slots) {
    const { sessionId, error } = await createVirtualSession({
      parentSessionId: parentForVirtualSessions,
      slot: s.slot,
      sdKey: null
    });
    if (error) {
      // Clean up any virtual sessions already created
      for (const created of virtualSessions) {
        await terminateVirtualSession(created.virtualSessionId, 'execute_team_factory_rollback');
      }
      return { teamId: null, slots: [], error: `Virtual session creation failed for slot ${s.slot}: ${error}` };
    }
    virtualSessions.push({ ...s, virtualSessionId: sessionId });
  }

  const slotsMetadata = virtualSessions.map((s) => ({
    slot: s.slot,
    callsign: s.callsign,
    color: s.color,
    virtual_session_id: s.virtualSessionId
  }));

  const metadata = {
    slots: slotsMetadata,
    preflight: preflightResult ? {
      node_modules_ok: preflightResult.checks.node_modules.ok,
      db_connection_ok: preflightResult.checks.db.ok,
      claim_gate_rpc_ok: preflightResult.checks.claim_gate.ok,
      checked_at: new Date().toISOString()
    } : null,
    circuit_breaker: circuitBreakerInit || { failure_threshold: 3, failure_window_min: 10, recent_failures: [] }
  };

  const { data, error } = await supabase
    .from('execute_teams')
    .insert({
      spawned_by_session: spawnedBySession,
      supervisor_pid: supervisorPid,
      supervisor_hostname: os.hostname(),
      worker_count: workerCount,
      worker_session_ids: virtualSessions.map((s) => s.virtualSessionId),
      status: 'pending_spawn',
      track_filter: trackFilter,
      metadata
    })
    .select('team_id')
    .single();

  if (error) {
    // Roll back virtual sessions
    for (const v of virtualSessions) {
      await terminateVirtualSession(v.virtualSessionId, 'execute_team_factory_rollback');
    }
    return { teamId: null, slots: [], error: `execute_teams insert failed: ${error.message}` };
  }

  return {
    teamId: data.team_id,
    slots: slotsMetadata,
    error: null
  };
}

/**
 * Update team status (idempotent).
 */
export async function updateTeamStatus(supabase, teamId, status, extras = {}) {
  const update = { status, ...extras };
  if (status === 'stopped' || status === 'crashed' || status === 'completed') {
    update.stopped_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from('execute_teams')
    .update(update)
    .eq('team_id', teamId);
  return { error: error?.message };
}

/**
 * Persist updated circuit breaker state into execute_teams.metadata.
 */
export async function persistCircuitBreaker(supabase, teamId, cbState) {
  // Read current metadata then merge (avoids overwriting other keys)
  const { data: row, error: readErr } = await supabase
    .from('execute_teams')
    .select('metadata')
    .eq('team_id', teamId)
    .single();
  if (readErr) return { error: readErr.message };

  const newMetadata = { ...(row.metadata || {}), circuit_breaker: cbState };
  const { error } = await supabase
    .from('execute_teams')
    .update({ metadata: newMetadata })
    .eq('team_id', teamId);
  return { error: error?.message };
}

/**
 * Increment a team counter (sds_completed or sds_failed).
 */
export async function incrementCounter(supabase, teamId, column) {
  if (!['sds_completed', 'sds_failed'].includes(column)) {
    throw new Error(`Invalid counter column: ${column}`);
  }
  const { data: row } = await supabase
    .from('execute_teams')
    .select(column)
    .eq('team_id', teamId)
    .single();
  const newValue = (row?.[column] ?? 0) + 1;
  const { error } = await supabase
    .from('execute_teams')
    .update({ [column]: newValue })
    .eq('team_id', teamId);
  return { error: error?.message, value: newValue };
}
