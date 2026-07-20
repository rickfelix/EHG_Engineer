/**
 * Tests for the venture freeze guard — SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-C / FR-3
 *
 * A venture with metadata.frozen=true (dogfood-complete / superseded, e.g.
 * venture-1 frozen at S19) must NEVER be advanced (_pollForWork) or unblocked
 * (_checkResolvedBlocks) by the stage-execution worker, regardless of
 * orchestrator_state. Non-frozen ventures must behave exactly as before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StageExecutionWorker, isVentureFrozen } from '../../../lib/eva/stage-execution-worker.js';

vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({ processStage: vi.fn() }));
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn().mockResolvedValue({ acquired: false }),
  releaseProcessingLock: vi.fn().mockResolvedValue({}),
  markCompleted: vi.fn().mockResolvedValue({}),
  ORCHESTRATOR_STATES: { IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked', FAILED: 'failed', COMPLETED: 'completed' },
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(), waitForDecision: vi.fn(),
}));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue(undefined) }));

const silentLogger = { log() {}, warn() {}, error() {} };

// ── isVentureFrozen (pure) ───────────────────────────────────────────────────
describe('isVentureFrozen', () => {
  it('TS-3: true only when metadata.frozen === true', () => {
    expect(isVentureFrozen({ metadata: { frozen: true } })).toBe(true);
  });
  it('TS-3: null-safe — false for missing/empty metadata', () => {
    expect(isVentureFrozen({})).toBe(false);
    expect(isVentureFrozen({ metadata: null })).toBe(false);
    expect(isVentureFrozen({ metadata: {} })).toBe(false);
    expect(isVentureFrozen(null)).toBe(false);
    expect(isVentureFrozen(undefined)).toBe(false);
  });
  it('TS-3: not fooled by truthy non-true values', () => {
    expect(isVentureFrozen({ metadata: { frozen: 'true' } })).toBe(false);
    expect(isVentureFrozen({ metadata: { frozen: 1 } })).toBe(false);
  });
});

// ── _pollForWork excludes frozen ventures ────────────────────────────────────
describe('_pollForWork freeze guard', () => {
  it('TS-1: excludes a frozen idle venture, keeps non-frozen idle ventures', async () => {
    const rows = [
      { id: 'v-frozen', name: 'venture-1', current_lifecycle_stage: 19, metadata: { frozen: true } },
      { id: 'v-normal', name: 'fresh', current_lifecycle_stage: 3, metadata: {} },
      { id: 'v-nullmeta', name: 'nullmeta', current_lifecycle_stage: 5, metadata: null },
    ];
    // fetch-all-paginated (FR-6) appends .order()+.range() and awaits .range();
    // chain is fully chainable with .range() as the resolving terminal.
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const worker = new StageExecutionWorker({ supabase, logger: silentLogger });

    const ready = await worker._pollForWork();
    const ids = ready.map((v) => v.id);
    expect(ids).toContain('v-normal');
    expect(ids).toContain('v-nullmeta'); // null metadata is NOT frozen
    expect(ids).not.toContain('v-frozen');
  });
});

// ── _checkResolvedBlocks skips frozen ventures ───────────────────────────────
describe('_checkResolvedBlocks freeze guard', () => {
  function makeSupabase(blockedRows) {
    const ventureUpdates = [];
    const supabase = {
      ventureUpdates,
      from(table) {
        if (table === 'ventures') {
          let isUpdate = false;
          const builder = {
            select: vi.fn().mockReturnThis(),
            update: vi.fn((payload) => { isUpdate = true; builder._payload = payload; return builder; }),
            // select path: .eq('status').eq('orchestrator_state') is the awaited terminal
            // update path: .eq('id').eq('orchestrator_state') returns {count}
            eq: vi.fn(() => builder),
            then: undefined,
          };
          // select terminal resolves the blocked list; update terminal resolves {count}
          builder.eq = vi.fn(() => {
            if (isUpdate) {
              ventureUpdates.push(builder._payload);
              return Promise.resolve({ count: 1, error: null });
            }
            return builder;
          });
          // Make the select chain awaitable (no .single) -> resolve blocked list.
          // fetch-all-paginated (FR-6) appends .order() then awaits .range().
          builder.then = (resolve) => resolve({ data: blockedRows, error: null });
          builder.order = vi.fn(() => builder);
          builder.range = vi.fn(() => Promise.resolve({ data: blockedRows, error: null }));
          return builder;
        }
        if (table === 'venture_stage_work') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { stage_status: 'completed' }, error: null }),
          };
        }
        if (table === 'chairman_decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // no pending decision
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    return supabase;
  }

  it('TS-2: a frozen blocked venture is NOT unblocked (no update)', async () => {
    const supabase = makeSupabase([
      { id: 'v-frozen', name: 'venture-1', current_lifecycle_stage: 19, metadata: { frozen: true } },
    ]);
    const worker = new StageExecutionWorker({ supabase, logger: silentLogger });
    await worker._checkResolvedBlocks();
    expect(supabase.ventureUpdates).toHaveLength(0); // never updated -> stays blocked
  });

  it('TS-2: a non-frozen blocked venture with completed prev stage IS unblocked', async () => {
    const supabase = makeSupabase([
      { id: 'v-normal', name: 'fresh', current_lifecycle_stage: 5, metadata: {} },
    ]);
    const worker = new StageExecutionWorker({ supabase, logger: silentLogger });
    await worker._checkResolvedBlocks();
    expect(supabase.ventureUpdates).toHaveLength(1);
    expect(supabase.ventureUpdates[0]).toMatchObject({ orchestrator_state: 'idle' });
  });
});
