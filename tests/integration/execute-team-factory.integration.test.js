/**
 * Integration test for execute-team-factory.mjs
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-A (FR-001, FR-003)
 *
 * Touches the real Supabase DB to validate the createTeam → execute_teams INSERT
 * → virtual session creation → updateTeamStatus → cleanup roundtrip.
 *
 * Skipped if SUPABASE_SERVICE_ROLE_KEY is not set.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import {
  createTeam,
  updateTeamStatus,
  persistCircuitBreaker,
  incrementCounter
} from '../../lib/execute/execute-team-factory.mjs';
import { initState as initCircuitBreaker, recordFailure } from '../../lib/execute/execute-circuit-breaker.mjs';
import { terminateVirtualSession } from '../../lib/virtual-session-factory.mjs';

const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_PARENT_SESSION = `test_execute_team_factory_${Date.now()}`;

describe.skipIf(!hasServiceKey)('execute-team-factory integration', () => {
  let supabase;
  const createdTeamIds = [];
  const createdVirtualSessions = [];

  beforeAll(async () => {
    supabase = createSupabaseServiceClient();
    // Create a synthetic parent session row so virtual session FK resolves.
    // claude_sessions.parent_session_id FK requires the parent to exist.
    const { error } = await supabase.from('claude_sessions').insert({
      session_id: TEST_PARENT_SESSION,
      status: 'active',
      heartbeat_at: new Date().toISOString(),
      hostname: 'integration-test',
      pid: process.pid,
      metadata: { test_marker: 'execute-team-factory.integration.test.js' }
    });
    if (error) throw new Error(`Test setup failed to create parent session: ${error.message}`);
  });

  afterAll(async () => {
    // Clean up created teams + virtual sessions + parent session
    for (const teamId of createdTeamIds) {
      await supabase.from('execute_teams').delete().eq('team_id', teamId);
    }
    for (const sid of createdVirtualSessions) {
      await terminateVirtualSession(sid, 'integration_test_cleanup');
      await supabase.from('claude_sessions').delete().eq('session_id', sid);
    }
    await supabase.from('claude_sessions').delete().eq('session_id', TEST_PARENT_SESSION);
  });

  test('createTeam inserts execute_teams row + N virtual sessions', async () => {
    const cbInit = initCircuitBreaker();
    const { teamId, slots, error } = await createTeam({
      supabase,
      spawnedBySession: TEST_PARENT_SESSION,
      workerCount: 2,
      trackFilter: 'STANDALONE',
      supervisorPid: process.pid,
      preflightResult: {
        ok: true,
        checks: { node_modules: { ok: true }, db: { ok: true }, claim_gate: { ok: true } },
        summary: []
      },
      circuitBreakerInit: cbInit
    });

    expect(error).toBeNull();
    expect(teamId).toBeTruthy();
    expect(slots).toHaveLength(2);
    expect(slots[0].callsign).toBe('Alpha');
    expect(slots[1].callsign).toBe('Bravo');

    createdTeamIds.push(teamId);
    slots.forEach((s) => createdVirtualSessions.push(s.virtual_session_id));

    // Verify row exists with correct structure
    const { data: row } = await supabase
      .from('execute_teams')
      .select('team_id, supervisor_pid, worker_count, status, track_filter, metadata')
      .eq('team_id', teamId)
      .single();

    expect(row.supervisor_pid).toBe(process.pid);
    expect(row.worker_count).toBe(2);
    expect(row.status).toBe('pending_spawn');
    expect(row.track_filter).toBe('STANDALONE');
    expect(row.metadata.slots).toHaveLength(2);
    expect(row.metadata.slots[0].callsign).toBe('Alpha');
    expect(row.metadata.slots[0].color).toBe('blue');
    expect(row.metadata.preflight.node_modules_ok).toBe(true);
    expect(row.metadata.circuit_breaker.failure_threshold).toBe(3);

    // Verify virtual sessions exist
    for (const slot of slots) {
      const { data: vs } = await supabase
        .from('claude_sessions')
        .select('session_id, is_virtual, agent_slot, status')
        .eq('session_id', slot.virtual_session_id)
        .single();
      expect(vs.is_virtual).toBe(true);
      expect(vs.agent_slot).toBe(slot.slot);
      expect(vs.status).toBe('active');
    }
  }, 30000);

  test('updateTeamStatus transitions and stamps stopped_at', async () => {
    const cbInit = initCircuitBreaker();
    const { teamId, slots } = await createTeam({
      supabase,
      spawnedBySession: TEST_PARENT_SESSION,
      workerCount: 1,
      supervisorPid: process.pid,
      preflightResult: null,
      circuitBreakerInit: cbInit
    });
    createdTeamIds.push(teamId);
    slots.forEach((s) => createdVirtualSessions.push(s.virtual_session_id));

    // pending_spawn → active
    await updateTeamStatus(supabase, teamId, 'active');
    let { data: row } = await supabase
      .from('execute_teams').select('status, stopped_at').eq('team_id', teamId).single();
    expect(row.status).toBe('active');
    expect(row.stopped_at).toBeNull();

    // active → stopping (no stopped_at yet)
    await updateTeamStatus(supabase, teamId, 'stopping', { stop_reason: 'integration_test' });
    ({ data: row } = await supabase
      .from('execute_teams').select('status, stop_reason, stopped_at').eq('team_id', teamId).single());
    expect(row.status).toBe('stopping');
    expect(row.stop_reason).toBe('integration_test');
    expect(row.stopped_at).toBeNull();

    // stopping → stopped (stamps stopped_at)
    await updateTeamStatus(supabase, teamId, 'stopped', { stop_reason: 'integration_test' });
    ({ data: row } = await supabase
      .from('execute_teams').select('status, stopped_at').eq('team_id', teamId).single());
    expect(row.status).toBe('stopped');
    expect(row.stopped_at).not.toBeNull();
  }, 30000);

  test('incrementCounter atomically bumps sds_completed', async () => {
    const { teamId, slots } = await createTeam({
      supabase,
      spawnedBySession: TEST_PARENT_SESSION,
      workerCount: 1,
      supervisorPid: process.pid,
      circuitBreakerInit: initCircuitBreaker()
    });
    createdTeamIds.push(teamId);
    slots.forEach((s) => createdVirtualSessions.push(s.virtual_session_id));

    let r = await incrementCounter(supabase, teamId, 'sds_completed');
    expect(r.value).toBe(1);
    r = await incrementCounter(supabase, teamId, 'sds_completed');
    expect(r.value).toBe(2);
    r = await incrementCounter(supabase, teamId, 'sds_failed');
    expect(r.value).toBe(1);

    const { data: row } = await supabase
      .from('execute_teams').select('sds_completed, sds_failed').eq('team_id', teamId).single();
    expect(row.sds_completed).toBe(2);
    expect(row.sds_failed).toBe(1);
  }, 30000);

  test('persistCircuitBreaker preserves other metadata keys', async () => {
    const { teamId, slots } = await createTeam({
      supabase,
      spawnedBySession: TEST_PARENT_SESSION,
      workerCount: 1,
      supervisorPid: process.pid,
      preflightResult: {
        ok: true,
        checks: { node_modules: { ok: true }, db: { ok: true }, claim_gate: { ok: true } },
        summary: []
      },
      circuitBreakerInit: initCircuitBreaker()
    });
    createdTeamIds.push(teamId);
    slots.forEach((s) => createdVirtualSessions.push(s.virtual_session_id));

    let cb = initCircuitBreaker();
    ({ state: cb } = recordFailure(cb));
    await persistCircuitBreaker(supabase, teamId, cb);

    const { data: row } = await supabase
      .from('execute_teams').select('metadata').eq('team_id', teamId).single();
    expect(row.metadata.circuit_breaker.recent_failures).toHaveLength(1);
    // Other metadata keys preserved
    expect(row.metadata.slots).toHaveLength(1);
    expect(row.metadata.preflight).toBeTruthy();
  }, 30000);
});
