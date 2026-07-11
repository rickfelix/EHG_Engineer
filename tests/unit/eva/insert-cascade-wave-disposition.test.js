import { describe, it, expect } from 'vitest';
import { insertCascade } from '../../../lib/eva/create-orchestrator-from-plan.js';

// QF-20260711-215: the eva auto-cascade direct-INSERT path must route through the
// wave-disposition gate (SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001) — every orchestrator creation
// records a disposition (wave item or explicit no_wave verdict) and stamps roadmap freshness.

/** Minimal supabase fake covering the chains insertCascade + applyWaveDisposition use. */
function fakeSupabase(calls) {
  return {
    from(table) {
      const ctx = { table, op: null, payload: null };
      const chain = {
        select() { ctx.op = ctx.op || 'select'; return chain; },
        insert(payload) { ctx.op = 'insert'; ctx.payload = payload; calls.push({ table, op: 'insert', payload }); return chain; },
        update(payload) { ctx.op = 'update'; ctx.payload = payload; calls.push({ table, op: 'update', payload }); return chain; },
        eq() { return chain; },
        in() { calls.push({ table, op: 'update-in', payload: ctx.payload }); return Promise.resolve({ error: null }); },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        single() { return Promise.resolve({ data: { id: 'item-1', roadmap_id: 'rm-1' }, error: null }); },
        then(resolve) { resolve({ data: [{ id: 'rm-active' }], error: null }); }, // awaited select-eq chains
      };
      return chain;
    },
  };
}

const orchestratorRecord = () => ({
  id: 'orch-uuid-1',
  sd_key: 'SD-TESTFAKE-ORCH-001',
  title: 'Fake orchestrator',
  sd_type: 'orchestrator',
  metadata: { vision_key: 'VIS-1', arch_key: 'ARCH-1' },
});

describe('insertCascade wave-disposition gate (QF-20260711-215)', () => {
  it('rejects a malformed explicit disposition BEFORE any insert', async () => {
    const calls = [];
    const result = await insertCascade({
      supabase: fakeSupabase(calls),
      orchestratorRecord: orchestratorRecord(),
      childRecords: [],
      logger: { log() {}, error() {} },
      waveDisposition: { waveId: 'w-1', noWave: 'both set — invalid' },
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].stage).toBe('wave_disposition');
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0);
  });

  it('auto-records an explicit no_wave verdict on the auto-cascade path (no silent non-disposition)', async () => {
    const calls = [];
    const result = await insertCascade({
      supabase: fakeSupabase(calls),
      orchestratorRecord: orchestratorRecord(),
      childRecords: [],
      logger: { log() {}, error() {} },
    });
    expect(result.errors).toHaveLength(0);
    const sdInsert = calls.find((c) => c.table === 'strategic_directives_v2' && c.op === 'insert');
    expect(sdInsert.payload.metadata.wave_disposition.kind).toBe('no_wave');
    expect(sdInsert.payload.metadata.wave_disposition.reason).toContain('SD-TESTFAKE-ORCH-001');
    // Freshness stamped on active roadmaps (the explicit verdict IS the freshness event).
    const stamp = calls.find((c) => c.table === 'strategic_roadmaps' && c.op === 'update-in');
    expect(stamp).toBeTruthy();
    expect(stamp.payload.updated_at).toBeTruthy();
  });

  it('dry-run performs no disposition writes', async () => {
    const calls = [];
    const result = await insertCascade({
      supabase: fakeSupabase(calls),
      orchestratorRecord: orchestratorRecord(),
      childRecords: [],
      dryRun: true,
      logger: { log() {}, error() {} },
    });
    expect(result.orchestrator._dry_run).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
