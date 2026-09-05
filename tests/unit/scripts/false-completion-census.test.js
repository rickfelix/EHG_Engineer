/**
 * SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F FR-4/FR-5 -- integration pins for the refactored,
 * testable false-completion census. Precedent: tests/integration/adam-self-adherence-review.test.js
 * (hand-rolled chainable mock keyed by table name, no vitest mock library).
 */
import { describe, it, expect } from 'vitest';
import {
  runFalseCompletionCensus,
  fetchAllCompleted,
  NAMED_TARGET_SDS,
} from '../../../scripts/false-completion-census.mjs';

const REAL_MIGRATION = 'database/migrations/20260829_encode_chairman_venture_doctrine.sql';
const TRANSIENT_ERROR = { message: 'canceling statement due to statement timeout', code: '57014' };

/**
 * @param {object[]} sds - strategic_directives_v2 rows (id, sd_key, status, current_phase, metadata)
 * @param {object} handoffsBySdId - sd.id -> sd_phase_handoffs rows array
 * @param {string|null} presenceErrorTable - if set, the presence-check query against this table errors
 * @param {object} presenceDataByTable - table -> rows the presence-check query returns when it doesn't error
 */
function makeSupabase({ sds, handoffsBySdId = {}, presenceErrorTable = null, presenceDataByTable = {} }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: () => ({
              range: async (from, to) => ({ data: sds.slice(from, to + 1), error: null }),
            }),
          }),
        };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select: () => ({
            eq: (_col, sdId) => ({
              limit: async () => ({ data: handoffsBySdId[sdId] || [], error: null }),
            }),
          }),
        };
      }
      // A named-table presence-check (e.g. chairman_constraints) -- checkMigrationDataPresent().
      return {
        select: () => ({
          in: () => ({
            limit: async () => {
              if (presenceErrorTable === table) return { data: null, error: TRANSIENT_ERROR };
              return { data: presenceDataByTable[table] || [], error: null };
            },
          }),
        }),
      };
    },
  };
}

describe('fetchAllCompleted', () => {
  it('pages through the full population, not a capped page', async () => {
    const sds = Array.from({ length: 1200 }, (_, i) => ({
      id: `id-${i}`, sd_key: `SD-${i}`, status: 'completed', current_phase: 'COMPLETED', metadata: {},
    }));
    const supabase = makeSupabase({ sds });
    const rows = await fetchAllCompleted(supabase);
    expect(rows).toHaveLength(1200);
  });
});

describe('runFalseCompletionCensus — TS-4: could-not-verify does not abort the run', () => {
  it('completes a full run when one SD\'s migration-evidence query errors, recording it as could-not-verify', async () => {
    const sds = [
      { id: 'id-A', sd_key: 'SD-A', status: 'completed', current_phase: 'COMPLETED', metadata: {} },
      { id: 'id-B', sd_key: 'SD-B', status: 'completed', current_phase: 'COMPLETED', metadata: {} },
    ];
    const supabase = makeSupabase({
      sds,
      handoffsBySdId: {
        'id-A': [{ deliverables_manifest: `Applied ${REAL_MIGRATION}`, completeness_report: null, executive_summary: null }],
        'id-B': [{ deliverables_manifest: 'no migration named here', completeness_report: null, executive_summary: null }],
      },
      presenceErrorTable: 'chairman_constraints',
    });

    const result = await runFalseCompletionCensus(supabase);

    expect(result.rows).toHaveLength(2);
    expect(result.anomalous).toHaveLength(0);
    expect(result.dataGaps).toHaveLength(0);
    expect(result.couldNotVerify).toEqual([
      { sd_key: 'SD-A', sd_id: 'id-A', reason: TRANSIENT_ERROR.message },
    ]);
  });

  it('records a confirmed-missing dataGap (not could-not-verify) when the query succeeds but rows are absent', async () => {
    const sds = [{ id: 'id-C', sd_key: 'SD-C', status: 'completed', current_phase: 'COMPLETED', metadata: {} }];
    const supabase = makeSupabase({
      sds,
      handoffsBySdId: {
        'id-C': [{ deliverables_manifest: `Applied ${REAL_MIGRATION}`, completeness_report: null, executive_summary: null }],
      },
      presenceDataByTable: { chairman_constraints: [] },
    });

    const result = await runFalseCompletionCensus(supabase);

    expect(result.couldNotVerify).toHaveLength(0);
    expect(result.dataGaps).toHaveLength(1);
    expect(result.dataGaps[0]).toMatchObject({ sd_key: 'SD-C', table: 'chairman_constraints' });
  });
});

describe('runFalseCompletionCensus --assert (TS-5): NAMED_TARGET_SDS-scoped, symmetric exit decision', () => {
  const [namedKey] = NAMED_TARGET_SDS;

  it('FAILs when a NAMED_TARGET_SDS entry could not be verified', async () => {
    const sds = [{ id: 'id-named', sd_key: namedKey, status: 'completed', current_phase: 'COMPLETED', metadata: {} }];
    const supabase = makeSupabase({
      sds,
      handoffsBySdId: { 'id-named': [{ deliverables_manifest: `Applied ${REAL_MIGRATION}`, completeness_report: null, executive_summary: null }] },
      presenceErrorTable: 'chairman_constraints',
    });

    const result = await runFalseCompletionCensus(supabase, { assertMode: true });
    expect(result.assertPassed).toBe(false);
    expect(result.assertMessage).toMatch(/could not be verified/i);
  });

  it('FAILs when a NAMED_TARGET_SDS entry has a confirmed-missing data gap', async () => {
    const sds = [{ id: 'id-named2', sd_key: namedKey, status: 'completed', current_phase: 'COMPLETED', metadata: {} }];
    const supabase = makeSupabase({
      sds,
      handoffsBySdId: { 'id-named2': [{ deliverables_manifest: `Applied ${REAL_MIGRATION}`, completeness_report: null, executive_summary: null }] },
      presenceDataByTable: { chairman_constraints: [] },
    });

    const result = await runFalseCompletionCensus(supabase, { assertMode: true });
    expect(result.assertPassed).toBe(false);
    expect(result.assertMessage).toMatch(/confirmed-missing/i);
  });

  it('PASSes when only a non-named SD has a could-not-verify or data gap (portfolio-wide, out of scope)', async () => {
    const sds = [{ id: 'id-other', sd_key: 'SD-NOT-NAMED', status: 'completed', current_phase: 'COMPLETED', metadata: {} }];
    const supabase = makeSupabase({
      sds,
      handoffsBySdId: { 'id-other': [{ deliverables_manifest: `Applied ${REAL_MIGRATION}`, completeness_report: null, executive_summary: null }] },
      presenceErrorTable: 'chairman_constraints',
    });

    const result = await runFalseCompletionCensus(supabase, { assertMode: true });
    expect(result.couldNotVerify).toHaveLength(1);
    expect(result.assertPassed).toBe(true);
    expect(result.assertMessage).toMatch(/PASS/);
  });

  it('PASSes when every named target SD is reconciled (no anomaly, no gap, no could-not-verify)', async () => {
    const sds = NAMED_TARGET_SDS.map((sd_key, i) => ({
      id: `id-${i}`, sd_key, status: 'completed', current_phase: 'COMPLETED', metadata: {},
    }));
    const supabase = makeSupabase({ sds, handoffsBySdId: {} });

    const result = await runFalseCompletionCensus(supabase, { assertMode: true });
    expect(result.assertPassed).toBe(true);
    expect(result.assertMessage).toMatch(/PASS: all 3 named target SDs/);
  });

  it('FAILs when a NAMED_TARGET_SDS entry is itself still anomalous (pre-existing check, unchanged)', async () => {
    const sds = [{ id: 'id-anom', sd_key: namedKey, status: 'completed', current_phase: 'PLAN', metadata: {} }];
    const supabase = makeSupabase({ sds, handoffsBySdId: {} });

    const result = await runFalseCompletionCensus(supabase, { assertMode: true });
    expect(result.assertPassed).toBe(false);
    expect(result.assertMessage).toMatch(/still anomalous/);
  });
});
