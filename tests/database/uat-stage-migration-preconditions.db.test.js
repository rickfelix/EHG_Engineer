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

  it('quiescence check runs against the live venture_stage_transitions table', async () => {
    const result = await runQuiescenceCheck(client);
    expect(typeof result.quiescent).toBe('boolean');
    expect(Array.isArray(result.inFlight)).toBe(true);
  });

  it('FR-6: parked-venture classification matches VALIDATION\'s LEAD-time finding (all demo fixtures)', async () => {
    const result = await runParkedVentureClassification(client);
    expect(result.realCount).toBe(0);
    expect(result.blocked).toBe(false);
  });
});
