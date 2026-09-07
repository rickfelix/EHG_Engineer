/**
 * REAL, DB-backed round-trip proof for SD-LEO-INFRA-FIXTURE-VENTURES-IDENTIFIED-001's exit
 * predicate: "a newly created fixture venture carries is_demo=true at INSERT time, verified by
 * reading the row immediately after creation with no sweep having run."
 *
 * WHY THIS EXISTS SEPARATELY FROM tests/unit/governance/fixture-producer-guard.test.js. That
 * suite is deliberately mocked (NO DATABASE, per its own header) because this repo's vitest `db`
 * project has no designated non-production target and anything placed there SKIPS AND REPORTS
 * GREEN. A mocked insert() that only pushes to an array can satisfy every assertion in that suite
 * without ever proving a real write-then-read -- exactly the gap a PLAN-TO-EXEC TESTING sub-agent
 * review found in this SD's original PRD before any code was written. This test closes it: it
 * inserts a real row via insertGuarded(), then performs a SEPARATE SELECT (not the insert's own
 * .select().single() chain, which could in principle return stale/local data) to prove the flag
 * actually landed in the database, with no backfill sweep invoked anywhere in this file.
 *
 * Uses real Supabase service-role connection (requires .env). Skipped if no real DB.
 * Creates a disposable venture; cleaned up in afterAll.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { describeDb } from '../../helpers/db-available.js';
import { insertGuarded, CLASSIFICATION } from '../../../lib/governance/fixture-producer-guard.mjs';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ts = Date.now();
const createdVentureIds = [];

describeDb('insertGuarded FIXTURE round-trip (real DB) — SD-LEO-INFRA-FIXTURE-VENTURES-IDENTIFIED-001', () => {
  afterAll(async () => {
    if (createdVentureIds.length) {
      await supabase.from('ventures').delete().in('id', createdVentureIds);
    }
  });

  it('a fixture-shaped-name row with is_demo omitted still reads back is_demo=true after a real insert', async () => {
    const row = { name: `__e2e_fixture_guard_realdb_${ts}__`, problem_statement: 'FR-5 round-trip fixture' };
    const { data: inserted, error } = await insertGuarded(supabase, 'ventures', row, {
      classification: CLASSIFICATION.FIXTURE, source: 'tests/integration/governance/fixture-producer-guard-is-demo-realdb.test.js',
    }).select('id').single();
    expect(error).toBeNull();
    createdVentureIds.push(inserted.id);

    // A SEPARATE read, not the insert's own .select() chain -- proves the flag actually landed
    // in the database, not merely in the object the client happened to echo back.
    const { data: readBack, error: readError } = await supabase
      .from('ventures')
      .select('is_demo')
      .eq('id', inserted.id)
      .single();
    expect(readError).toBeNull();
    expect(readBack.is_demo).toBe(true);
  });

  it('a row with no fixture-shaped name at all still reads back is_demo=true, because is_demo was set explicitly (not relying on the name heuristic)', async () => {
    const row = {
      name: `Ordinary Name With No Fixture Marker ${ts}`,
      problem_statement: 'FR-5 round-trip fixture -- explicit flag path',
      is_demo: true,
    };
    const { data: inserted, error } = await insertGuarded(supabase, 'ventures', row, {
      classification: CLASSIFICATION.FIXTURE, source: 'tests/integration/governance/fixture-producer-guard-is-demo-realdb.test.js',
    }).select('id').single();
    expect(error).toBeNull();
    createdVentureIds.push(inserted.id);

    const { data: readBack, error: readError } = await supabase
      .from('ventures')
      .select('is_demo')
      .eq('id', inserted.id)
      .single();
    expect(readError).toBeNull();
    expect(readBack.is_demo).toBe(true);
  });

  it('the backfill sweep finds nothing to do against a batch just created by insertGuarded — no sweep was needed', async () => {
    // Confirms this SD's exit predicate directly: a fresh insertGuarded-created batch never
    // needs scripts/backfill-fixture-venture-flags.mjs to correct it, because the flag is already
    // correct at insert time. This queries the same shape that script's isFixtureVenture-forced-
    // false candidate check uses, scoped to only the rows this test created.
    const { data: stillWrong, error } = await supabase
      .from('ventures')
      .select('id, is_demo')
      .in('id', createdVentureIds)
      .eq('is_demo', false);
    expect(error).toBeNull();
    expect(stillWrong).toEqual([]);
  });
});
