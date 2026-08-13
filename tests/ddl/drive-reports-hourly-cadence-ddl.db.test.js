// SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-5 — the DDL tier for
// 20260812_drive_reports_hourly_cadence.sql.
//
// Same scope disclaimer as drive-reports-ddl.db.test.js (whose pattern this mirrors): this proves
// the SQL's LOGIC against an ephemeral vanilla Postgres 16, not production RLS/role posture. The
// only thing that settles the production posture is the chairman-gated apply via
// scripts/apply-migration.js --prod-deploy.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const BASE_MIGRATION_PATH = fileURLToPath(new URL('../../database/migrations/20260803_drive_reports.sql', import.meta.url));
const HOURLY_MIGRATION_PATH = fileURLToPath(new URL('../../database/migrations/20260812_drive_reports_hourly_cadence.sql', import.meta.url));
const BASE_SQL = fs.readFileSync(BASE_MIGRATION_PATH, 'utf8');
const HOURLY_SQL = fs.readFileSync(HOURLY_MIGRATION_PATH, 'utf8');

const STUB_ROLES = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')   THEN CREATE ROLE service_role NOLOGIN;   END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')           THEN CREATE ROLE anon NOLOGIN;           END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')  THEN CREATE ROLE authenticated NOLOGIN;  END IF;
END
$roles$;`;

let client;

async function applyHourlyMigration() {
  await client.query(HOURLY_SQL);
}

beforeAll(async () => {
  // FAIL-CLOSED, matching drive-reports-ddl.db.test.js's own measured precedent: no skip branch.
  client = new pg.Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'ddl_check',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  });
  await client.connect();
  await client.query(STUB_ROLES);
  await client.query(BASE_SQL);        // the base table, at its ORIGINAL two-value CHECK
  await applyHourlyMigration();        // this SD's widening
}, 60_000);

afterAll(async () => {
  if (client) await client.end();
});

describe('20260812_drive_reports_hourly_cadence.sql — widens cadence, nothing else', () => {
  it('the widened CHECK accepts hourly', async () => {
    await expect(
      client.query("INSERT INTO public.drive_reports (run_id, sections, cadence) VALUES ('ddl-hourly-1', '{}'::jsonb, 'hourly');"),
    ).resolves.toBeTruthy();
  });

  it('the widened CHECK still accepts the original two values', async () => {
    await expect(
      client.query("INSERT INTO public.drive_reports (run_id, sections, cadence) VALUES ('ddl-sched-1', '{}'::jsonb, 'scheduled');"),
    ).resolves.toBeTruthy();
    await expect(
      client.query("INSERT INTO public.drive_reports (sections, cadence) VALUES ('{}'::jsonb, 'on_demand');"),
    ).resolves.toBeTruthy();
  });

  it('[TWO-SIDED / NEGATIVE CONTROL] the widened CHECK still REJECTS a genuinely bogus cadence', async () => {
    // Without this, a CHECK so loose it accepted anything would pass the two tests above while
    // enforcing nothing -- the exact failure mode compose-report.test.js's own negative control
    // guards against on the JS side.
    await expect(
      client.query("INSERT INTO public.drive_reports (run_id, sections, cadence) VALUES ('ddl-bogus-1', '{}'::jsonb, 'weekly');"),
    ).rejects.toThrow(/violates check constraint "drive_reports_cadence_check"/);
  });

  it('the migration is idempotent — re-running it repairs rather than errors', async () => {
    await expect(applyHourlyMigration()).resolves.not.toThrow();
    // And the widened constraint still holds after the re-run.
    await expect(
      client.query("INSERT INTO public.drive_reports (run_id, sections, cadence) VALUES ('ddl-hourly-2', '{}'::jsonb, 'hourly');"),
    ).resolves.toBeTruthy();
  });

  it('[SELF-HEAL] a manually narrowed constraint is repaired by re-running the migration', async () => {
    // The production corollary: if someone (or a rollback attempt) narrowed the constraint back,
    // re-applying this migration must restore the widened version, not merely assert it once.
    //
    // This file shares ONE table across ALL its tests (one client, no per-test transaction), and
    // two earlier tests already committed cadence='hourly' rows (ddl-hourly-1, ddl-hourly-2).
    // Postgres validates ALL existing rows when a bare ADD CONSTRAINT runs, so narrowing back to
    // ('scheduled','on_demand') while those rows exist fails with 23514 — a real, correct Postgres
    // refusal, not a bug in the migration. This test's OWN subject is "does narrow-then-reapply
    // self-heal", not "does narrowing survive incompatible data" (a real but different question),
    // so it clears its own precondition first.
    //
    // drive_reports is append-only (drive_reports_guard_delete(), base migration 20260803): a bare
    // DELETE is refused unless the same transaction declares SET LOCAL drive_reports.allow_delete
    // = 'on' first — SET LOCAL's scope ends at COMMIT, matching the established pattern in
    // drive-reports-ddl.db.test.js's own delete-permission tests.
    await client.query('BEGIN');
    await client.query("SET LOCAL drive_reports.allow_delete = 'on';");
    await client.query("DELETE FROM public.drive_reports WHERE cadence = 'hourly';");
    await client.query('COMMIT');
    await client.query('ALTER TABLE public.drive_reports DROP CONSTRAINT drive_reports_cadence_check;');
    await client.query("ALTER TABLE public.drive_reports ADD CONSTRAINT drive_reports_cadence_check CHECK (cadence IN ('scheduled', 'on_demand'));");
    await expect(
      client.query("INSERT INTO public.drive_reports (run_id, sections, cadence) VALUES ('ddl-narrowed-1', '{}'::jsonb, 'hourly');"),
    ).rejects.toThrow(/violates check constraint/);

    await applyHourlyMigration();

    await expect(
      client.query("INSERT INTO public.drive_reports (run_id, sections, cadence) VALUES ('ddl-repaired-1', '{}'::jsonb, 'hourly');"),
    ).resolves.toBeTruthy();
  });

  it('the constraint definition, read directly from pg_constraint, contains exactly the 3 expected values', async () => {
    const { rows } = await client.query(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.drive_reports'::regclass AND conname = 'drive_reports_cadence_check';
    `);
    expect(rows).toHaveLength(1);
    const def = rows[0].def;
    for (const v of ['scheduled', 'on_demand', 'hourly']) {
      expect(def, `constraint def missing '${v}': ${def}`).toMatch(new RegExp(`'${v}'`));
    }
  });
});
