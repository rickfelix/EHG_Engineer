/**
 * SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-002 (FR-2) — full-ledger backfill mode: a single immutable
 * snapshot, per-row six-bucket accounting, and an independent verifier that never calls
 * resolveLedgerOutcome (so a bug in the writer cannot make the verifier self-certify it).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  runBackfill, computeIndependentStillActiveCount, independentDeriveSdKey,
  TERMINAL_SD_STATUSES, BACKFILL_BUCKETS, NEGATIVE_BACKPROP_TERMINAL_SKIP, selectNegativeBackprop,
  checkReadbackDiscrepancy, validateCliArgs,
} = require('../../scripts/solomon-ledger-reconcile.cjs');
const { classifyRef, SHAPE, ELIGIBLE } = require('../../lib/ledger/ref-shape.js');
const { deriveSdKeyFromRef } = require('../../lib/ledger/outcome-writer.js');

/** Chainable select-mock returning a single unpaged page (short page stops fapPaginate's loop). */
function makeSnapshotMock(rows) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    range: async () => ({ data: rows, error: null }),
  };
  return chain;
}

/** Stateful update-mock: applies writes to an in-memory row map so CAS/re-read semantics work. */
function makeStatefulLedgerMock(initialRows) {
  const byId = new Map(initialRows.map((r) => [r.id, { ...r }]));
  const from = () => ({
    select: (cols) => ({
      eq: (col, val) => ({
        order: () => ({ range: async () => ({ data: [...byId.values()].filter((r) => r[col] === val), error: null }) }),
      }),
      // used by the CAS re-read path: .select('outcome').eq('id', id).maybeSingle()
      eq2: null,
    }),
    update: (payload) => {
      const predicates = {};
      const builder = {
        eq: (col, val) => { predicates[col] = val; return builder; },
        then: (resolve) => {
          const row = byId.get(predicates.id);
          const matches = row && Object.entries(predicates).every(([k, v]) => k === 'id' || row[k] === v);
          if (matches) { Object.assign(row, payload); resolve({ error: null, count: 1 }); }
          else resolve({ error: null, count: 0 });
        },
      };
      return builder;
    },
  });
  return { from, byId };
}

describe('independentDeriveSdKey — agrees with lib/ledger/outcome-writer.js deriveSdKeyFromRef (TS-4e)', () => {
  const fixtures = [
    'SD-LEO-INFRA-X-001',
    'sd-leo-infra-x-001',
    'SD-LEO-INFRA-X-001 (in_progress) -- narrative note',
    null,
    'narrative prose',
    'a1b2c3d4e5f6789012345678901234567890abcd',
    'QF-20260509-PRMERGE-EXACT',
  ];
  it('produces identical results to the writer\'s own normalization on every fixture', () => {
    for (const ref of fixtures) {
      expect(independentDeriveSdKey(ref, classifyRef, SHAPE, ELIGIBLE)).toBe(deriveSdKeyFromRef(ref));
    }
  });
});

describe('computeIndependentStillActiveCount', () => {
  it('counts a non-terminal outcome_sd_key row as still-active', async () => {
    const rows = [{ id: '1', outcome_sd_key: 'SD-X', outcome_ref: null }];
    const count = await computeIndependentStillActiveCount(rows, async () => 'in_progress');
    expect(count).toBe(1);
  });

  it('does NOT count a terminal outcome_sd_key row', async () => {
    const rows = [{ id: '1', outcome_sd_key: 'SD-X', outcome_ref: null }];
    const count = await computeIndependentStillActiveCount(rows, async () => 'completed');
    expect(count).toBe(0);
  });

  it('counts an EMPTY-ref row as still-active with zero SD lookups', async () => {
    const lookup = vi.fn();
    const rows = [{ id: '1', outcome_sd_key: null, outcome_ref: null }];
    const count = await computeIndependentStillActiveCount(rows, lookup);
    expect(count).toBe(1);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('does NOT count a NARRATIVE/COMMIT_SHA/EXCLUDED_QF row', async () => {
    const rows = [
      { id: '1', outcome_sd_key: null, outcome_ref: 'narrative prose' },
      { id: '2', outcome_sd_key: null, outcome_ref: 'a1b2c3d4e5f6789012345678901234567890abcd' },
      { id: '3', outcome_sd_key: null, outcome_ref: 'QF-20260509-PRMERGE-EXACT' },
    ];
    const count = await computeIndependentStillActiveCount(rows, async () => null);
    expect(count).toBe(0);
  });

  it('counts a derivable-ref (ELIGIBLE/CASE_DRIFT) row pointing at a non-terminal SD', async () => {
    const rows = [{ id: '1', outcome_sd_key: null, outcome_ref: 'sd-leo-infra-x-002' }];
    const count = await computeIndependentStillActiveCount(rows, async () => 'draft');
    expect(count).toBe(1);
  });

  it('TERMINAL_SD_STATUSES is exactly {completed, cancelled}', () => {
    expect(TERMINAL_SD_STATUSES).toEqual(['completed', 'cancelled']);
  });
});

describe('runBackfill — dry-run performs zero writes (TS-4f)', () => {
  it('infers resolved-written/unmeasurable-written/still-active by verdict alone, zero DB writes', async () => {
    const rows = [
      { id: '1', outcome_sd_key: 'SD-DONE', outcome_ref: null },       // -> resolved-written
      { id: '2', outcome_sd_key: null, outcome_ref: 'narrative text' }, // -> unmeasurable-written
      { id: '3', outcome_sd_key: 'SD-WIP', outcome_ref: null },        // -> still-active
    ];
    const supabase = {
      from: () => ({
        update: () => { throw new Error('dry-run must never call .update()'); },
        select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: rows, error: null }) }) }) }),
      }),
    };
    const sdStatusLookup = async (key) => (key === 'SD-DONE' ? 'completed' : 'in_progress');
    const result = await runBackfill(supabase, { dryRun: true, sdStatusLookup });
    expect(result.counts['resolved-written']).toBe(1);
    expect(result.counts['unmeasurable-written']).toBe(1);
    expect(result.counts['still-active']).toBe(1);
    expect(result.counts['expected-pre-migration']).toBe(0);
    expect(result.counts.unaccounted).toBe(0);
    expect(result.exitCode).toBe(0);
  });
});

describe('runBackfill — live mode six-bucket accounting', () => {
  it('resolves a completed-SD row and backfills outcome_sd_key for a derived-ref row', async () => {
    const initial = [
      { id: '1', outcome: 'unknown', outcome_sd_key: 'SD-DONE', outcome_ref: null },
      { id: '2', outcome: 'unknown', outcome_sd_key: null, outcome_ref: 'sd-leo-infra-derived-001' },
    ];
    const { from, byId } = makeStatefulLedgerMock(initial);
    const supabase = {
      from: (table) => {
        const base = from(table);
        return {
          ...base,
          select: (cols) => {
            if (cols === 'id, outcome_sd_key, outcome_ref') {
              return { eq: () => ({ order: () => ({ range: async () => ({ data: initial.map(({ id, outcome_sd_key, outcome_ref }) => ({ id, outcome_sd_key, outcome_ref })), error: null }) }) }) };
            }
            return base.select(cols);
          },
        };
      },
    };
    const sdStatusLookup = async () => 'completed';
    const result = await runBackfill(supabase, { dryRun: false, nowIso: '2026-08-28T00:00:00Z', sdStatusLookup });
    expect(result.counts['resolved-written']).toBe(2);
    expect(byId.get('1').outcome).toBe('shipped_clean');
    expect(byId.get('2').outcome).toBe('shipped_clean');
    expect(byId.get('2').outcome_sd_key).toBe('SD-LEO-INFRA-DERIVED-001');
    expect(result.exitCode).toBe(0);
  });

  it('classifies a 23514 check-violation as expected-pre-migration, exits 2 (TS-4d)', async () => {
    const rows = [{ id: '1', outcome_sd_key: null, outcome_ref: 'narrative text' }];
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: rows, error: null }) }) }) }),
        update: () => ({ eq: () => ({ eq: () => ({ then: (resolve) => resolve({ error: { code: '23514', message: 'check violation' }, count: 0 }) }) }) }),
      }),
    };
    const result = await runBackfill(supabase, { dryRun: false, sdStatusLookup: async () => null });
    expect(result.counts['expected-pre-migration']).toBe(1);
    expect(result.counts.unaccounted).toBe(0);
    expect(result.exitCode).toBe(2);
  });

  it('a CAS skip whose re-read shows still unknown is bucketed still-active', async () => {
    const rows = [{ id: '1', outcome_sd_key: null, outcome_ref: 'narrative text' }];
    const supabase = {
      from: () => ({
        select: (cols) => {
          if (cols === 'outcome') return { eq: () => ({ maybeSingle: async () => ({ data: { outcome: 'unknown' }, error: null }) }) };
          return { eq: () => ({ order: () => ({ range: async () => ({ data: rows, error: null }) }) }) };
        },
        update: () => ({ eq: () => ({ eq: () => ({ then: (resolve) => resolve({ error: null, count: 0 }) }) }) }),
      }),
    };
    const result = await runBackfill(supabase, { dryRun: false, sdStatusLookup: async () => null });
    expect(result.counts['still-active']).toBe(1);
    expect(result.counts['resolved-by-other']).toBe(0);
  });

  it('a CAS skip whose re-read shows a terminal value is bucketed resolved-by-other, not still-active (H3)', async () => {
    const rows = [{ id: '1', outcome_sd_key: null, outcome_ref: 'narrative text' }];
    const supabase = {
      from: () => ({
        select: (cols) => {
          if (cols === 'outcome') return { eq: () => ({ maybeSingle: async () => ({ data: { outcome: 'shipped_clean' }, error: null }) }) };
          return { eq: () => ({ order: () => ({ range: async () => ({ data: rows, error: null }) }) }) };
        },
        update: () => ({ eq: () => ({ eq: () => ({ then: (resolve) => resolve({ error: null, count: 0 }) }) }) }),
      }),
    };
    const result = await runBackfill(supabase, { dryRun: false, sdStatusLookup: async () => null });
    expect(result.counts['resolved-by-other']).toBe(1);
    expect(result.counts['still-active']).toBe(0);
  });

  it('a non-23514 write failure is bucketed unaccounted, exits 1 (never silently dropped)', async () => {
    const rows = [{ id: '1', outcome_sd_key: null, outcome_ref: 'narrative text' }];
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: rows, error: null }) }) }) }),
        update: () => ({ eq: () => ({ eq: () => ({ then: (resolve) => resolve({ error: { code: '08000', message: 'connection lost' }, count: 0 }) }) }) }),
      }),
    };
    const result = await runBackfill(supabase, { dryRun: false, sdStatusLookup: async () => null });
    expect(result.counts.unaccounted).toBe(1);
    expect(result.exitCode).toBe(1);
  });

  it('every row in the snapshot lands in exactly one bucket', async () => {
    const rows = [
      { id: '1', outcome_sd_key: 'SD-DONE', outcome_ref: null },
      { id: '2', outcome_sd_key: null, outcome_ref: 'narrative text' },
      { id: '3', outcome_sd_key: 'SD-WIP', outcome_ref: null },
      { id: '4', outcome_sd_key: null, outcome_ref: null },
    ];
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: rows, error: null }) }) }) }),
        update: () => ({ eq: () => ({ eq: () => ({ then: (resolve) => resolve({ error: null, count: 1 }) }) }) }),
      }),
    };
    const sdStatusLookup = async (key) => (key === 'SD-DONE' ? 'completed' : 'in_progress');
    const result = await runBackfill(supabase, { dryRun: false, sdStatusLookup });
    const total = BACKFILL_BUCKETS.reduce((sum, b) => sum + result.counts[b], 0);
    expect(total).toBe(rows.length);
  });
});

describe('runBackfill idempotency (TS-5) — run 2 sees run 1\'s writes and performs zero more', () => {
  it('a stateful mock (writes visible to the next fetch) proves run 2 is a true no-op', async () => {
    const initial = [
      { id: '1', outcome: 'unknown', outcome_sd_key: 'SD-DONE', outcome_ref: null },
      { id: '2', outcome: 'unknown', outcome_sd_key: 'SD-WIP', outcome_ref: null },
    ];
    const { from, byId } = makeStatefulLedgerMock(initial);
    const supabase = { from: (t) => from(t) };
    const sdStatusLookup = async (key) => (key === 'SD-DONE' ? 'completed' : 'in_progress');

    const run1 = await runBackfill(supabase, { dryRun: false, sdStatusLookup });
    expect(run1.counts['resolved-written']).toBe(1);
    expect(run1.counts['still-active']).toBe(1);
    expect(byId.get('1').outcome).toBe('shipped_clean');

    const run2 = await runBackfill(supabase, { dryRun: false, sdStatusLookup });
    // Row 1 is no longer outcome='unknown' (byId reflects run 1's write) so run 2's snapshot only
    // re-selects row 2, which is still non-terminal -> still-active, zero writes.
    expect(run2.snapshotSize).toBe(1);
    expect(run2.counts['resolved-written']).toBe(0);
    expect(run2.counts['unmeasurable-written']).toBe(0);
    expect(run2.counts['still-active']).toBe(1);
  });
});

describe('TS-4 wiring: runBackfill and computeIndependentStillActiveCount agree on the SAME snapshot, including an ineligible-CASE_DRIFT row (D1/D2 regression)', () => {
  it('still-active counts match exactly on a mixed fixture', async () => {
    const rows = [
      { id: '1', outcome_sd_key: 'SD-DONE', outcome_ref: null },                                          // resolved (terminal)
      { id: '2', outcome_sd_key: 'SD-WIP', outcome_ref: null },                                            // still-active (non-terminal sd_key)
      { id: '3', outcome_sd_key: null, outcome_ref: null },                                                // still-active (EMPTY)
      { id: '4', outcome_sd_key: null, outcome_ref: 'sd-leo-infra-derived-wip' },                          // still-active (CASE_DRIFT, derivable, non-terminal)
      { id: '5', outcome_sd_key: null, outcome_ref: 'narrative prose' },                                   // unmeasurable (NARRATIVE)
      { id: '6', outcome_sd_key: null, outcome_ref: 'SD-LEO-INFRA-X-001 (in_progress) -- narrative note' }, // ineligible CASE_DRIFT -> still-active, per D1
    ];
    const sdStatusLookup = async (key) => (key === 'SD-DONE' ? 'completed' : 'in_progress');
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: rows, error: null }) }) }) }),
        update: () => ({ eq: () => ({ eq: () => ({ then: (resolve) => resolve({ error: null, count: 1 }) }) }) }),
      }),
    };
    const backfillResult = await runBackfill(supabase, { dryRun: true, sdStatusLookup });
    const independentCount = await computeIndependentStillActiveCount(rows, sdStatusLookup);
    expect(backfillResult.counts['still-active']).toBe(independentCount);
    expect(backfillResult.counts['still-active']).toBe(4); // rows 2, 3, 4, 6
  });
});

describe('checkReadbackDiscrepancy (TS-4c)', () => {
  it('reports ok=true when the live readback matches still-active + expected-pre-migration', () => {
    const result = checkReadbackDiscrepancy({ 'still-active': 5, 'expected-pre-migration': 2 }, 7);
    expect(result).toEqual({ ok: true, expected: 7, actual: 7 });
  });

  it('reports ok=false on a discrepancy (e.g. a concurrent external write during the pass)', () => {
    const result = checkReadbackDiscrepancy({ 'still-active': 5, 'expected-pre-migration': 2 }, 8);
    expect(result).toEqual({ ok: false, expected: 7, actual: 8 });
  });
});

describe('runBackfill — D5: a write count other than exactly 1 is unaccounted, never silently treated as success', () => {
  it('count > 1 is unaccounted', async () => {
    const rows = [{ id: '1', outcome_sd_key: 'SD-DONE', outcome_ref: null }];
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: rows, error: null }) }) }) }),
        update: () => ({ eq: () => ({ eq: () => ({ then: (resolve) => resolve({ error: null, count: 2 }) }) }) }),
      }),
    };
    const result = await runBackfill(supabase, { dryRun: false, sdStatusLookup: async () => 'completed' });
    expect(result.counts.unaccounted).toBe(1);
    expect(result.counts['resolved-written']).toBe(0);
  });

  it('a null count (client did not honour { count: "exact" }) is unaccounted, not silently success', async () => {
    const rows = [{ id: '1', outcome_sd_key: 'SD-DONE', outcome_ref: null }];
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: rows, error: null }) }) }) }),
        update: () => ({ eq: () => ({ eq: () => ({ then: (resolve) => resolve({ error: null, count: null }) }) }) }),
      }),
    };
    const result = await runBackfill(supabase, { dryRun: false, sdStatusLookup: async () => 'completed' });
    expect(result.counts.unaccounted).toBe(1);
  });
});

describe('validateCliArgs (SECURITY sub-agent, S-1) — an unrecognized flag never silently means dryRun=false', () => {
  it('accepts the known flags in any combination', () => {
    expect(() => validateCliArgs([])).not.toThrow();
    expect(() => validateCliArgs(['--dry-run'])).not.toThrow();
    expect(() => validateCliArgs(['--backfill', '--dry-run'])).not.toThrow();
  });

  it('throws loudly on a typo\'d or unrecognized flag instead of silently defaulting to a live write', () => {
    expect(() => validateCliArgs(['--dryrun'])).toThrow(/Unrecognized flag/);
    expect(() => validateCliArgs(['--dry_run'])).toThrow(/Unrecognized flag/);
    expect(() => validateCliArgs(['-n'])).toThrow(/Unrecognized flag/);
    expect(() => validateCliArgs(['--backfill', '--dry-run=true'])).toThrow(/Unrecognized flag/);
  });
});

describe('TR-4: NEGATIVE_BACKPROP_TERMINAL_SKIP includes unmeasurable (TS-9)', () => {
  it('a row backfilled to unmeasurable is never clobbered by a later exact-ref-match revert event', () => {
    expect(NEGATIVE_BACKPROP_TERMINAL_SKIP).toContain('unmeasurable');
    const ledgerRows = [{ id: '1', outcome: 'unmeasurable', outcome_ref: 'a1b2c3d4e5f6789012345678901234567890abcd' }];
    const negativeRefs = new Set(['a1b2c3d4e5f6789012345678901234567890abcd']);
    const matched = selectNegativeBackprop(ledgerRows, negativeRefs);
    expect(matched).toHaveLength(0);
  });
});
