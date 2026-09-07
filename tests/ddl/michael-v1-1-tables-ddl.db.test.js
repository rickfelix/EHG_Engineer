// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J — the DDL tier for
// database/migrations/20260907_michael_v1_1_tables.sql.
//
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN: same posture as
// tests/ddl/michael-tables-ddl.db.test.js — it proves the migration's own DDL/REVOKE/$verify$ logic
// against an EPHEMERAL vanilla PostgreSQL 16 with hand-stubbed roles, a second apply is a no-op, and
// the DOWN restores. It does not prove production's pg_default_acl or PostgREST reachability.
//
// This migration REUSES public.michael_set_updated_at() from child B's migration (never re-creates
// it) — so child B's UP_SQL is applied first in this container, exactly reproducing the real apply
// order the chairman will use (child B already applied in production).
//
// FAIL-CLOSED, no skip branch (tests/ddl convention): unreachable database => loud failure.
//
// NOTE: this repo's vitest |db| project excludes **/.worktrees/** (mirrors the E2E
// testIgnore-worktree constraint, QF-20260818-126) — this file collects ZERO tests if run from
// inside a .worktrees checkout. Verify from the main checkout post-merge, never trust a bare
// exit-0 from inside a worktree.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const V1_UP_PATH = fileURLToPath(new URL('../../database/migrations/20260906_michael_tables.sql', import.meta.url));
const UP_PATH = fileURLToPath(new URL('../../database/migrations/20260907_michael_v1_1_tables.sql', import.meta.url));
const DOWN_PATH = fileURLToPath(new URL('../../database/migrations/20260907_michael_v1_1_tables_DOWN.sql', import.meta.url));
const V1_UP_SQL = fs.readFileSync(V1_UP_PATH, 'utf8');
const UP_SQL = fs.readFileSync(UP_PATH, 'utf8');
const DOWN_SQL = fs.readFileSync(DOWN_PATH, 'utf8');

const V1_1_TABLES = ['michael_oracle_history', 'michael_oracle_alignment', 'michael_health_daily', 'michael_check_in_journal'];
const PRIVILEGE_TYPES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];

function extractDollarQuotedDoBlock(sql, tag) {
  const marker = `$${tag}$`;
  const firstIdx = sql.indexOf(marker);
  if (firstIdx === -1) throw new Error(`extractDollarQuotedDoBlock: marker ${marker} not found`);
  const secondIdx = sql.indexOf(marker, firstIdx + marker.length);
  if (secondIdx === -1) throw new Error(`extractDollarQuotedDoBlock: closing marker ${marker} not found`);
  const blockEnd = secondIdx + marker.length;
  const doStart = sql.lastIndexOf('DO', firstIdx);
  const semiIdx = sql.indexOf(';', blockEnd);
  if (doStart === -1 || semiIdx === -1) throw new Error(`extractDollarQuotedDoBlock: could not bound the DO...; statement for ${marker}`);
  return sql.slice(doStart, semiIdx + 1);
}
const VERIFY_BLOCK_SQL = extractDollarQuotedDoBlock(UP_SQL, 'verify');

const STUB_ROLES = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
`;

let client;
async function privilegeState(role, table) {
  const result = {};
  for (const priv of PRIVILEGE_TYPES) {
    const { rows } = await client.query('SELECT has_table_privilege($1, $2, $3) AS ok', [role, `public.${table}`, priv]);
    result[priv] = rows[0].ok;
  }
  return result;
}
async function relationExists(table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS r', [`public.${table}`]);
  return rows[0].r !== null;
}

beforeAll(async () => {
  client = new pg.Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'ddl_check',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  });
  await client.connect();
  await client.query(STUB_ROLES);
  // Reproduce the real apply order: child B's migration lands the shared trigger function and the
  // eleven v1 tables this migration's own verify block checks it did NOT disturb.
  await client.query(V1_UP_SQL);
  await client.query(DOWN_SQL); // clean slate if a prior run left the v1.1 tables
  await client.query(UP_SQL);
}, 120_000);

afterAll(async () => {
  if (client) await client.end();
});

describe('apply: four v1.1 tables, service-role-only, verify block runs, shared function untouched', () => {
  it('all four relations exist', async () => {
    for (const t of V1_1_TABLES) expect(await relationExists(t), t).toBe(true);
  });

  it.each(V1_1_TABLES)('%s: anon and authenticated hold none of the 7 privileges; service_role holds all', async (t) => {
    const anon = await privilegeState('anon', t);
    const auth = await privilegeState('authenticated', t);
    const svc = await privilegeState('service_role', t);
    for (const p of PRIVILEGE_TYPES) {
      expect(anon[p], `anon ${p} on ${t}`).toBe(false);
      expect(auth[p], `authenticated ${p} on ${t}`).toBe(false);
      expect(svc[p], `service_role ${p} on ${t}`).toBe(true);
    }
  });

  it.each(V1_1_TABLES)('%s: RLS on, exactly one FOR ALL policy TO service_role', async (t) => {
    const { rows: rls } = await client.query('SELECT relrowsecurity FROM pg_class WHERE oid = $1::regclass', [`public.${t}`]);
    expect(rls[0].relrowsecurity).toBe(true);
    const { rows } = await client.query(
      "SELECT policyname, array_to_string(roles, ',') AS roles, cmd FROM pg_policies WHERE schemaname='public' AND tablename=$1",
      [t],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].policyname).toBe(`${t}_service_role`);
    expect(rows[0].roles).toBe('service_role');
    expect(rows[0].cmd).toBe('ALL');
  });

  it("the migration's own DO $verify$ block passes against the applied schema", async () => {
    await expect(client.query(VERIFY_BLOCK_SQL)).resolves.toBeDefined();
  });

  it('the shared trigger function still exists and is still service_role-only executable (v1 tables depend on it)', async () => {
    const { rows } = await client.query(`
      SELECT has_function_privilege('anon', 'public.michael_set_updated_at()', 'EXECUTE') AS anon,
             has_function_privilege('authenticated', 'public.michael_set_updated_at()', 'EXECUTE') AS auth,
             has_function_privilege('service_role', 'public.michael_set_updated_at()', 'EXECUTE') AS svc
    `);
    expect(rows[0]).toEqual({ anon: false, auth: false, svc: true });
  });

  it('the eleven v1 tables from child B are untouched (still present)', async () => {
    const { rows } = await client.query("SELECT to_regclass('public.michael_rules') AS r");
    expect(rows[0].r).not.toBeNull();
  });

  it('behaviour: (et_date, seq) natural key enforces uniqueness, surrogate id allows a retry with a new seq', async () => {
    await client.query("INSERT INTO public.michael_oracle_history (et_date, seq, content) VALUES ('2026-09-07', 1, 'first')");
    await expect(client.query(
      "INSERT INTO public.michael_oracle_history (et_date, seq, content) VALUES ('2026-09-07', 1, 'dup')",
    )).rejects.toMatchObject({ code: '23505' });
    await expect(client.query(
      "INSERT INTO public.michael_oracle_history (et_date, seq, content) VALUES ('2026-09-07', 2, 'second')",
    )).resolves.toBeDefined();
    await client.query("DELETE FROM public.michael_oracle_history WHERE et_date = '2026-09-07'");
  });

  it('behaviour: one-row-per-day tables enforce a single row per et_date', async () => {
    await client.query("INSERT INTO public.michael_health_daily (et_date, metrics) VALUES ('2026-09-07', '{}'::jsonb)");
    await expect(client.query(
      "INSERT INTO public.michael_health_daily (et_date, metrics) VALUES ('2026-09-07', '{}'::jsonb)",
    )).rejects.toMatchObject({ code: '23505' });
    await client.query("DELETE FROM public.michael_health_daily WHERE et_date = '2026-09-07'");
  });

  it('SEC-M5: the verify block goes RED when a table is exposed (it can fail, not only pass)', async () => {
    await client.query('GRANT SELECT ON public.michael_health_daily TO anon');
    await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toMatchObject({ message: expect.stringMatching(/anon can SELECT|non-service table grant/) });
    await client.query('REVOKE ALL ON public.michael_health_daily FROM anon');
    await expect(client.query(VERIFY_BLOCK_SQL)).resolves.toBeDefined();
  });

  it('a second apply is a no-op (idempotent DDL) and the verify block still passes', async () => {
    await expect(client.query(UP_SQL)).resolves.toBeDefined();
    await expect(client.query(VERIFY_BLOCK_SQL)).resolves.toBeDefined();
  });
});

describe('DOWN restores', () => {
  it('drops the four v1.1 relations but NEVER the shared trigger function or the eleven v1 tables', async () => {
    await client.query('CREATE TABLE IF NOT EXISTS public.ddl_bystander_michael_v11 (id int)');
    await client.query(DOWN_SQL);
    for (const t of V1_1_TABLES) expect(await relationExists(t), t).toBe(false);
    const { rows } = await client.query("SELECT to_regprocedure('public.michael_set_updated_at()') AS f");
    expect(rows[0].f).not.toBeNull();
    expect(await relationExists('michael_rules')).toBe(true);
    expect(await relationExists('ddl_bystander_michael_v11')).toBe(true);
    await client.query('DROP TABLE public.ddl_bystander_michael_v11');
  });
});
