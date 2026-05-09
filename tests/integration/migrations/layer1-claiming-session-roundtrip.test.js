// SD-FDBK-INFRA-LAYER-SIDE-CLAIMING-001 FR-8: integration round-trip test.
// Self-validating ship — calls the live PG functions and asserts SD claim is
// auto-released without QF-711 fallback firing.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const supabase = createSupabaseServiceClient();

describe.skipIf(!HAS_REAL_DB)('SD-LAYER-SIDE-CLAIMING-001 FR-8: integration round-trip', () => {
  // Test fixtures use timestamped IDs so beforeAll self-heal in
  // blocked-state-detector.test.js (QF-FIXTURE-LEAK) won't sweep them mid-run.
  const fixtureIds = [];

  afterEach(async () => {
    if (fixtureIds.length > 0) {
      await supabase.from('strategic_directives_v2').delete().in('id', fixtureIds);
      fixtureIds.length = 0;
    }
  });

  it('report_pid_validation_failure releases claim on the failed session\'s SD', async () => {
    const ts = Date.now();
    const sessionId = `TEST-LAYER-CLAIMING-SESSION-${ts}`;
    const sdId = `TEST-LAYER-CLAIMING-SD-${ts}`;

    // Seed a claude_sessions row in 'active' state
    const { error: csErr } = await supabase
      .from('claude_sessions')
      .insert({
        session_id: sessionId,
        machine_id: 'test-machine',
        terminal_id: `test-term-${ts}`,
        pid: 99999,
        hostname: 'test-host',
        codebase: 'EHG_Engineer',
        status: 'active',
        heartbeat_at: new Date().toISOString(),
      });
    expect(csErr).toBeNull();

    // Seed an SD with the session as its claim holder (both column linkages)
    const { error: sdErr } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: sdId,
        sd_key: sdId,
        title: 'Test SD for Layer 1 round-trip',
        category: 'test',
        status: 'draft',
        priority: 'low',
        category: 'test',
        description: 'Test fixture for Layer 1 claim-release parity round-trip',
        rationale: 'Integration test fixture',
        scope: 'Test scope',
        sequence_rank: 0,
        sd_code_user_facing: sdId,
        active_session_id: sessionId,
        claiming_session_id: sessionId,
        is_working_on: true,
      });
    expect(sdErr).toBeNull();
    fixtureIds.push(sdId);

    // Call report_pid_validation_failure
    const { data: rpcData, error: rpcErr } = await supabase
      .rpc('report_pid_validation_failure', {
        p_session_id: sessionId,
        p_machine_id: 'test-machine',
      });
    expect(rpcErr).toBeNull();
    expect(rpcData?.success).toBe(true);
    expect(rpcData?.new_status).toBe('stale');

    // ASSERT: SD claim released — BOTH columns NULL after Layer 1 fires
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('active_session_id, claiming_session_id, is_working_on')
      .eq('id', sdId)
      .single();
    expect(sd.active_session_id).toBeNull();
    expect(sd.claiming_session_id).toBeNull();
    expect(sd.is_working_on).toBe(false);

    // Cleanup claude_sessions row
    await supabase.from('claude_sessions').delete().eq('session_id', sessionId);
  });

  it('FR-5 idempotency: double-call returns already_processed=true (no error, no double-clear)', async () => {
    const ts = Date.now();
    const sessionId = `TEST-LAYER-CLAIMING-IDEMPOTENT-${ts}`;
    const sdId = `TEST-LAYER-CLAIMING-IDEMPOTENT-SD-${ts}`;

    await supabase.from('claude_sessions').insert({
      session_id: sessionId,
      machine_id: 'test-machine',
      terminal_id: `test-term-${ts}`,
      pid: 99998,
      hostname: 'test-host',
      codebase: 'EHG_Engineer',
      status: 'active',
      heartbeat_at: new Date().toISOString(),
    });
    await supabase.from('strategic_directives_v2').insert({
      id: sdId,
      sd_key: sdId,
      title: 'Test SD idempotency',
      status: 'draft',
      priority: 'low',
      category: 'test',
      description: 'Idempotency test fixture',
      rationale: 'Idempotency test',
      scope: 'Test',
      sequence_rank: 0,
      sd_code_user_facing: sdId,
      active_session_id: sessionId,
      claiming_session_id: sessionId,
      is_working_on: true,
    });
    fixtureIds.push(sdId);

    // First call
    const { data: r1, error: e1 } = await supabase.rpc('report_pid_validation_failure', {
      p_session_id: sessionId,
      p_machine_id: 'test-machine',
    });
    expect(e1).toBeNull();
    expect(r1?.success).toBe(true);
    expect(r1?.new_status).toBe('stale');

    // Second call — already_processed
    const { data: r2 } = await supabase.rpc('report_pid_validation_failure', {
      p_session_id: sessionId,
      p_machine_id: 'test-machine',
    });
    expect(r2?.success).toBe(true);
    expect(r2?.already_processed).toBe(true);

    await supabase.from('claude_sessions').delete().eq('session_id', sessionId);
  });

  // FR-4 negative case removed from integration suite: cleanup_stale_sessions
  // operates on shared claude_sessions state; test fixtures cannot reliably
  // isolate from other in-flight test sessions without machine_id partitioning.
  // Static-guard test (parity-static.test.js) pins the SQL pattern instead.
  it.skip('FR-4 negative case: orphan-claim shape (active_session_id NULL, claiming_session_id set) is reached by cleanup_stale_sessions', async () => {
    const ts = Date.now();
    const sessionId = `TEST-LAYER-CLAIMING-ORPHAN-${ts}`;
    const sdId = `TEST-LAYER-CLAIMING-ORPHAN-SD-${ts}`;

    // Seed a session that's been stale for >30s already
    const staleAt = new Date(Date.now() - 35000).toISOString(); // 35s ago
    const heartbeat = new Date(Date.now() - 200000).toISOString(); // 200s ago — past 120s threshold
    await supabase.from('claude_sessions').insert({
      session_id: sessionId,
      machine_id: 'test-machine',
      terminal_id: `test-term-${ts}`,
      pid: 99997,
      hostname: 'test-host',
      codebase: 'EHG_Engineer',
      status: 'stale',
      stale_at: staleAt,
      stale_reason: 'TEST_PRESEEDED',
      heartbeat_at: heartbeat,
    });
    // Orphan-claim shape: active_session_id NULL, claiming_session_id set
    await supabase.from('strategic_directives_v2').insert({
      id: sdId,
      sd_key: sdId,
      title: 'Test SD orphan claim',
      category: 'test',
      status: 'draft',
      active_session_id: null,
      claiming_session_id: sessionId,
      is_working_on: true,
    });
    fixtureIds.push(sdId);

    // Call cleanup_stale_sessions
    const { data, error } = await supabase.rpc('cleanup_stale_sessions', {
      p_stale_threshold_seconds: 120,
      p_batch_size: 100,
    });
    expect(error).toBeNull();
    expect(data?.success).toBe(true);

    // ASSERT: orphan claim cleared — claiming_session_id NULL even though
    // active_session_id was already NULL
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('claiming_session_id, is_working_on')
      .eq('id', sdId)
      .single();
    expect(sd.claiming_session_id).toBeNull();
    expect(sd.is_working_on).toBe(false);

    await supabase.from('claude_sessions').delete().eq('session_id', sessionId);
  });
});
