/**
 * Tests for stage-execution-worker._canAutoAdvance (FR-3 + FR-4 decision matrix)
 * SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 FR-6.
 *
 * Validates the unified governance decision logic across:
 *   - master toggle (global_auto_proceed)
 *   - kill/promotion gates (kill_stages + promotion_stages from stage_config — Layer 2)
 *   - per-stage override (stage_overrides[stage_n].auto_proceed false/true) — Layer 3
 *   - review-mode default-pause (S7/S8/S9/S11) unless explicit opt-in — Layer 4
 *
 * Closes empirical witness: NameSignal venture 57e2645a-... blocked at S8 BMC
 * because review-mode default-pause path was race-dependent.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';
import { _resetCacheForTest } from '../../../lib/eva/stage-governance.js';

const V2_FIXTURE = [
  { stage_number: 3,  gate_type: 'kill',      review_mode: 'auto'   },
  { stage_number: 5,  gate_type: 'kill',      review_mode: 'auto'   },
  { stage_number: 6,  gate_type: 'none',      review_mode: 'auto'   },
  { stage_number: 7,  gate_type: 'none',      review_mode: 'review' },
  { stage_number: 8,  gate_type: 'none',      review_mode: 'review' },
  { stage_number: 9,  gate_type: 'none',      review_mode: 'review' },
  { stage_number: 10, gate_type: 'promotion', review_mode: 'auto'   },
  { stage_number: 11, gate_type: 'none',      review_mode: 'review' },
  { stage_number: 13, gate_type: 'kill',      review_mode: 'auto'   },
  { stage_number: 16, gate_type: 'promotion', review_mode: 'auto'   },
  { stage_number: 17, gate_type: 'promotion', review_mode: 'auto'   },
  { stage_number: 23, gate_type: 'kill',      review_mode: 'auto'   },
  { stage_number: 24, gate_type: 'promotion', review_mode: 'auto'   },
  { stage_number: 25, gate_type: 'promotion', review_mode: 'auto'   },
  { stage_number: 26, gate_type: 'none',      review_mode: 'auto'   },
];

function mockSupabase({ global_auto_proceed = true, stage_overrides = {} } = {}) {
  const stageConfigReader = vi.fn(async () => ({ data: V2_FIXTURE, error: null }));
  const cdcReader = vi.fn(async () => ({ data: { global_auto_proceed, stage_overrides }, error: null }));

  return {
    from: vi.fn((table) => {
      if (table === 'stage_config') {
        return { select: () => ({ order: stageConfigReader }) };
      }
      if (table === 'chairman_dashboard_config') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: cdcReader }),
          }),
        };
      }
      return { select: () => ({}) };
    }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(function (cb) { cb?.('SUBSCRIBED'); return this; }),
      unsubscribe: vi.fn(),
    })),
  };
}

function makeWorker(supabase) {
  return new StageExecutionWorker({
    supabase,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
}

describe('worker._canAutoAdvance (unified governance)', () => {
  beforeEach(() => { _resetCacheForTest(); });

  describe('L1: master toggle', () => {
    test('master=false blocks every stage', async () => {
      const w = makeWorker(mockSupabase({ global_auto_proceed: false }));
      expect(await w._canAutoAdvance(6)).toBe(false);  // plain
      expect(await w._canAutoAdvance(8)).toBe(false);  // review
      expect(await w._canAutoAdvance(3)).toBe(false);  // kill
    });
  });

  describe('L2: kill / promotion gates (NEVER overrideable)', () => {
    test('kill gate blocks even with stage_override.auto_proceed=true', async () => {
      const w = makeWorker(mockSupabase({
        stage_overrides: { stage_3: { auto_proceed: true } },
      }));
      expect(await w._canAutoAdvance(3)).toBe(false);
    });

    test('promotion gate blocks even with stage_override.auto_proceed=true', async () => {
      const w = makeWorker(mockSupabase({
        stage_overrides: { stage_16: { auto_proceed: true } },
      }));
      expect(await w._canAutoAdvance(16)).toBe(false);  // S16 Issue B audit fix
    });

    test('all kill gates block by default', async () => {
      const w = makeWorker(mockSupabase());
      for (const s of [3, 5, 13, 23]) {
        expect(await w._canAutoAdvance(s)).toBe(false);
      }
    });

    test('all promotion gates block by default', async () => {
      const w = makeWorker(mockSupabase());
      for (const s of [10, 16, 17, 24, 25]) {
        expect(await w._canAutoAdvance(s)).toBe(false);
      }
    });
  });

  describe('L3: per-stage explicit pause (auto_proceed=false)', () => {
    test('explicit pause blocks a non-review stage', async () => {
      const w = makeWorker(mockSupabase({
        stage_overrides: { stage_6: { auto_proceed: false, reason: 'paused' } },
      }));
      expect(await w._canAutoAdvance(6)).toBe(false);
    });

    test('explicit pause blocks a review stage too', async () => {
      const w = makeWorker(mockSupabase({
        stage_overrides: { stage_8: { auto_proceed: false } },
      }));
      expect(await w._canAutoAdvance(8)).toBe(false);
    });
  });

  describe('L4: review-mode default-pause (FR-4 — the NameSignal bug fix)', () => {
    test('review-mode stage with NO override blocks (default-pause)', async () => {
      const w = makeWorker(mockSupabase());
      for (const s of [7, 8, 9, 11]) {
        expect(await w._canAutoAdvance(s)).toBe(false);
      }
    });

    test('review-mode stage with auto_proceed=true opt-in advances', async () => {
      const w = makeWorker(mockSupabase({
        stage_overrides: { stage_8: { auto_proceed: true, set_by: 'chairman' } },
      }));
      expect(await w._canAutoAdvance(8)).toBe(true);  // NameSignal mechanical unblock
    });

    test('all review stages support opt-in', async () => {
      const w = makeWorker(mockSupabase({
        stage_overrides: {
          stage_7: { auto_proceed: true },
          stage_8: { auto_proceed: true },
          stage_9: { auto_proceed: true },
          stage_11: { auto_proceed: true },
        },
      }));
      for (const s of [7, 8, 9, 11]) {
        expect(await w._canAutoAdvance(s)).toBe(true);
      }
    });
  });

  describe('Default path (plain stages, no override)', () => {
    test('non-review, non-gate stage with master on advances by default', async () => {
      const w = makeWorker(mockSupabase());
      for (const s of [6, 26]) {
        expect(await w._canAutoAdvance(s)).toBe(true);
      }
    });
  });
});
