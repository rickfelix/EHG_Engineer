/**
 * TS-1, TS-3 (partial), TS-9/TS-10 precursor: live integration checks for the UAT-stage
 * renumber migration's precondition gate. Read-only (SELECT only) -- no DDL, no writes.
 */
import { it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { runDriftCheck } from '../../lib/eva/uat-stage-migration/drift-check.mjs';
import { runQuiescenceCheck } from '../../lib/eva/uat-stage-migration/quiescence-check.mjs';
import { runParkedVentureClassification } from '../../lib/eva/uat-stage-migration/parked-venture-classifier.mjs';
import { describeDb } from '../helpers/db-available.js';

let client;

beforeAll(async () => {
  client = await createDatabaseClient('engineer', { verify: false });
}, 30000);

afterAll(async () => {
  if (client) await client.end();
});

describeDb('UAT-stage renumber preconditions against the live database', () => {
  it('TS-1: drift check reports no drift against the committed baseline', async () => {
    const result = await runDriftCheck(client);
    expect(result.drifted).toBe(false);
    expect(result.mismatches).toEqual([]);
  });

  it('quiescence check runs against the live venture_stage_work table', async () => {
    const result = await runQuiescenceCheck(client);
    expect(typeof result.quiescent).toBe('boolean');
    expect(Array.isArray(result.inFlight)).toBe(true);
  });

  // FR-6: NOT asserted as "always 0 real ventures" -- an adversarial TESTING sub-agent review
  // measured 2 REAL (is_demo=false) ventures currently parked in the shift range (MarketLens at
  // stage 24, DataDistill at stage 26, both status=cancelled), contradicting VALIDATION's
  // LEAD-time "all demo fixtures" premise. This SD's own recurring lesson: a premise recorded at
  // one phase is not guaranteed to still hold at apply time -- this test re-measures rather than
  // repeating the stale assumption. The classifier is EXPECTED to block today; a chairman
  // ceremony cannot proceed until those 2 ventures are resolved or an explicit override is given.
  it('FR-6: parked-venture classification reflects current live state, not a frozen LEAD-time premise', async () => {
    const result = await runParkedVentureClassification(client);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.blocked).toBe(result.realCount > 0);
  });
});
