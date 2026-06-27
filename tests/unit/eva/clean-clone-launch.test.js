/**
 * Tests for the clean-clone launcher — SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-B
 *
 * Covers the prereq-merge gate (FR-1), idempotency + seed wiring (FR-2), and the
 * dry-run executeStageZero call (FR-3). executeStageZero is injected (spy) so the
 * real Stage-0 pipeline never runs and no live DB writes occur.
 */
import { describe, it, expect, vi } from 'vitest';
import { verifyPrereqsMerged, PREREQ_SD_KEYS } from '../../../lib/eva/clean-clone/prereq-verifier.js';
import { launchCleanClone, DEFAULT_SOURCE_VENTURE_ID, SEEDED_FROM_VENTURE_PATH } from '../../../lib/eva/clean-clone/launch.js';

const silentLogger = { log() {}, warn() {}, error() {} };

/**
 * Table-routed mock supabase.
 * @param {Object} cfg
 * @param {Array} cfg.sdRows  - rows returned for strategic_directives_v2 (.in)
 * @param {Array} cfg.ventureRows - rows returned for ventures (.or/.neq)
 */
function mockSupabase({ sdRows = [], ventureRows = [] } = {}) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        const b = {
          select: () => b,
          in: () => Promise.resolve({ data: sdRows, error: null }),
        };
        return b;
      }
      if (table === 'ventures') {
        const b = {
          select: () => b,
          or: () => b,
          neq: () => Promise.resolve({ data: ventureRows, error: null }),
        };
        return b;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const allCompleted = PREREQ_SD_KEYS.map((sd_key) => ({ sd_key, status: 'completed' }));

// ── FR-1: prereq verifier ────────────────────────────────────────────────────
describe('verifyPrereqsMerged', () => {
  it('TS-1: ok=true when every prereq is completed', async () => {
    const r = await verifyPrereqsMerged(mockSupabase({ sdRows: allCompleted }));
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });
  it('TS-2: ok=false naming a non-completed prereq', async () => {
    const rows = allCompleted.map((r, i) => (i === 0 ? { ...r, status: 'in_progress' } : r));
    const r = await verifyPrereqsMerged(mockSupabase({ sdRows: rows }));
    expect(r.ok).toBe(false);
    expect(r.missing).toContain(PREREQ_SD_KEYS[0]);
  });
  it('TS-2: an absent prereq row counts as missing (status null)', async () => {
    const rows = allCompleted.slice(1); // drop the first key entirely
    const r = await verifyPrereqsMerged(mockSupabase({ sdRows: rows }));
    expect(r.ok).toBe(false);
    expect(r.missing).toContain(PREREQ_SD_KEYS[0]);
    expect(r.statuses[PREREQ_SD_KEYS[0]]).toBeNull();
  });
});

// ── FR-2 / FR-3: launcher orchestration ──────────────────────────────────────
describe('launchCleanClone', () => {
  it('TS-2: aborts before seeding when a prereq is not merged', async () => {
    const rows = allCompleted.map((r, i) => (i === 0 ? { ...r, status: 'draft' } : r));
    const spy = vi.fn();
    const r = await launchCleanClone(
      { dryRun: true },
      { supabase: mockSupabase({ sdRows: rows }), logger: silentLogger, executeStageZero: spy },
    );
    expect(r.ok).toBe(false);
    expect(r.stage).toBe('prereq');
    expect(spy).not.toHaveBeenCalled(); // never seeds
  });

  it('TS-3: idempotent skip when a clone already exists', async () => {
    const spy = vi.fn();
    const existing = { id: 'clone-1', name: 'x (clean clone)', status: 'active', seeded_from_venture_id: DEFAULT_SOURCE_VENTURE_ID, metadata: {} };
    const r = await launchCleanClone(
      { dryRun: true },
      { supabase: mockSupabase({ sdRows: allCompleted, ventureRows: [existing] }), logger: silentLogger, executeStageZero: spy },
    );
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
    expect(r.existing.id).toBe('clone-1');
    expect(spy).not.toHaveBeenCalled(); // no duplicate seed
  });

  it('TS-4: clean state + dry-run calls executeStageZero with the seed path and dryRun=true', async () => {
    const spy = vi.fn().mockResolvedValue({ success: true });
    const r = await launchCleanClone(
      { dryRun: true },
      { supabase: mockSupabase({ sdRows: allCompleted, ventureRows: [] }), logger: silentLogger, executeStageZero: spy },
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const [callParams] = spy.mock.calls[0];
    expect(callParams.path).toBe(SEEDED_FROM_VENTURE_PATH);
    expect(callParams.pathParams.source_venture_id).toBe(DEFAULT_SOURCE_VENTURE_ID);
    expect(callParams.options.dryRun).toBe(true);
    expect(r.seeded).toBe(false); // dry-run never persists
  });

  it('live mode reports the new venture id from executeStageZero', async () => {
    const spy = vi.fn().mockResolvedValue({ success: true, record_id: 'new-venture-99' });
    const r = await launchCleanClone(
      { dryRun: false },
      { supabase: mockSupabase({ sdRows: allCompleted, ventureRows: [] }), logger: silentLogger, executeStageZero: spy },
    );
    expect(spy.mock.calls[0][0].options.dryRun).toBe(false);
    expect(r.newVentureId).toBe('new-venture-99');
    expect(r.seeded).toBe(true);
  });
});
