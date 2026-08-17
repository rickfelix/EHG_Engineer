#!/usr/bin/env node
/**
 * SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001 — PRD TS-2 + TS-4 combined proof.
 *
 * Prospective TESTING review (PLAN-TO-EXEC, evidence 2399f501) found that a text-presence grep
 * for "USING ... AT TIME ZONE 'UTC'" cannot see a column-binding error and never measures the
 * actual result, and that TS-4's "fixture/dry-run" claim was vacuous with nothing really run.
 * This script runs the REAL ALTER COLUMN TYPE mechanics -- both directions, both with and
 * without the USING clause -- inside ONE transaction against a TEMP TABLE (session/transaction-
 * scoped, dropped automatically on ROLLBACK; never touches any of the 4 live tables, which would
 * hold ACCESS EXCLUSIVE and risk 55P03 against live fleet writers). The transaction ALWAYS
 * ROLLBACKs, so this is safe to run against production repeatedly.
 *
 * Read-only from the live schema's perspective: creates/mutates a TEMP TABLE only, inside a
 * transaction that never commits.
 */
import 'dotenv/config';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

const SESSION_TZ = 'America/New_York'; // non-UTC, matches tests/unit/time/pg-timestamp-tz.test.js
const OFFSET_HOURS = 4; // EDT; NAIVE_UTC_VALUE sits in July, DST in effect.
const NAIVE_UTC_VALUE = '2026-07-29 05:25:20.028'; // as stored today: a UTC instant, no designator
const EXPECTED_UTC_INSTANT = '2026-07-29T05:25:20.028Z';
// Expected result if USING is OMITTED: the implicit timestamp->timestamptz cast interprets the
// naive value via the session's TimeZone GUC (EDT, UTC-4), so the naive wall-clock reading
// '05:25:20.028' is treated as EDT and converted to UTC by ADDING the offset.
const EXPECTED_DEFAULT_CAST_INSTANT = '2026-07-29T09:25:20.028Z';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });
  const results = { usingClauseCorrect: null, negativeControlDiffers: null, downRestoresExactly: null, issues: [] };
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL TimeZone = '${SESSION_TZ}'`);

    // --- Positive proof: USING clause pins interpretation to UTC regardless of session TZ ---
    // naive_col is now `timestamptz` (an absolute instant) after this ALTER -- select it
    // DIRECTLY, never through another `AT TIME ZONE` wrapper. `timestamptz AT TIME ZONE zone`
    // converts an absolute instant back to a NAIVE wall-clock reading in that zone, which the
    // pg driver then parses as local-process-TZ text -- the exact defect class this SD exists
    // to fix, and it would silently corrupt this verification query itself if used here.
    await client.query('CREATE TEMP TABLE scratch_tz_using (id serial, naive_col timestamp) ON COMMIT DROP');
    await client.query(`INSERT INTO scratch_tz_using (naive_col) VALUES ('${NAIVE_UTC_VALUE}')`);
    await client.query(`ALTER TABLE scratch_tz_using ALTER COLUMN naive_col TYPE timestamptz USING naive_col AT TIME ZONE 'UTC'`);
    const usingResult = await client.query(`SELECT naive_col AS iso FROM scratch_tz_using`);
    const usingIso = new Date(usingResult.rows[0].iso).toISOString();
    results.usingClauseCorrect = usingIso === EXPECTED_UTC_INSTANT;
    if (!results.usingClauseCorrect) {
      results.issues.push(`USING-clause result: expected ${EXPECTED_UTC_INSTANT}, got ${usingIso}`);
    }

    // --- Negative control: omitting USING relies on the default cast, which is ALSO session-TZ
    // sensitive -- must differ from the pinned result under a non-UTC session (specifically,
    // must equal the EDT-interpreted instant), proving the clause is load-bearing rather than
    // incidentally correct. ---
    await client.query('CREATE TEMP TABLE scratch_tz_default (id serial, naive_col timestamp) ON COMMIT DROP');
    await client.query(`INSERT INTO scratch_tz_default (naive_col) VALUES ('${NAIVE_UTC_VALUE}')`);
    await client.query(`ALTER TABLE scratch_tz_default ALTER COLUMN naive_col TYPE timestamptz`); // no USING
    const defaultResult = await client.query(`SELECT naive_col AS iso FROM scratch_tz_default`);
    const defaultIso = new Date(defaultResult.rows[0].iso).toISOString();
    results.negativeControlDiffers = defaultIso !== EXPECTED_UTC_INSTANT && defaultIso === EXPECTED_DEFAULT_CAST_INSTANT;
    if (!results.negativeControlDiffers) {
      results.issues.push(`Negative control (no USING): expected the EDT-interpreted instant ${EXPECTED_DEFAULT_CAST_INSTANT} (offset +${OFFSET_HOURS}h from the pinned result), got ${defaultIso}.`);
    }

    // --- TS-4: DOWN direction bound to the SAME transaction, on the scratch_tz_using table
    // that already carries the correct timestamptz value. ---
    await client.query(`ALTER TABLE scratch_tz_using ALTER COLUMN naive_col TYPE timestamp USING (naive_col AT TIME ZONE 'UTC')`);
    const downResult = await client.query(`SELECT naive_col::text AS raw FROM scratch_tz_using`);
    const downValue = downResult.rows[0].raw;
    results.downRestoresExactly = downValue.startsWith('2026-07-29 05:25:20.028');
    if (!results.downRestoresExactly) {
      results.issues.push(`DOWN-direction restore: expected to start with '2026-07-29 05:25:20.028', got '${downValue}'`);
    }

    await client.query('ROLLBACK'); // always -- this proof never commits anything.
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection may already be aborted */ }
    results.issues.push(`Unexpected error: ${err.message}`);
  } finally {
    await client.end();
  }

  const pass = results.usingClauseCorrect && results.negativeControlDiffers && results.downRestoresExactly;
  console.log(JSON.stringify({ pass, ...results }, null, 2));
  if (!pass) process.exit(1);
}

await main();
