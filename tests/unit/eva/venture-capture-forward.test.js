/**
 * Tests for Venture Capture-Forward (collect-without-promote)
 * SD-LEO-INFRA-CAPTURE-FORWARD-GATE-001 (FR-1, FR-2)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  captureVentureStage,
  captureVentureRetroactive,
  getCaptureCompleteness,
} from '../../../lib/eva/venture-capture-forward.js';

// ── Generic chainable mock: safe no-op for every table EXCEPT the ones we assert on ──

function createMockDb({ snapshotRows = [] } = {}) {
  const fromCalls = [];
  const upsertCalls = [];

  const genericChainable = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'gte', 'lte']) {
    genericChainable[method] = vi.fn().mockReturnValue(genericChainable);
  }
  genericChainable.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  genericChainable.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);

  const db = {
    fromCalls,
    upsertCalls,
    from: vi.fn((table) => {
      fromCalls.push(table);

      if (table === 'venture_capture_snapshots') {
        const chainable = {};
        for (const method of ['eq', 'gte', 'lte']) {
          chainable[method] = vi.fn().mockReturnValue(chainable);
        }
        chainable.select = vi.fn(() => chainable);
        chainable.single = vi.fn(() =>
          Promise.resolve({ data: { id: 'snap-id', venture_id: 'v1', lifecycle_stage: 19 }, error: null })
        );
        chainable.then = (resolve) => Promise.resolve({ data: snapshotRows, error: null }).then(resolve);
        chainable.upsert = vi.fn((row) => {
          upsertCalls.push(row);
          return chainable;
        });
        return chainable;
      }

      // Every other table (chairman_decisions, venture_artifacts, assumption_sets,
      // venture_revenue_entries, and CRITICALLY venture_templates) gets the generic no-op mock.
      return genericChainable;
    }),
  };

  return db;
}

describe('captureVentureStage', () => {
  it('writes into venture_capture_snapshots, never venture_templates', async () => {
    const db = createMockDb();
    const result = await captureVentureStage(db, 'v1', 19);

    expect(result).toEqual({ id: 'snap-id', venture_id: 'v1', lifecycle_stage: 19 });
    expect(db.fromCalls).toContain('venture_capture_snapshots');
    expect(db.fromCalls).not.toContain('venture_templates');
    expect(db.upsertCalls).toHaveLength(1);
    expect(db.upsertCalls[0].venture_id).toBe('v1');
    expect(db.upsertCalls[0].lifecycle_stage).toBe(19);
    expect(db.upsertCalls[0].snapshot).toHaveProperty('extractor_version');
  });
});

describe('captureVentureRetroactive', () => {
  it('backfills a stage range, one upsert per stage, never touching venture_templates', async () => {
    const db = createMockDb();
    const results = await captureVentureRetroactive(db, 'v1', 19, 23);

    expect(results).toHaveLength(5);
    expect(db.upsertCalls).toHaveLength(5);
    expect(db.fromCalls).not.toContain('venture_templates');
  });
});

describe('getCaptureCompleteness', () => {
  it('reports missing = expected - captured', async () => {
    const db = createMockDb({ snapshotRows: [{ lifecycle_stage: 19 }, { lifecycle_stage: 20 }] });
    const reading = await getCaptureCompleteness(db, { id: 'v1', current_lifecycle_stage: 23 }, { minStage: 19 });

    expect(reading).toMatchObject({ ventureId: 'v1', expected: 5, captured: 2, missing: 3 });
    expect(db.fromCalls).not.toContain('venture_templates');
  });

  it('reports 0 expected/missing when the venture has not reached minStage yet', async () => {
    const db = createMockDb();
    const reading = await getCaptureCompleteness(db, { id: 'v2', current_lifecycle_stage: 10 }, { minStage: 15 });

    expect(reading).toEqual({ ventureId: 'v2', expected: 0, captured: 0, missing: 0, coveragePct: 100 });
  });
});
