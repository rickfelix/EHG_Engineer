/**
 * TS-1: negative control detects both known-live component_path mismatches against the real,
 * live database. Read-only (SELECT only) -- no DDL, no writes, nothing to gate behind a
 * non-production designation.
 */
import { it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { sweepComponentPathMismatches } from '../../lib/audits/stage-census/db-sweep.mjs';
import { assertNegativeControl } from '../../lib/audits/stage-census/negative-control.mjs';
import { describeDb } from '../helpers/db-available.js';

let client;

beforeAll(async () => {
  client = await createDatabaseClient('engineer', { verify: false });
}, 30000);

afterAll(async () => {
  if (client) await client.end();
});

describeDb('TS-1: negative control against the live database', () => {
  it('detects both known-live stage 21/22 component_path mismatches', async () => {
    const mismatches = await sweepComponentPathMismatches(client);
    expect(() => assertNegativeControl(mismatches)).not.toThrow();
  });
});
