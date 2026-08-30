/**
 * QF-20260830-074: the fixture the defect class demands -- a recordResult() insert against the
 * REAL uat_test_results schema, since the mocked test (result-recorder-results-schema.test.js)
 * is exactly what hid this defect: a mock only fails if you tell it what "correct" looks like,
 * and the mock was already wrong.
 *
 * Fail-closed by design (QF-20260726-459, tests/helpers/db-available.js): DESIGNATED_NON_PROD_REFS
 * is currently empty, so this suite SKIPS everywhere until a safe non-prod DB target is
 * provisioned and explicitly designated. It never runs against production.
 */
import { describeDb, itDb } from '../../helpers/db-available.js';
import { expect } from 'vitest';

describeDb('recordResult() against the real uat_test_results table', () => {
  itDb('inserts and reads back a result row with no undefined-column error', async () => {
    const { createSupabaseServiceClient } = await import('../../../scripts/lib/supabase-connection.js');
    const db = await createSupabaseServiceClient('engineer', { verbose: false });

    const { data: run, error: runError } = await db
      .from('uat_test_runs')
      .insert({ run_id: `qf074-test-${Date.now()}`, status: 'running', total_tests: 1 })
      .select()
      .single();
    expect(runError).toBeNull();

    const { recordResult } = await import('../../../lib/uat/result-recorder.js');
    const testResult = await recordResult(run.id, { id: 'fixture-scenario', title: 'QF-074 fixture' }, 'PASS');

    expect(testResult.run_id).toBe(run.id);
    expect(testResult.status).toBe('pass');

    const { data: readBack, error: readError } = await db
      .from('uat_test_results')
      .select('*')
      .eq('id', testResult.id)
      .single();
    expect(readError).toBeNull();
    expect(readBack.run_id).toBe(run.id);
    expect(readBack.metadata.scenario_snapshot.id).toBe('fixture-scenario');

    // Cleanup -- this is fixture data, not a real UAT run.
    await db.from('uat_test_results').delete().eq('id', testResult.id);
    await db.from('uat_test_runs').delete().eq('id', run.id);
  });
});
