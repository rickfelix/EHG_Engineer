/**
 * QF-20260704-609 — retroactive venture-capture backlog drain.
 *
 * The venture-capture-completeness gauge read a flat, non-zero uncaptured
 * count (55+ items) with zero drainage: forward capture (SD-LEO-INFRA-CAPTURE-
 * FORWARD-GATE-001) works and its gauge works, but nothing consumes the
 * backlog. drainCaptureBacklog() reuses the EXACT shipped per-stage capture
 * path (captureVentureStage) for every missing (venture, stage) pair across
 * all active ventures -- no second extraction implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drainCaptureBacklog, getMissingStages } from '../../../lib/eva/venture-capture-forward.js';

function createMockDb({ ventures = [], snapshotsByVenture = {}, upsertShouldFailFor = null } = {}) {
  const upsertCalls = [];

  // Generic no-op chainable for every table the per-stage sub-extractors query
  // (chairman_decisions, venture_artifacts, assumption_sets, venture_revenue_entries,
  // etc.) -- mirrors the existing venture-capture-forward.test.js convention.
  const genericChainable = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'gte', 'lte']) {
    genericChainable[method] = vi.fn().mockReturnValue(genericChainable);
  }
  genericChainable.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  genericChainable.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);

  return {
    upsertCalls,
    from: vi.fn((table) => {
      if (table === 'ventures') {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          order: vi.fn(() => chain),
          range: vi.fn(() => chain), // fetchAllPaginated (FR-6) paginates the ventures read
          then: (resolve) => Promise.resolve({ data: ventures, error: null }).then(resolve),
        };
        return chain;
      }
      if (table === 'venture_capture_snapshots') {
        let ventureId;
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn((col, val) => {
            if (col === 'venture_id') ventureId = val;
            return chain;
          }),
          gte: vi.fn(() => chain),
          lte: vi.fn(() => chain),
          then: (resolve) =>
            Promise.resolve({ data: snapshotsByVenture[ventureId] || [], error: null }).then(resolve),
          single: vi.fn(() => {
            if (upsertShouldFailFor && upsertShouldFailFor === ventureId) {
              return Promise.resolve({ data: null, error: { message: 'upsert failed' } });
            }
            const row = upsertCalls[upsertCalls.length - 1];
            return Promise.resolve({
              data: { id: 'snap-id', venture_id: row.venture_id, lifecycle_stage: row.lifecycle_stage },
              error: null,
            });
          }),
          upsert: vi.fn((row) => {
            ventureId = row.venture_id;
            upsertCalls.push(row);
            return chain;
          }),
        };
        return chain;
      }
      return genericChainable;
    }),
  };
}

describe('getMissingStages', () => {
  it('returns the specific missing stage numbers, not just a count', async () => {
    const db = createMockDb({ snapshotsByVenture: { v1: [{ lifecycle_stage: 15 }, { lifecycle_stage: 17 }] } });
    const missing = await getMissingStages(db, { id: 'v1', current_lifecycle_stage: 18 }, { minStage: 15 });
    expect(missing).toEqual([16, 18]);
  });

  it('returns an empty array when the venture has not reached minStage', async () => {
    const db = createMockDb();
    const missing = await getMissingStages(db, { id: 'v2', current_lifecycle_stage: 10 }, { minStage: 15 });
    expect(missing).toEqual([]);
  });
});

describe('drainCaptureBacklog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('captures every missing stage across all active ventures via the shipped per-stage path', async () => {
    const db = createMockDb({
      ventures: [
        { id: 'v1', name: 'Venture One', current_lifecycle_stage: 17 },
        { id: 'v2', name: 'Venture Two', current_lifecycle_stage: 16 },
      ],
      snapshotsByVenture: { v1: [{ lifecycle_stage: 15 }], v2: [] },
    });

    const result = await drainCaptureBacklog(db, { minStage: 15 });

    expect(result.attempted).toBe(4); // v1: 16,17 (2) + v2: 15,16 (2)
    expect(result.captured).toBe(4);
    expect(result.errors).toEqual([]);
    expect(db.upsertCalls).toHaveLength(4);
  });

  it('is idempotent -- a second run against an already-drained backlog is a no-op', async () => {
    const db = createMockDb({
      ventures: [{ id: 'v1', name: 'Venture One', current_lifecycle_stage: 16 }],
      snapshotsByVenture: { v1: [{ lifecycle_stage: 15 }, { lifecycle_stage: 16 }] }, // already fully captured
    });

    const result = await drainCaptureBacklog(db, { minStage: 15 });

    expect(result.attempted).toBe(0);
    expect(result.captured).toBe(0);
    expect(db.upsertCalls).toHaveLength(0);
  });

  it('records a per-item error and continues draining other items when one capture fails', async () => {
    const db = createMockDb({
      ventures: [{ id: 'v1', name: 'Venture One', current_lifecycle_stage: 16 }],
      snapshotsByVenture: { v1: [] },
      upsertShouldFailFor: 'v1',
    });

    const result = await drainCaptureBacklog(db, { minStage: 15 });

    expect(result.attempted).toBe(2);
    expect(result.captured).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatchObject({ ventureId: 'v1', stage: 15 });
  });
});
