/**
 * Two-sided blindness test for kill_gate_sealed_predictions — SD-LEO-INFRA-KILL-GATE-TEETH-001.
 *
 * This is a GENUINE DB-level observability proof, not a mocked assertion of app logic: it opens a
 * real Postgres session (via `pg`, not the Supabase JS/PostgREST client — SET ROLE has no
 * PostgREST equivalent), assumes the identity of the traversal-side role
 * (`kill_gate_traversal_ro`) with a real `SET ROLE`, and asserts a REAL Postgres error
 * (SQLSTATE 42501, "permission denied for table") on a direct SELECT against the base table,
 * alongside a REAL, successful, filtered SELECT via the `kill_gate_teeth_discharged_predictions()`
 * SECURITY DEFINER RPC (a plain view was tried first and measured to NOT provide this boundary on
 * this hosted project — see the migration's header comment for the measured reason). See
 * database/migrations/20260829_kill_gate_sealed_predictions.sql's header comment for the full
 * design rationale and its honestly-documented residual gap (no production call site is actually
 * forced through this role yet — this test proves the mechanism works, not that it is wired in).
 *
 * SAFETY: gated by tests/helpers/db-available.js's `describeDb` (positive designation only —
 * DESIGNATED_NON_PROD_REFS is deliberately empty repo-wide, so this SKIPS everywhere today, same
 * as every other `*.db.test.js` in tests/integration/). Even when designated, every DDL side
 * effect (the table, role, view, and any rows) runs inside ONE transaction that is ALWAYS rolled
 * back in `afterAll` — nothing here is ever committed, so accidentally pointing this at a real
 * project still leaves zero residue. This is deliberately more conservative than the shipped
 * migration file (which the coordinator applies separately, non-transactionally, after review).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import 'dotenv/config';
import { describeDb } from '../../helpers/db-available.js';

const { Client } = pg;

const MIGRATION_PATH = resolve(process.cwd(), 'database/migrations/20260829_kill_gate_sealed_predictions.sql');
const HAS_POOLER_URL = Boolean(process.env.SUPABASE_POOLER_URL);

let client = null;
let migrationApplied = false;

describeDb('kill_gate_sealed_predictions — two-sided blindness (real DB)', () => {
  beforeAll(async () => {
    if (!HAS_POOLER_URL) return;
    client = new Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query('BEGIN');
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    // The migration file wraps itself in its own BEGIN/COMMIT; strip those so it composes inside
    // this test's outer transaction (nested real BEGIN/COMMIT would end the outer transaction
    // early instead of leaving everything rollback-able).
    const composable = sql.replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '');
    await client.query(composable);
    migrationApplied = true;

    // Seed one undischarged and one discharged row so the view-filter assertion is meaningful.
    await client.query(`
      INSERT INTO kill_gate_sealed_predictions (sealed_hash, sealer_identity, expected_stage, expected_verdict)
      VALUES ('${'a'.repeat(64)}', 'solomon', 5, 'fired')
    `);
    await client.query(`
      INSERT INTO kill_gate_sealed_predictions (sealed_hash, sealer_identity, expected_stage, expected_verdict, discharged_at, discharged_content)
      VALUES ('${'b'.repeat(64)}', 'solomon', 5, 'fired', now(), '{"revealed": true}'::jsonb)
    `);
  });

  afterAll(async () => {
    if (!client) return;
    // ALWAYS rollback — this test must leave zero trace regardless of pass/fail/skip.
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  });

  it('sanity: the migration applied inside this transaction', () => {
    expect(migrationApplied).toBe(true);
  });

  it('DENIES a direct SELECT against the base table under kill_gate_traversal_ro (real 42501)', async () => {
    await client.query('SET ROLE kill_gate_traversal_ro');
    await client.query('SAVEPOINT before_denied_select');
    try {
      await expect(client.query('SELECT * FROM kill_gate_sealed_predictions')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      // A failed statement aborts the enclosing Postgres transaction until rolled back to a
      // savepoint — without this, every subsequent query in this file would fail with 25P02
      // ("current transaction is aborted"), which is exactly the trap this comment exists to
      // name (measured live authoring this test).
      await client.query('ROLLBACK TO SAVEPOINT before_denied_select');
      await client.query('RESET ROLE');
    }
  });

  it('ALLOWS the discharged-only RPC, returning only discharged rows', async () => {
    await client.query('SET ROLE kill_gate_traversal_ro');
    try {
      const { rows } = await client.query('SELECT sealed_hash, discharged_at FROM kill_gate_teeth_discharged_predictions()');
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.discharged_at).not.toBeNull();
      }
      // The undischarged seed row's hash must never appear via this role's only granted surface.
      expect(rows.some((r) => r.sealed_hash === 'a'.repeat(64))).toBe(false);
      expect(rows.some((r) => r.sealed_hash === 'b'.repeat(64))).toBe(true);
    } finally {
      await client.query('RESET ROLE');
    }
  });

  // REGRESSION (SECURITY finding 30b707e0, EXEC_TO_PLAN review): the original migration revoked
  // only from PUBLIC. This project's ALTER DEFAULT PRIVILEGES grants anon/authenticated their own
  // BY-NAME privileges on every new public table -- NOT via the PUBLIC pseudo-role -- so a
  // PUBLIC-only revoke revoked a grant that was never there, leaving both new tables fully
  // anon-readable/writable with RLS disabled. This is the more consequential half of the blindness
  // proof: kill_gate_traversal_ro is not reachable from the internet, but anon is (it is the
  // Supabase client's default unauthenticated role). A green suite that only exercised
  // kill_gate_traversal_ro would have shipped an open table alongside a passing "blindness" test.
  it('REGRESSION: DENIES anon (the internet-reachable default role) on the base table (real 42501)', async () => {
    // SAVEPOINT taken BEFORE SET ROLE (SECURITY re-verify 4bd6b5bc): unlike kill_gate_traversal_ro
    // (which has an explicit membership grant asserted elsewhere), nothing here proves SET ROLE
    // anon itself cannot fail -- if it did, a savepoint taken only after it would never exist,
    // and the finally block's ROLLBACK TO SAVEPOINT would itself error, cascading 25P02 into every
    // later test in this file. Savepoint-first means SET ROLE's own failure is equally recoverable.
    await client.query('SAVEPOINT before_anon_denied_select');
    try {
      await client.query('SET ROLE anon');
      await expect(client.query('SELECT * FROM kill_gate_sealed_predictions')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT before_anon_denied_select');
      await client.query('RESET ROLE');
    }
  });

  it('REGRESSION: DENIES anon EXECUTE on the discharged-predictions RPC', async () => {
    await client.query('SAVEPOINT before_anon_denied_rpc');
    try {
      await client.query('SET ROLE anon');
      await expect(client.query('SELECT * FROM kill_gate_teeth_discharged_predictions()')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT before_anon_denied_rpc');
      await client.query('RESET ROLE');
    }
  });

  it('REGRESSION: DENIES anon on kill_gate_teeth_proof_records (the Solomon-facing report table)', async () => {
    await client.query('SAVEPOINT before_anon_denied_records');
    try {
      await client.query('SET ROLE anon');
      await expect(client.query('SELECT * FROM kill_gate_teeth_proof_records')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT before_anon_denied_records');
      await client.query('RESET ROLE');
    }
  });

  it('the migration\'s own post-apply verification block does not raise inside this transaction', async () => {
    // The migration's DO $verify$ block already ran during beforeAll's composable apply (it is
    // part of the same SQL file). If any of its has_table_privilege/relrowsecurity assertions had
    // failed, client.query(composable) in beforeAll would have thrown and migrationApplied would
    // be false -- this is a structural confirmation, not a new query.
    expect(migrationApplied).toBe(true);
  });
});
