/**
 * Integration test for lib/execute/team-banner.cjs
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-B (Phase 2 of /execute)
 *
 * Touches the real Supabase DB:
 *   1. Create a parent claude_sessions row
 *   2. Use Child A's createTeam factory to insert execute_teams + virtual sessions
 *   3. Call loadExecuteTeams + printTeam against real data
 *   4. Assert content + clean up
 *
 * Skipped if SUPABASE_SERVICE_ROLE_KEY is not set.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createTeam } from '../../lib/execute/execute-team-factory.mjs';
import { initState as initCircuitBreaker } from '../../lib/execute/execute-circuit-breaker.mjs';
import { terminateVirtualSession } from '../../lib/virtual-session-factory.mjs';

const require = createRequire(import.meta.url);
const banner = require('../../lib/execute/team-banner.cjs');

function bar(pct, width = 10) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round((p / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

function captureLog() {
  const lines = [];
  return {
    log: (s) => lines.push(s == null ? '' : String(s)),
    text: () => lines.join('\n')
  };
}

const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_PARENT_SESSION = `test_team_banner_integration_${Date.now()}`;

describe.skipIf(!hasServiceKey)('team-banner integration', () => {
  let supabase;
  const createdTeamIds = [];
  const createdVirtualSessions = [];

  beforeAll(async () => {
    supabase = createSupabaseServiceClient();
    const { error } = await supabase.from('claude_sessions').insert({
      session_id: TEST_PARENT_SESSION,
      status: 'active',
      heartbeat_at: new Date().toISOString(),
      hostname: 'team-banner-integration',
      pid: process.pid,
      metadata: { test_marker: 'team-banner.integration.test.js' }
    });
    if (error) throw new Error(`Test setup failed: ${error.message}`);
  });

  afterAll(async () => {
    for (const teamId of createdTeamIds) {
      await supabase.from('execute_teams').delete().eq('team_id', teamId);
    }
    for (const sid of createdVirtualSessions) {
      await terminateVirtualSession(sid, 'integration_test_cleanup');
      await supabase.from('claude_sessions').delete().eq('session_id', sid);
    }
    await supabase.from('claude_sessions').delete().eq('session_id', TEST_PARENT_SESSION);
  });

  test('loadExecuteTeams returns shaped data for a real team', async () => {
    const cbInit = initCircuitBreaker();
    const { teamId, slots, error } = await createTeam({
      supabase,
      spawnedBySession: TEST_PARENT_SESSION,
      workerCount: 2,
      trackFilter: 'STANDALONE',
      supervisorPid: process.pid,
      circuitBreakerInit: cbInit
    });
    expect(error).toBeNull();
    expect(teamId).toBeTruthy();
    createdTeamIds.push(teamId);
    slots.forEach(s => createdVirtualSessions.push(s.virtual_session_id));

    // Move team to active so loader picks it up
    await supabase.from('execute_teams').update({ status: 'active' }).eq('team_id', teamId);

    const teams = await banner.loadExecuteTeams(supabase);
    const ourTeam = teams.find(t => t.team_id === teamId);

    expect(ourTeam).toBeTruthy();
    expect(ourTeam.worker_count).toBe(2);
    expect(ourTeam.slots).toHaveLength(2);
    expect(ourTeam.slots[0].callsign).toBe('Alpha');
    expect(ourTeam.slots[0].color).toBe('blue');
    expect(ourTeam.slots[1].callsign).toBe('Bravo');
    expect(ourTeam.slots[1].color).toBe('green');
    // Virtual sessions exist (we just created them)
    expect(ourTeam.slots[0].session_status).toBe('active');
    expect(ourTeam.slots[1].session_status).toBe('active');
  }, 30000);

  test('printTeam renders banner for real team data', async () => {
    const cbInit = initCircuitBreaker();
    const { teamId, slots } = await createTeam({
      supabase,
      spawnedBySession: TEST_PARENT_SESSION,
      workerCount: 1,
      supervisorPid: process.pid,
      circuitBreakerInit: cbInit
    });
    createdTeamIds.push(teamId);
    slots.forEach(s => createdVirtualSessions.push(s.virtual_session_id));
    await supabase.from('execute_teams').update({ status: 'active' }).eq('team_id', teamId);

    const teams = await banner.loadExecuteTeams(supabase);
    const ourTeam = teams.filter(t => t.team_id === teamId);

    const cap = captureLog();
    banner.printTeam(ourTeam, bar, { log: cap.log });
    const text = cap.text();

    expect(text).toContain('/execute team');
    expect(text).toContain('ALPHA');
    expect(text).toContain('Status: active');
    // Box drawing chars
    expect(text).toContain('╔');
    expect(text).toContain('╝');
  }, 30000);

  test('loader filters out stopped teams', async () => {
    const cbInit = initCircuitBreaker();
    const { teamId, slots } = await createTeam({
      supabase,
      spawnedBySession: TEST_PARENT_SESSION,
      workerCount: 1,
      supervisorPid: process.pid,
      circuitBreakerInit: cbInit
    });
    createdTeamIds.push(teamId);
    slots.forEach(s => createdVirtualSessions.push(s.virtual_session_id));

    // Mark stopped — loader should NOT return this team
    await supabase.from('execute_teams').update({ status: 'stopped', stopped_at: new Date().toISOString() }).eq('team_id', teamId);

    const teams = await banner.loadExecuteTeams(supabase);
    const found = teams.find(t => t.team_id === teamId);
    expect(found).toBeUndefined();
  }, 30000);
});
