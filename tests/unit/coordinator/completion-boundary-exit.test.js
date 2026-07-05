/**
 * Unit tests for the completion-boundary silent-exit surfacing feature.
 * QF-20260705-817
 *
 * Pure detector over injected fixtures + mocked-supabase writer (fail-open + dedup).
 * Mirrors tests/unit/coordinator/inert-worker.test.js's structure/mock conventions.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  completionBoundaryExitDetectorEnabled,
  FLEET_WORKER_STARTUP_PROMPT,
  emitCompletionBoundaryExitAlert,
  runCompletionBoundaryExitSurfacing,
} from '../../../lib/coordinator/coordination-events.cjs';

const NOW = 1_750_000_000_000;

describe('completionBoundaryExitDetectorEnabled', () => {
  it('is OFF by default and ON when flag set', () => {
    expect(completionBoundaryExitDetectorEnabled({})).toBe(false);
    expect(completionBoundaryExitDetectorEnabled({ SURFACE_COMPLETION_BOUNDARY_EXIT_V1: 'false' })).toBe(false);
    expect(completionBoundaryExitDetectorEnabled({ SURFACE_COMPLETION_BOUNDARY_EXIT_V1: 'true' })).toBe(true);
  });
});

function mockSupabase({ dupes = [], insertError = null, throwOn = null }) {
  return {
    from() {
      return {
        select() { return this; }, eq() { return this; }, is() { return this; }, gt() { return this; },
        limit() {
          if (throwOn === 'select') throw new Error('boom-select');
          return Promise.resolve({ data: dupes, error: null });
        },
        insert() {
          if (throwOn === 'insert') throw new Error('boom-insert');
          return { select() { return { single() { return Promise.resolve({ data: insertError ? null : { id: 'new-1' }, error: insertError }); } }; } };
        },
      };
    },
  };
}

describe('emitCompletionBoundaryExitAlert (dedup + fail-open)', () => {
  it('inserts one alert when no live dupe exists, body carries the re-paste prompt', async () => {
    const res = await emitCompletionBoundaryExitAlert(mockSupabase({ dupes: [] }), { exited_count: 2 }, { now: NOW });
    expect(res.ok).toBe(true); expect(res.skipped).toBeUndefined(); expect(res.id).toBe('new-1');
  });
  it('skips insert when an unacknowledged, unexpired alert already exists', async () => {
    const res = await emitCompletionBoundaryExitAlert(mockSupabase({ dupes: [{ id: 'old-1' }] }), { exited_count: 2 }, { now: NOW });
    expect(res.ok).toBe(true); expect(res.skipped).toBe(true); expect(res.id).toBe('old-1');
  });
  it('fail-open on insert error', async () => {
    const res = await emitCompletionBoundaryExitAlert(mockSupabase({ dupes: [], insertError: { message: 'db down' } }), { exited_count: 1 }, { now: NOW });
    expect(res.ok).toBe(false); expect(res.error).toBe('db down');
  });
  it('fail-open when the select throws', async () => {
    const res = await emitCompletionBoundaryExitAlert(mockSupabase({ throwOn: 'select' }), { exited_count: 1 }, { now: NOW });
    expect(res.ok).toBe(false);
  });
  it('reuses the SAME FLEET_WORKER_STARTUP_PROMPT single source of truth', () => {
    expect(FLEET_WORKER_STARTUP_PROMPT).toContain('/loop');
  });
});

describe('runCompletionBoundaryExitSurfacing', () => {
  it('returns null with ZERO I/O when flag is OFF', async () => {
    const sb = { from: vi.fn(() => { throw new Error('should not be called'); }) };
    const res = await runCompletionBoundaryExitSurfacing(sb, { env: {} });
    expect(res).toBeNull();
    expect(sb.from).not.toHaveBeenCalled();
  });
});
