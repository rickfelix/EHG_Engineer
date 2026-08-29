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
});
