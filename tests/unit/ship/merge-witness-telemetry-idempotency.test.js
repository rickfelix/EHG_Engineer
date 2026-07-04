/**
 * SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001 FR-5, TS-1.
 *
 * writeMergeWitnessTelemetry() used to insert unconditionally, so any re-run for the same
 * (repo, pr_number, lane) — the reconcile sweep (FR-1) and retroactive batch backfill (FR-2)
 * both re-process merges across runs — double-wrote. This locks in the idempotency fix.
 */
import { describe, it, expect } from 'vitest';
import { writeMergeWitnessTelemetry } from '../../../lib/ship/merge-witness-telemetry.mjs';

const silentLogger = { warn: () => {} };

function baseVerdict(overrides = {}) {
  return { overall: 'observe-only', prNumber: 500, workKey: 'SD-TEST-001', tier: 'standard', rungs: [], ...overrides };
}

/** In-memory fake supporting BOTH select (existence check) and insert, keyed on (repo, pr_number, lane). */
function makeFakeTable() {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    from: () => ({
      select: () => {
        const filters = {};
        const builder = {
          eq: (col, val) => { filters[col] = val; return builder; },
          limit: async () => {
            const matches = rows.filter((r) => r.repo === filters.repo && r.pr_number === filters.pr_number && r.lane === filters.lane);
            return { data: matches.map((r) => ({ id: r.id })), error: null };
          },
        };
        return builder;
      },
      insert: async (row) => {
        rows.push({ id: nextId++, ...row });
        return { error: null };
      },
    }),
  };
}

describe('writeMergeWitnessTelemetry idempotency (FR-5, TS-1)', () => {
  it('TS-1: a second call with the identical (repo, pr_number, lane) is a no-op — writes exactly one row', async () => {
    const supabase = makeFakeTable();
    const first = await writeMergeWitnessTelemetry(supabase, baseVerdict(), { repo: 'rickfelix/EHG_Engineer', lane: 'reconcile-sweep', logger: silentLogger });
    const second = await writeMergeWitnessTelemetry(supabase, baseVerdict(), { repo: 'rickfelix/EHG_Engineer', lane: 'reconcile-sweep', logger: silentLogger });

    expect(first).toEqual({ ok: true, error: null });
    expect(second).toEqual({ ok: true, error: null, skipped: true });
    expect(supabase.rows).toHaveLength(1);
  });

  it('the same (repo, pr_number) with a DIFFERENT lane writes a second, distinct row (lane is part of identity)', async () => {
    const supabase = makeFakeTable();
    await writeMergeWitnessTelemetry(supabase, baseVerdict(), { repo: 'rickfelix/EHG_Engineer', lane: 'ship-auto-merge', logger: silentLogger });
    await writeMergeWitnessTelemetry(supabase, baseVerdict(), { repo: 'rickfelix/EHG_Engineer', lane: 'reconcile-sweep', logger: silentLogger });

    expect(supabase.rows).toHaveLength(2);
    expect(supabase.rows.map((r) => r.lane).sort()).toEqual(['reconcile-sweep', 'ship-auto-merge']);
  });

  it('a different pr_number under the same repo+lane still writes its own row', async () => {
    const supabase = makeFakeTable();
    await writeMergeWitnessTelemetry(supabase, baseVerdict({ prNumber: 500 }), { repo: 'rickfelix/EHG_Engineer', lane: 'reconcile-sweep', logger: silentLogger });
    await writeMergeWitnessTelemetry(supabase, baseVerdict({ prNumber: 501 }), { repo: 'rickfelix/EHG_Engineer', lane: 'reconcile-sweep', logger: silentLogger });

    expect(supabase.rows).toHaveLength(2);
    expect(supabase.rows.map((r) => r.pr_number).sort()).toEqual([500, 501]);
  });

  it('existing minimal test-doubles that only implement insert() (no select) still write, unchanged (existence check fails open)', async () => {
    const inserts = [];
    const insertOnlySupabase = { from: () => ({ insert: async (row) => { inserts.push(row); return { error: null }; } }) };
    const result = await writeMergeWitnessTelemetry(insertOnlySupabase, baseVerdict(), { repo: 'rickfelix/EHG_Engineer', lane: 'ship-auto-merge', logger: silentLogger });

    expect(result).toEqual({ ok: true, error: null });
    expect(inserts).toHaveLength(1);
  });

  it('an existence-check query error (not a throw) also falls through to the insert attempt', async () => {
    const inserts = [];
    const erroringSelectSupabase = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }),
        insert: async (row) => { inserts.push(row); return { error: null }; },
      }),
    };
    const result = await writeMergeWitnessTelemetry(erroringSelectSupabase, baseVerdict(), { repo: 'rickfelix/EHG_Engineer', lane: 'ship-auto-merge', logger: silentLogger });

    expect(result).toEqual({ ok: true, error: null });
    expect(inserts).toHaveLength(1);
  });
});
