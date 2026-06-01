/**
 * SD-LEO-INFRA-HARDEN-S19-S20-001 — worker-level enforcement tests that drive the REAL methods
 * (the existing stage-execution-worker-advancement.test.js replicates _advanceStage inline and does
 * NOT exercise the real method, per the prospective testing-agent). Covers FR-3 (_advanceStage S19
 * choke-point: TS-6/7/8 + null fall-through + noop-empty + non-S19 short-circuit) and FR-5
 * (_emitS19HardGateEvent dual-write payload+details, no event_data).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({ processStage: vi.fn() }));
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn(), releaseProcessingLock: vi.fn(), markCompleted: vi.fn(),
  ORCHESTRATOR_STATES: { IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked', FAILED: 'failed', KILLED_AT_REALITY_GATE: 'killed_at_reality_gate' },
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({ createOrReusePendingDecision: vi.fn(), waitForDecision: vi.fn() }));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({ checkAutonomy: vi.fn().mockResolvedValue({ action: 'block', level: 'L0' }) }));
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn().mockResolvedValue({ isBlocking: () => false, isReview: () => false }),
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

/**
 * Thenable chainable supabase fake: `await chain` (after .eq) resolves { data: <per-table>, error };
 * .maybeSingle/.single resolve the same; .insert/.upsert/.update are tracked. This lets the REAL
 * _advanceStage run its side-effect chain against benign data while we assert the FR-3 outcome.
 */
function makeSupabase({ sdRows = [{ id: 'sd1', status: 'draft' }], ventureRow = { build_model: 'leo_bridge' }, stageWork = { advisory_data: {} } } = {}) {
  const calls = { venturesUpdate: 0, systemEvents: [], stageWorkUpserts: [] };
  const from = (table) => {
    const terminalData =
      table === 'strategic_directives_v2' ? sdRows :
      table === 'ventures' ? ventureRow :
      table === 'venture_stage_work' ? stageWork : null;
    const chain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      gt: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: terminalData, error: null }),
      single: async () => ({ data: terminalData, error: null }),
      upsert: async (row) => { if (table === 'venture_stage_work') calls.stageWorkUpserts.push(row); return { data: null, error: null }; },
      insert: async (row) => { if (table === 'system_events') calls.systemEvents.push(row); return { data: null, error: null }; },
      update: () => { if (table === 'ventures') calls.venturesUpdate += 1; return chain; },
      then: (resolve) => resolve({ data: terminalData, error: null }),
    };
    return chain;
  };
  return { from, calls };
}

function makeWorker(supabase, { buildComplete } = {}) {
  const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
  // Neutralise the heavy non-FR-3 side-effects of the advance path so we isolate the guard.
  worker._logStageTransition = vi.fn().mockResolvedValue(undefined);
  worker._runPostStageHooks = vi.fn().mockResolvedValue(undefined);
  if (buildComplete !== undefined) {
    worker._isLeoBridgeBuildComplete = vi.fn().mockResolvedValue(buildComplete);
  }
  return worker;
}

describe('_advanceStage S19 choke-point (FR-3) — real method', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TS-6: REFUSES an untrusted from-S19 advance of an incomplete leo_bridge venture (tree exists)', async () => {
    const supabase = makeSupabase({ sdRows: [{ id: 'sd1', status: 'draft' }] });
    const worker = makeWorker(supabase, { buildComplete: false });

    const r = await worker._advanceStage('v-1', 19, 20, { advancementType: 'pre_exec_skip' });

    expect(supabase.calls.venturesUpdate).toBe(0);            // current_lifecycle_stage NOT written
    expect(r && r.blocked).toBe(true);
    const ev = supabase.calls.systemEvents.at(-1);
    expect(ev.event_type).toBe('S19_HARD_GATE_BLOCK');
    expect(ev.payload.reason).toBe('advance_stage_choke_point');
    expect(ev.payload.sd_count).toBe(1);
    expect(ev).not.toHaveProperty('event_data');             // FR-5: never the non-existent column
  });

  it('TS-7: trusted marker (s19_bridge_cleared) advances and never queries completeness', async () => {
    const supabase = makeSupabase();
    const worker = makeWorker(supabase);
    worker._isLeoBridgeBuildComplete = vi.fn(); // spy — must NOT be called

    await worker._advanceStage('v-1', 19, 20, { advancementType: 's19_bridge_cleared' });

    expect(worker._isLeoBridgeBuildComplete).not.toHaveBeenCalled();
    expect(supabase.calls.venturesUpdate).toBe(1);
  });

  it('TS-8: fails OPEN (advances) + emits a system_events alarm when the evaluator throws', async () => {
    const supabase = makeSupabase();
    const worker = makeWorker(supabase);
    worker._isLeoBridgeBuildComplete = vi.fn().mockRejectedValue(new Error('db down'));

    await worker._advanceStage('v-1', 19, 20, { advancementType: 'pre_exec_skip' });

    expect(supabase.calls.venturesUpdate).toBe(1);           // advanced (fail-open)
    const ev = supabase.calls.systemEvents.at(-1);
    expect(ev.event_type).toBe('S19_HARD_GATE_ADVANCE');
    expect(ev.payload.reason).toBe('choke_point_eval_error_failopen');
  });

  it('non-leo_bridge (buildComplete===null) falls through and advances — null is never blocked', async () => {
    const supabase = makeSupabase({ ventureRow: { build_model: 'seeded_repo' } });
    const worker = makeWorker(supabase, { buildComplete: null });

    await worker._advanceStage('v-1', 19, 20, { advancementType: 'pre_exec_skip' });

    expect(supabase.calls.venturesUpdate).toBe(1);
    expect(supabase.calls.systemEvents.length).toBe(0);       // no block event
  });

  it('noop-empty (buildComplete===false but 0 SDs) advances — the infinite-hold guard', async () => {
    const supabase = makeSupabase({ sdRows: [] });             // 0 SDs => nothing built
    const worker = makeWorker(supabase, { buildComplete: false });

    await worker._advanceStage('v-1', 19, 20, { advancementType: 'pre_exec_skip' });

    expect(supabase.calls.venturesUpdate).toBe(1);
    expect(supabase.calls.systemEvents.length).toBe(0);
  });

  it('fromStage!==19 short-circuits: no completeness query, no blast radius on other stages', async () => {
    const supabase = makeSupabase();
    const worker = makeWorker(supabase);
    worker._isLeoBridgeBuildComplete = vi.fn();

    await worker._advanceStage('v-1', 10, 11, { advancementType: 'normal' });

    expect(worker._isLeoBridgeBuildComplete).not.toHaveBeenCalled();
    expect(supabase.calls.venturesUpdate).toBe(1);
  });
});

describe('_emitS19HardGateEvent (FR-5)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dual-writes the body to BOTH payload and details, with no event_data column', async () => {
    const supabase = makeSupabase();
    const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });

    await worker._emitS19HardGateEvent('v-9', 'S19_HARD_GATE_BLOCK', { build_complete: false, bridge_outcome: 'zero_sds_failure', reason: 's19_sd_completion_invariant', decided_by: 'fr1_entry_hard_gate' });

    const ev = supabase.calls.systemEvents.at(-1);
    expect(ev.event_type).toBe('S19_HARD_GATE_BLOCK');
    expect(ev.venture_id).toBe('v-9');
    expect(ev.payload).toEqual(ev.details);                   // dual-write
    expect(ev.payload.build_model).toBe('leo_bridge');
    expect(ev.payload.from_stage).toBe(19);
    expect(ev.payload.bridge_outcome).toBe('zero_sds_failure');
    expect(typeof ev.idempotency_key).toBe('string');
    expect(ev.idempotency_key.startsWith('S19_HARD_GATE_BLOCK:v-9:')).toBe(true);
    expect(ev).not.toHaveProperty('event_data');
  });

  it('is non-fatal: a system_events insert failure does not throw', async () => {
    const supabase = { from: () => ({ insert: async () => { throw new Error('boom'); } }) };
    const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
    await expect(worker._emitS19HardGateEvent('v-1', 'S19_HARD_GATE_ADVANCE', {})).resolves.toBeUndefined();
  });
});
