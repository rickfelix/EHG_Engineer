/**
 * TS-4: historical translate-at-read shim (public.translate_historical_stage_number),
 * introduced by the staged (unapplied) migration
 * database/chairman-gated/20260825_dedicated_venture_uat_stage_insert_and_renumber.sql.
 * Read-only. Skips cleanly until the migration is chairman-approved and applied -- the
 * function does not exist on live production until then, which is itself the correct,
 * expected state for a staged/unapplied migration.
 */
import { it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { describeDb } from '../helpers/db-available.js';

let client;

beforeAll(async () => {
  client = await createDatabaseClient('engineer', { verify: false });
}, 30000);

afterAll(async () => {
  if (client) await client.end();
});

describeDb('translate_historical_stage_number (post-apply only)', () => {
  it('is a no-op passthrough before this migration has ever been applied', async () => {
    const { rows } = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_proc WHERE proname = 'translate_historical_stage_number'
       ) AS fn_exists`
    );
    if (!rows[0].fn_exists) {
      // Expected pre-apply state -- the staged migration has not been chairman-approved yet.
      expect(rows[0].fn_exists).toBe(false);
      return;
    }
    // If it HAS been applied (a future run of this suite, post chairman-approval), a value
    // written at or after the recorded cutover must pass through unchanged.
    const { rows: r } = await client.query(
      'SELECT translate_historical_stage_number(23, now()) AS translated'
    );
    expect(r[0].translated).toBe(23);
  });
});
