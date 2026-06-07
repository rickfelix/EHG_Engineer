// SD-LEO-INFRA-POLICY-GATED-AUTO-001C
// Auto-execution engine control-loop DB guarantees:
//   1. leo_auto_exec_audit is APPEND-ONLY — owner/service-role can INSERT, but
//      UPDATE and DELETE are blocked by a BEFORE trigger that RAISES (the hard
//      guarantee, independent of grants).
//   2. 001B carry-forward — the restricted engine role leo_engine_ro can now
//      SELECT the seeded leo_auto_exec_forbidden rows (RLS SELECT policy added)
//      while every write to the policy/forbidden tables is STILL denied at the
//      storage (table-privilege) layer ("permission denied for table ...").
//      i.e. the 001B write-deny did NOT regress.
//
// HOW THIS TEST CONNECTS — DIRECT pg, NOT supabase-js:
//   `SET ROLE leo_engine_ro` is a session-level Postgres command that cannot be
//   issued over supabase-js (always runs as service role, no SET ROLE). We open
//   a single direct `pg.Client` on SUPABASE_POOLER_URL (falling back to
//   DATABASE_URL), run the ENTIRE scenario inside ONE transaction with
//   per-statement SAVEPOINTs (a permission-denied / trigger error aborts the
//   surrounding (sub)transaction, so each expected-failure write is wrapped in a
//   savepoint we roll back to and continue), then ROLLBACK at the end so NOTHING
//   touches committed prod state. This mirrors
//   tests/integration/auto-exec-policy.db.test.js exactly.
//
// SKIP CONTRACT: when no direct pg connection string is configured (CI without
// DB secrets / local without creds) the suite SKIPS cleanly via HAS_REAL_DB AND
// a local connection-string guard — it never reds.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import dotenv from 'dotenv';
import { HAS_REAL_DB } from '../helpers/db-available.js';

dotenv.config();

// Direct-pg connection string. Strip any sslmode= param the way
// scripts/lib/supabase-connection.js does so node-postgres' own ssl config wins.
function resolveConnString() {
  const raw = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || '';
  if (!raw) return null;
  return raw.replace(/[?&]sslmode=[^&]*/i, '');
}

const CONN_STRING = resolveConnString();
// Run only when BOTH a real Supabase env is configured (db-available helper)
// AND we have a direct pg connection string for SET ROLE.
const HAS_DB = Boolean(HAS_REAL_DB && CONN_STRING);

// Pooler presents a self-signed Supabase Root 2021 CA absent from the local
// trust store; mirror apply-migration.js for this READ/INSERT-then-ROLLBACK probe.
function makeSslConfig() {
  return { rejectUnauthorized: false };
}

describe.skipIf(!HAS_DB)(
  'SD-LEO-INFRA-POLICY-GATED-AUTO-001C: auto-exec engine audit (append-only) + 001B carry-forward (leo_engine_ro SELECT)',
  () => {
    /** @type {import('pg').Client} */
    let client;
    let inTxn = false;

    beforeAll(async () => {
      client = new Client({ connectionString: CONN_STRING, ssl: makeSslConfig() });
      await client.connect();
    });

    afterAll(async () => {
      if (client) {
        if (inTxn) {
          try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
        }
        await client.end().catch(() => {});
      }
    });

    // Helper: run `sql` and expect it to FAIL, wrapped in a savepoint so the
    // aborted (sub)transaction can be rolled back and the suite continues.
    async function expectError(sql) {
      await client.query('SAVEPOINT sp');
      try {
        await client.query(sql);
        await client.query('RELEASE SAVEPOINT sp');
        return { failed: false, message: null };
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        return { failed: true, message: String(e.message || e) };
      }
    }

    it('migration objects exist: leo_auto_exec_audit (RLS on) + append-only trigger + SELECT-only grant for leo_engine_ro', async () => {
      const tab = await client.query(
        `SELECT c.relrowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'leo_auto_exec_audit'`
      );
      expect(tab.rowCount).toBe(1);
      expect(tab.rows[0].relrowsecurity).toBe(true);

      // Append-only trigger present, firing BEFORE UPDATE OR DELETE.
      const trg = await client.query(
        `SELECT t.tgname
           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE c.relname = 'leo_auto_exec_audit'
            AND NOT t.tgisinternal
            AND t.tgname = 'trg_leo_auto_exec_audit_append_only'`
      );
      expect(trg.rowCount).toBe(1);

      // leo_engine_ro holds SELECT-only on the audit table (no write grant).
      const grants = await client.query(
        `SELECT privilege_type
           FROM information_schema.role_table_grants
          WHERE grantee = 'leo_engine_ro' AND table_name = 'leo_auto_exec_audit'
          ORDER BY privilege_type`
      );
      expect(grants.rows.map(r => r.privilege_type)).toEqual(['SELECT']);
    });

    it('leo_auto_exec_audit is APPEND-ONLY: owner can INSERT; UPDATE and DELETE RAISE', async () => {
      await client.query('BEGIN');
      inTxn = true;

      // (a) owner / service-role INSERT works.
      const ins = await client.query(
        `INSERT INTO public.leo_auto_exec_audit
            (run_id, action_class, phase, target, decision, snapshot, outcome, detail)
         VALUES (gen_random_uuid(), 'test_class', 'EXEC', 'test_target',
                 '{"d":1}'::jsonb, '{"s":2}'::jsonb, 'ok', '{"k":"v"}'::jsonb)
         RETURNING id`
      );
      expect(ins.rowCount).toBe(1);
      const id = ins.rows[0].id;

      // (b) UPDATE must RAISE (append-only trigger).
      const upd = await expectError(
        `UPDATE public.leo_auto_exec_audit SET outcome = 'tamper' WHERE id = '${id}'`
      );
      expect(upd.failed, 'UPDATE should be blocked').toBe(true);
      expect(upd.message, 'UPDATE error text').toMatch(/append-only/i);

      // (b) DELETE must RAISE (append-only trigger).
      const del = await expectError(
        `DELETE FROM public.leo_auto_exec_audit WHERE id = '${id}'`
      );
      expect(del.failed, 'DELETE should be blocked').toBe(true);
      expect(del.message, 'DELETE error text').toMatch(/append-only/i);

      // Roll back the whole scenario — zero committed prod impact.
      await client.query('ROLLBACK');
      inTxn = false;
    });

    it('001B carry-forward: SET ROLE leo_engine_ro reads forbidden rows (>0) but ALL policy/forbidden/audit writes stay denied', async () => {
      await client.query('BEGIN');
      inTxn = true;

      await client.query('SET ROLE leo_engine_ro');
      expect((await client.query('SELECT current_user')).rows[0].current_user).toBe('leo_engine_ro');

      // SELECT now RETURNS the seeded forbidden rows (>0) — the carry-forward
      // SELECT RLS policy un-filters reads for leo_engine_ro. Before this
      // migration, RLS filtered every row out (count was 0 despite the grant).
      const forbidden = await client.query(
        'SELECT count(*)::int AS n FROM public.leo_auto_exec_forbidden'
      );
      expect(forbidden.rows[0].n).toBeGreaterThan(0);

      // The policy SELECT must also succeed (privilege present, RLS un-filtered);
      // we assert it does not raise — row count may legitimately be 0 (unseeded).
      await expect(
        client.query('SELECT count(*) FROM public.leo_auto_exec_policy')
      ).resolves.toBeDefined();

      // The engine can also READ its own audit log.
      await expect(
        client.query('SELECT count(*) FROM public.leo_auto_exec_audit')
      ).resolves.toBeDefined();

      // Writes to policy/forbidden are STILL denied at the storage layer — the
      // 001B write-deny did NOT regress.
      const writeDenials = {
        'UPDATE leo_auto_exec_policy': await expectError(
          `UPDATE public.leo_auto_exec_policy SET updated_at = now() WHERE action_class = '__none__'`
        ),
        'INSERT leo_auto_exec_policy': await expectError(
          `INSERT INTO public.leo_auto_exec_policy (action_class) VALUES ('engine_attempt')`
        ),
        'INSERT leo_auto_exec_forbidden': await expectError(
          `INSERT INTO public.leo_auto_exec_forbidden (action_class) VALUES ('engine_attempt')`
        ),
        'DELETE leo_auto_exec_forbidden': await expectError(
          `DELETE FROM public.leo_auto_exec_forbidden WHERE action_class = '__none__'`
        ),
        'INSERT leo_auto_exec_audit': await expectError(
          `INSERT INTO public.leo_auto_exec_audit (action_class) VALUES ('engine_attempt')`
        ),
      };
      for (const [label, res] of Object.entries(writeDenials)) {
        expect(res.failed, `${label} should be denied`).toBe(true);
        expect(res.message, `${label} error text`).toMatch(/permission denied for table/i);
      }

      await client.query('RESET ROLE');
      await client.query('ROLLBACK');
      inTxn = false;
    });
  }
);
