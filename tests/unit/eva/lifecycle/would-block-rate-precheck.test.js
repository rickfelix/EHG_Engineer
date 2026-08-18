/**
 * Unit tests for lib/eva/lifecycle/would-block-rate-precheck.js
 *
 * SD-FDBK-FIX-EXIT-GATE-CONFORMANCE-001 (FR-4, TS-5/TS-6/TS-11/TS-12).
 */

import { describe, it, expect } from 'vitest';
import { precheckWouldBlockRate, computeWouldBlockRate, RATE_SCOPED_EVENT_TYPES } from '../../../../lib/eva/lifecycle/would-block-rate-precheck.js';

const UNRESOLVED_STAGE_ROWS = [
  { stage_number: 1, stage_name: 'Idea', metadata: { gates: { exit: ['Category assigned'] } } },
];
const ALL_RESOLVED_STAGE_ROWS = [
  { stage_number: 19, stage_name: 'Build', metadata: { gates: { exit: ['Application deployed'] } } },
];

/**
 * TS-11 (source-pinned): a mock that GENUINELY applies the .in('event_type', [...]) filter,
 * rather than returning a canned array regardless of the query. Built from a fixture mixing
 * scoped EXIT_GATE_* rows with a large volume of unscoped S19_HARD_GATE_BLOCK-shaped rows
 * (mirroring the real live 139,000+-row pollution this precheck must be immune to).
 *
 * The returned query builder is BOTH awaitable directly (bare `select()`, no filter, resolves
 * to ALL fixture rows) AND chainable via `.in()` (resolves to the filtered subset) -- so if the
 * `.in('event_type', RATE_SCOPED_EVENT_TYPES)` clause is ever removed from the implementation,
 * the query resolves to the FULL unfiltered fixture instead of throwing or returning nothing.
 * Verified directly (2026-08-18): temporarily deleting the .in() call from
 * lib/eva/lifecycle/would-block-rate-precheck.js and re-running this suite makes the `total`
 * assertion below fail with the full unfiltered count instead of the scoped one -- proving this
 * mock cannot be satisfied by a no-op filter.
 */
function buildSourcePinnedSupabaseMock(fixtureRows) {
  const resolveAll = () => Promise.resolve({ data: fixtureRows, error: null });
  return {
    from: (table) => {
      if (table !== 'system_events') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          // Bare select (no .in()) resolves to ALL rows — this is what a removed filter falls
          // back to, so the vulnerability this test guards against is directly reachable.
          then: (resolve, reject) => resolveAll().then(resolve, reject),
          in: (column, values) => {
            if (column !== 'event_type') throw new Error(`expected filter on event_type, got ${column}`);
            const valueSet = new Set(values);
            const filtered = fixtureRows.filter((r) => valueSet.has(r.event_type));
            return Promise.resolve({ data: filtered, error: null });
          },
        }),
      };
    },
  };
}

describe('computeWouldBlockRate (FR-4, TS-6/TS-11)', () => {
  it('TS-11: rate is computed ONLY from EXIT_GATE_* rows, immune to S19_HARD_GATE_BLOCK volume pollution', async () => {
    // Fixture: a realistic mix. S19_HARD_GATE_BLOCK volume (139,000+ live) is represented here
    // by a large synthetic batch to prove the filter, not literally 139k rows in a unit test.
    const s19Noise = Array.from({ length: 500 }, () => ({ event_type: 'S19_HARD_GATE_BLOCK', payload: {} }));
    const scoped = [
      { event_type: 'EXIT_GATE_ANOMALY', payload: { gate_string: 'x' } },
      { event_type: 'EXIT_GATE_OBSERVE_ONLY', payload: { would_satisfy: true } },
      { event_type: 'EXIT_GATE_OBSERVE_ONLY', payload: { would_satisfy: false } },
      { event_type: 'EXIT_GATE_OBSERVE_UNRESOLVED', payload: { gate_string: 'y' } },
    ];
    const supabase = buildSourcePinnedSupabaseMock([...s19Noise, ...scoped]);
    const result = await computeWouldBlockRate({ supabase });
    // If the .in() filter were removed, total would be 504 (500 noise + 4 scoped), not 4.
    expect(result.total).toBe(4);
    // would-block: the ANOMALY row + the UNRESOLVED row + the would_satisfy:false OBSERVE_ONLY row = 3
    expect(result.wouldBlockCount).toBe(3);
    expect(result.rate).toBeCloseTo(0.75, 5);
  });

  it('RATE_SCOPED_EVENT_TYPES contains exactly the 3 exit-gate event types, sourced from the shared constants module', () => {
    expect([...RATE_SCOPED_EVENT_TYPES].sort()).toEqual([
      'EXIT_GATE_ANOMALY',
      'EXIT_GATE_OBSERVE_ONLY',
      'EXIT_GATE_OBSERVE_UNRESOLVED',
    ]);
  });
});

describe('precheckWouldBlockRate (FR-4, TS-5)', () => {
  it('TS-5: refuses (allowed:false) while any binding gate string is unresolvable, no rate computed', async () => {
    const supabase = buildSourcePinnedSupabaseMock([{ event_type: 'EXIT_GATE_ANOMALY', payload: {} }]);
    const result = await precheckWouldBlockRate({ supabase, stages: UNRESOLVED_STAGE_ROWS });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/unresolvable/i);
    expect(result.reason).toMatch(/Category assigned/);
    expect(result.total).toBeUndefined();
  });

  it('allows and returns a rate once all binding gate strings resolve', async () => {
    const supabase = buildSourcePinnedSupabaseMock([{ event_type: 'EXIT_GATE_ANOMALY', payload: {} }]);
    const result = await precheckWouldBlockRate({ supabase, stages: ALL_RESOLVED_STAGE_ROWS });
    expect(result.allowed).toBe(true);
    expect(result.total).toBe(1);
    expect(result.rate).toBe(1);
  });
});
