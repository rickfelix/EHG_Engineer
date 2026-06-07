// SD-LEO-INFRA-POLICY-GATED-AUTO-001B
// STORAGE-LAYER meta-stability: the auto-execution engine must be UNABLE to
// write its own policy / guardrail tables, even if application code is
// compromised. The defense lives at the table-privilege layer: the engine's
// database role `leo_engine_ro` holds SELECT-ONLY grants on the four
// governance tables (leo_auto_exec_policy, leo_auto_exec_forbidden,
// leo_feature_flags, leo_kill_switches) and is NOT superuser / NOT BYPASSRLS.
// Any write it attempts therefore raises `permission denied for table ...`
// BEFORE any RLS policy or app check.
//
// HOW THIS TEST CONNECTS — DIRECT pg, NOT supabase-js:
//   `SET ROLE leo_engine_ro` is a session-level Postgres command that cannot be
//   issued over the supabase-js REST/PostgREST client (which always runs as the
//   service role and exposes no SET ROLE). The deny we are codifying is a
//   STORAGE-layer guarantee, so the test must hold a real pg socket. We open a
//   single direct `pg.Client` on SUPABASE_POOLER_URL (falling back to
//   DATABASE_URL), run the ENTIRE scenario inside ONE transaction with
//   per-statement SAVEPOINTs (a permission-denied error aborts the surrounding
//   (sub)transaction in Postgres, so each denied write is wrapped in a savepoint
//   so we can roll back to it and continue), then ROLLBACK at the end so NOTHING
//   touches committed prod state. This mirrors
//   tests/integration/migrations/cleanup-stale-sessions-respect-inflight.test.js
//   and scripts/apply-migration.js.
//
// SKIP CONTRACT: when no direct pg connection string is configured (CI without
// DB secrets / local without creds) the suite SKIPS cleanly via describeDb's
// HAS_REAL_DB guard AND a local connection-string guard — it never reds.

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
// trust store; mirror apply-migration.js for this READ-then-ROLLBACK probe.
function makeSslConfig() {
  return { rejectUnauthorized: false };
}

const GOVERNANCE_TABLES = [
  'leo_auto_exec_policy',
  'leo_auto_exec_forbidden',
  'leo_feature_flags',
  'leo_kill_switches',
];

describe.skipIf(!HAS_DB)(
  'SD-LEO-INFRA-POLICY-GATED-AUTO-001B: storage-layer meta-stability (leo_engine_ro write-deny)',
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

    // Helper: run `sql` and expect a permission-denied error, wrapped in a
    // savepoint so the aborted (sub)transaction can be rolled back and the
    // suite continues.
    async function expectPermissionDenied(sql) {
      await client.query('SAVEPOINT sp');
      try {
        await client.query(sql);
        await client.query('RELEASE SAVEPOINT sp');
        return { denied: false, message: null };
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        return { denied: true, message: String(e.message || e) };
      }
    }

    it('the migration objects exist: 2 tables (RLS on) + restricted non-privileged role + SELECT-only grants', async () => {
      const tabs = await client.query(
        `SELECT c.relname, c.relrowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname IN ('leo_auto_exec_policy','leo_auto_exec_forbidden')
          ORDER BY c.relname`
      );
      expect(tabs.rows.map(r => r.relname)).toEqual([
        'leo_auto_exec_forbidden',
        'leo_auto_exec_policy',
      ]);
      // RLS enabled on both new tables.
      expect(tabs.rows.every(r => r.relrowsecurity === true)).toBe(true);

      // Role exists and is NOT superuser / NOT bypassrls / NOT login.
      const role = await client.query(
        `SELECT rolsuper, rolbypassrls, rolcanlogin
           FROM pg_roles WHERE rolname = 'leo_engine_ro'`
      );
      expect(role.rowCount).toBe(1);
      expect(role.rows[0].rolsuper).toBe(false);
      expect(role.rows[0].rolbypassrls).toBe(false);
      expect(role.rows[0].rolcanlogin).toBe(false);

      // SELECT-only grants on the four governance tables — and NO write grant.
      const grants = await client.query(
        `SELECT table_name, privilege_type
           FROM information_schema.role_table_grants
          WHERE grantee = 'leo_engine_ro'
            AND table_name = ANY($1::text[])
          ORDER BY table_name, privilege_type`,
        [GOVERNANCE_TABLES]
      );
      const byTable = {};
      for (const g of grants.rows) {
        (byTable[g.table_name] ??= []).push(g.privilege_type);
      }
      for (const t of GOVERNANCE_TABLES) {
        expect(byTable[t], `expected grants on ${t}`).toEqual(['SELECT']);
      }
    });

    it('SET ROLE leo_engine_ro: SELECT works, but ALL writes are denied at the storage layer; operator (service-role) can write', async () => {
      await client.query('BEGIN');
      inTxn = true;

      // --- under the restricted engine role ---
      await client.query('SET ROLE leo_engine_ro');
      expect((await client.query('SELECT current_user')).rows[0].current_user).toBe('leo_engine_ro');

      // SELECT must NOT raise a permission error on any governance table.
      // (RLS may filter rows to zero for this non-owner role; we assert only
      // that the SELECT *privilege* is present, not a specific row count.)
      for (const t of GOVERNANCE_TABLES) {
        await expect(
          client.query(`SELECT count(*) FROM public.${t}`)
        ).resolves.toBeDefined();
      }

      // Every write must be denied with "permission denied for table".
      const denials = {
        'UPDATE leo_auto_exec_policy': await expectPermissionDenied(
          `UPDATE public.leo_auto_exec_policy SET updated_at = now() WHERE action_class = '__none__'`
        ),
        'INSERT leo_feature_flags': await expectPermissionDenied(
          `INSERT INTO public.leo_feature_flags (flag_key, display_name) VALUES ('engine_attempt','engine attempt')`
        ),
        'DELETE leo_kill_switches': await expectPermissionDenied(
          `DELETE FROM public.leo_kill_switches WHERE switch_key = '__none__'`
        ),
        'INSERT leo_auto_exec_policy': await expectPermissionDenied(
          `INSERT INTO public.leo_auto_exec_policy (action_class) VALUES ('engine_attempt')`
        ),
        'INSERT leo_auto_exec_forbidden': await expectPermissionDenied(
          `INSERT INTO public.leo_auto_exec_forbidden (action_class) VALUES ('engine_attempt')`
        ),
      };
      for (const [label, res] of Object.entries(denials)) {
        expect(res.denied, `${label} should be denied`).toBe(true);
        expect(res.message, `${label} error text`).toMatch(/permission denied for table/i);
      }

      // --- back to the operator (service-role / postgres) ---
      await client.query('RESET ROLE');
      expect((await client.query('SELECT current_user')).rows[0].current_user).not.toBe('leo_engine_ro');

      // Operator CAN write the policy table (asserted in-txn; rolled back).
      await client.query('SAVEPOINT op');
      await client.query(
        `INSERT INTO public.leo_auto_exec_policy (action_class, preconditions)
         VALUES ('__operator_probe__', '{"k":true}'::jsonb)`
      );
      const probe = await client.query(
        `SELECT count(*)::int AS n FROM public.leo_auto_exec_policy WHERE action_class = '__operator_probe__'`
      );
      expect(probe.rows[0].n).toBe(1);
      await client.query('ROLLBACK TO SAVEPOINT op');

      // Operator CAN write a feature flag too.
      await client.query('SAVEPOINT op2');
      await expect(
        client.query(
          `INSERT INTO public.leo_feature_flags (flag_key, display_name) VALUES ('__operator_probe__','operator probe')`
        )
      ).resolves.toBeDefined();
      await client.query('ROLLBACK TO SAVEPOINT op2');

      // Roll back the whole scenario — zero committed prod impact.
      await client.query('ROLLBACK');
      inTxn = false;

      // Confirm nothing leaked.
      const leftover = await client.query(
        `SELECT count(*)::int AS n FROM public.leo_auto_exec_policy WHERE action_class = '__operator_probe__'`
      );
      expect(leftover.rows[0].n).toBe(0);
    });
  }
);
