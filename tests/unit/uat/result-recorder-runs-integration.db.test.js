/**
 * QF-20260830-135: the class-fix half of the run_id/recordResult defect pair (QF-20260830-487,
 * QF-20260830-074) -- mocked tests are exactly what hid both, since a mock only fails if you tell
 * it what "correct" looks like, and the mock (result-recorder-schema.test.js) was already wrong
 * about run_id. This is the uat_test_runs round-trip counterpart to
 * result-recorder-results-integration.db.test.js (which covers uat_test_results via recordResult).
 *
 * Fail-closed by design (QF-20260726-459, tests/helpers/db-available.js): DESIGNATED_NON_PROD_REFS
 * is currently empty, so this suite SKIPS everywhere until a safe non-prod DB target is
 * provisioned and explicitly designated. It never runs against production.
 */
import { describeDb, itDb } from '../../helpers/db-available.js';
import { expect } from 'vitest';

describeDb('startSession()/completeSession() against the real uat_test_runs table', () => {
  itDb('creates a run with a real run_id and completes it with no undefined-column error', async () => {
    const { createSupabaseServiceClient } = await import('../../../scripts/lib/supabase-connection.js');
    const db = await createSupabaseServiceClient('engineer', { verbose: false });

    const { startSession, recordResult, completeSession } = await import('../../../lib/uat/result-recorder.js');

    const run = await startSession(`qf135-test-sd-${Date.now()}`, {
      scenarioSnapshot: [{ id: 'fixture-scenario' }],
    });
    expect(run.id).toBeTruthy();
    expect(run.run_id).toBeTruthy();
    expect(run.run_id).toMatch(/^uat-/);

    await recordResult(run.id, { id: 'fixture-scenario', title: 'QF-135 fixture' }, 'PASS');

    const completed = await completeSession(run.id);
    expect(completed.passRate).toBe(100);
    expect(completed.metadata.quality_gate).toBe('GREEN');

    const { data: readBack, error: readError } = await db
      .from('uat_test_runs')
      .select('*')
      .eq('id', run.id)
      .single();
    expect(readError).toBeNull();
    expect(readBack.pass_rate).toBe(100);
    expect(readBack.status).toBe('completed');

    // Cleanup -- this is fixture data, not a real UAT run.
    await db.from('uat_test_results').delete().eq('run_id', run.id);
    await db.from('uat_test_runs').delete().eq('id', run.id);
  });
});
