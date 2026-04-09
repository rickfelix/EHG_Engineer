/**
 * Integration test for scripts/execute-stop.mjs
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-C (Phase 3)
 *
 * Touches the real Supabase DB:
 *   1. Create a parent claude_sessions row
 *   2. Use Child A's createTeam factory to insert execute_teams + virtual sessions
 *   3. Set execute_teams.supervisor_pid = current process pid (so liveness check passes)
 *   4. Run processTeam from execute-stop.mjs against the team
 *   5. Assert: status transitions, coordination messages emitted, idempotent re-run
 *   6. Stale-pid case: insert team with pid=99999999, assert status=crashed
 *
 * Skipped if SUPABASE_SERVICE_ROLE_KEY is not set.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createTeam } from '../../lib/execute/execute-team-factory.mjs';
import { initState as initCircuitBreaker } from '../../lib/execute/execute-circuit-breaker.mjs';
import { terminateVirtualSession } from '../../lib/virtual-session-factory.mjs';
import { processTeam } from '../../scripts/execute-stop.mjs';

const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_PARENT_SESSION = `test_execute_stop_${Date.now()}`;

// Spawn a long-lived child process whose PID we can safely signal in tests.
// Avoids signaling our own test worker (which kills vitest).
function spawnFakeSupervisor() {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 30000); process.on("SIGTERM", () => process.exit(0))'], {
    detached: false,
    stdio: 'ignore'
  });
  return child;
}

describe.skipIf(!hasServiceKey)('execute-stop integration', () => {
  let supabase;
  const createdTeamIds = [];
  const createdVirtualSessions = [];
  const insertedCoordinationIds = [];
  const spawnedChildren = [];

  beforeAll(async () => {
    supabase = createSupabaseServiceClient();
    const { error } = await supabase.from('claude_sessions').insert({
      session_id: TEST_PARENT_SESSION,
      status: 'active',
      heartbeat_at: new Date().toISOString(),
      hostname: 'execute-stop-integration',
      pid: process.pid,
      metadata: { test_marker: 'execute-stop.integration.test.js' }
    });
    if (error) throw new Error(`Test setup failed: ${error.message}`);
  });

  afterAll(async () => {
    for (const child of spawnedChildren) {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
    for (const teamId of createdTeamIds) {
      await supabase.from('execute_teams').delete().eq('team_id', teamId);
    }
    for (const sid of createdVirtualSessions) {
      await terminateVirtualSession(sid, 'integration_test_cleanup');
      await supabase.from('claude_sessions').delete().eq('session_id', sid);
    }
    await supabase.from('claude_sessions').delete().eq('session_id', TEST_PARENT_SESSION);
    for (const id of insertedCoordinationIds) {
      await supabase.from('session_coordination').delete().eq('id', id);
    }
  });

  test('processTeam stops an active team (signals fake supervisor child)', async () => {
    const fakeSupervisor = spawnFakeSupervisor();
    spawnedChildren.push(fakeSupervisor);
    // Give the child a moment to be alive
    await new Promise(r => setTimeout(r, 100));

    const cbInit = initCircuitBreaker();
    const { teamId, slots, error } = await createTeam({
      supabase,
      spawnedBySession: TEST_PARENT_SESSION,
      workerCount: 2,
      supervisorPid: fakeSupervisor.pid,
      circuitBreakerInit: cbInit
    });
    expect(error).toBeNull();
    createdTeamIds.push(teamId);
    slots.forEach(s => createdVirtualSessions.push(s.virtual_session_id));

    await supabase.from('execute_teams').update({ status: 'active' }).eq('team_id', teamId);

    const { data: team } = await supabase
      .from('execute_teams')
      .select('team_id, status, supervisor_pid, worker_session_ids, metadata, started_at')
      .eq('team_id', teamId)
      .single();

    const result = await processTeam(team, { all: true, gracePeriodSec: 5, force: false, team: null, callsign: null });
    expect(result.action).toBe('signaled');
    expect(result.workersSignaled).toBe(2);

    // Verify status transitioned to stopping
    const { data: after } = await supabase
      .from('execute_teams')
      .select('status, stop_reason')
      .eq('team_id', teamId)
      .single();
    expect(after.status).toBe('stopping');
    expect(after.stop_reason).toBe('manual_stop');

    // Verify STOP_REQUESTED coordination messages exist
    const { data: msgs } = await supabase
      .from('session_coordination')
      .select('id, target_session, message_type')
      .in('target_session', slots.map(s => s.virtual_session_id))
      .eq('message_type', 'STOP_REQUESTED');
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    msgs.forEach(m => insertedCoordinationIds.push(m.id));
  }, 30000);

  test('processTeam is idempotent on stopping team', async () => {
    const fakeSupervisor = spawnFakeSupervisor();
    spawnedChildren.push(fakeSupervisor);
    await new Promise(r => setTimeout(r, 100));

    const cbInit = initCircuitBreaker();
    const { teamId, slots } = await createTeam({
      supabase,
      spawnedBySession: TEST_PARENT_SESSION,
      workerCount: 1,
      supervisorPid: fakeSupervisor.pid,
      circuitBreakerInit: cbInit
    });
    createdTeamIds.push(teamId);
    slots.forEach(s => createdVirtualSessions.push(s.virtual_session_id));

    // Set to stopping directly
    await supabase.from('execute_teams').update({ status: 'stopping', stop_reason: 'pre_existing' }).eq('team_id', teamId);

    const { data: team } = await supabase
      .from('execute_teams')
      .select('team_id, status, supervisor_pid, worker_session_ids, metadata, started_at')
      .eq('team_id', teamId)
      .single();

    const result = await processTeam(team, { all: true, gracePeriodSec: 5, force: false, team: null, callsign: null });
    expect(result.action).toBe('skipped_already_stopping');

    // Verify stop_reason was NOT overwritten
    const { data: after } = await supabase
      .from('execute_teams')
      .select('stop_reason')
      .eq('team_id', teamId)
      .single();
    expect(after.stop_reason).toBe('pre_existing');
  }, 30000);

  test('processTeam marks crashed when supervisor_pid is dead', async () => {
    const cbInit = initCircuitBreaker();
    const { teamId, slots } = await createTeam({
      supabase,
      spawnedBySession: TEST_PARENT_SESSION,
      workerCount: 1,
      supervisorPid: 99999999, // definitely dead
      circuitBreakerInit: cbInit
    });
    createdTeamIds.push(teamId);
    slots.forEach(s => createdVirtualSessions.push(s.virtual_session_id));

    await supabase.from('execute_teams').update({ status: 'active' }).eq('team_id', teamId);

    const { data: team } = await supabase
      .from('execute_teams')
      .select('team_id, status, supervisor_pid, worker_session_ids, metadata, started_at')
      .eq('team_id', teamId)
      .single();

    const result = await processTeam(team, { all: true, gracePeriodSec: 5, force: false, team: null, callsign: null });
    expect(result.action).toBe('marked_crashed');

    const { data: after } = await supabase
      .from('execute_teams')
      .select('status, stop_reason')
      .eq('team_id', teamId)
      .single();
    expect(after.status).toBe('crashed');
    expect(after.stop_reason).toMatch(/supervisor_pid_dead/);
  }, 30000);
});
