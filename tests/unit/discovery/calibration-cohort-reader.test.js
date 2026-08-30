/**
 * SD-LEO-INFRA-REALIZE-GATE-CALIBRATION-001 (FR-4) -- consumer-demonstrated, not asserted.
 *
 * A reader that is merely invoked-without-error proves nothing (Solomon C2 clause): these
 * tests assert the aggregate OUTPUT CONTAINS the fixture's specific calibration result. A
 * reader that silently drops an item class must fail the "known failure" test below.
 */
import { describe, test, expect } from 'vitest';
import { readCalibrationCohort } from '../../../lib/discovery/calibration-cohort-reader.js';

function buildFixtureRow(id, { failures = [], score = 5 } = {}) {
  const checkIds = [
    'external_demand_signal',
    'falsifiable_kill_assumption',
    'pessimistic_band_viability',
    'named_spof_assumption',
    'capability_lift_declared',
    'mission_anchor',
    'solo_operator_feasible',
  ];
  const checks = checkIds.map((cid) => ({
    id: cid,
    label: cid,
    pass: !failures.includes(cid),
  }));
  return {
    id,
    metadata: {
      calibration_cohort: true,
      cohort_number: 1,
      intake_bar: { score, max: 7, checks, failures, advisory: true },
    },
  };
}

/** Fake supabase client: .from(table).select().eq() resolves { data, error }; .update().eq() records writes. */
function buildFakeSupabase(rows) {
  const updates = [];
  return {
    updates,
    from(table) {
      return {
        select: () => ({
          eq: async (col, val) => {
            if (table !== 'opportunity_blueprints') return { data: [], error: null };
            if (col === 'metadata->>calibration_cohort' && val === 'true') {
              return { data: rows, error: null };
            }
            return { data: [], error: null };
          },
        }),
        update: (patch) => ({
          eq: async (col, id) => {
            updates.push({ id, patch });
            return { error: null };
          },
        }),
      };
    },
  };
}

describe('readCalibrationCohort -- consumer-demonstrated', () => {
  test('output CONTAINS the fixture row\'s specific failing checks, not just a non-error return', async () => {
    const rows = [
      buildFixtureRow('bp-1', { failures: ['falsifiable_kill_assumption', 'named_spof_assumption'], score: 5 }),
      buildFixtureRow('bp-2', { failures: [], score: 7 }),
    ];
    const supabase = buildFakeSupabase(rows);

    const report = await readCalibrationCohort({ supabase });

    expect(report.cohort_size).toBe(2);
    // The specific failure this fixture declares must appear in the aggregate -- a reader
    // that silently drops the item class (e.g. only counts pass, never fail) fails here.
    expect(report.checks.falsifiable_kill_assumption.fail).toBe(1);
    expect(report.checks.falsifiable_kill_assumption.pass).toBe(1);
    expect(report.checks.named_spof_assumption.fail).toBe(1);
    // A check neither fixture row fails must show zero fails, both passes.
    expect(report.checks.external_demand_signal.fail).toBe(0);
    expect(report.checks.external_demand_signal.pass).toBe(2);
    expect(report.score_histogram[5]).toBe(1);
    expect(report.score_histogram[7]).toBe(1);
  });

  test('empty cohort returns a well-formed zero-row report, no throw', async () => {
    const supabase = buildFakeSupabase([]);
    const report = await readCalibrationCohort({ supabase });
    expect(report.cohort_size).toBe(0);
    expect(report.checks).toEqual({});
  });

  test('stamp=true marks each consumed row with calibration_read_at, stamp=false (default) does not', async () => {
    const rows = [buildFixtureRow('bp-1'), buildFixtureRow('bp-2')];
    const supabase = buildFakeSupabase(rows);

    const unstamped = await readCalibrationCohort({ supabase });
    expect(unstamped.stamped).toBe(0);
    expect(supabase.updates).toHaveLength(0);

    const stamped = await readCalibrationCohort({ supabase, stamp: true });
    expect(stamped.stamped).toBe(2);
    expect(supabase.updates).toHaveLength(2);
    for (const u of supabase.updates) {
      expect(u.patch.metadata.calibration_read_at).toEqual(expect.any(String));
      expect(u.patch.metadata.calibration_cohort).toBe(true); // existing metadata preserved
    }
  });

  test('no supabase client returns the zero-value report rather than throwing', async () => {
    const report = await readCalibrationCohort({});
    expect(report.cohort_size).toBe(0);
  });

  test('a row with no intake_bar (malformed cohort member) is skipped, not counted or thrown on', async () => {
    const rows = [{ id: 'bp-bad', metadata: { calibration_cohort: true } }, buildFixtureRow('bp-good')];
    const supabase = buildFakeSupabase(rows);
    const report = await readCalibrationCohort({ supabase });
    expect(report.cohort_size).toBe(2); // both rows counted in cohort_size...
    expect(report.checks.external_demand_signal.pass).toBe(1); // ...but only the valid one contributes checks
  });
});
