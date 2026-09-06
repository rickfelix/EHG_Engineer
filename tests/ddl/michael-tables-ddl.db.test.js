// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-7, TS-13) — the DDL tier for
// database/migrations/20260906_michael_tables.sql.
//
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN: it runs against an EPHEMERAL vanilla PostgreSQL 16
// with hand-stubbed roles. It proves the migration's own DDL, REVOKE and $verify$ logic do what they
// claim from an empty schema, that a second apply is a no-op, and that the DOWN restores. It does not
// prove production's pg_default_acl still matches the 2026-09-06 measurement (re-measure live before
// the chairman applies), nor PostgREST/anon-key HTTP reachability (a SECURITY-tier probe).
//
// FAIL-CLOSED, no skip branch (tests/ddl convention): unreachable database => loud failure.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const UP_PATH = fileURLToPath(new URL('../../database/migrations/20260906_michael_tables.sql', import.meta.url));
const DOWN_PATH = fileURLToPath(new URL('../../database/migrations/20260906_michael_tables_DOWN.sql', import.meta.url));
const UP_SQL = fs.readFileSync(UP_PATH, 'utf8');
const DOWN_SQL = fs.readFileSync(DOWN_PATH, 'utf8');

const MICHAEL_TABLES = [
  'michael_rules', 'michael_gmail_labels', 'michael_closures', 'michael_feedback_ledger',
  'michael_feeder_runs', 'michael_calendar_day', 'michael_gmail_triage_items',
  'michael_todoist_snapshot', 'michael_brief_runs', 'michael_credentials', 'michael_staged_items',
];
const PRIVILEGE_TYPES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];

// Extracted from the REAL migration text so the block under test cannot drift from what applies.
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
-- Reproduce the live pg_default_acl exposure (anon/authenticated get full DML on every new relation),
-- so the migration's REVOKE is proven to close something rather than pass vacuously.
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
  await client.query(DOWN_SQL); // clean slate if a prior run left the tables
  await client.query(UP_SQL);
}, 120_000);

afterAll(async () => {
  if (client) await client.end();
});

describe('negative control: the default-ACL exposure is real in this container', () => {
  it('a bare table created after the stub is readable by anon (so REVOKE is load-bearing)', async () => {
    await client.query('CREATE TABLE IF NOT EXISTS public.ddl_probe_michael (id int)');
    const { rows } = await client.query("SELECT has_table_privilege('anon', 'public.ddl_probe_michael', 'SELECT') AS ok");
    expect(rows[0].ok).toBe(true);
    await client.query('DROP TABLE public.ddl_probe_michael');
  });
});

describe('apply: eleven tables, service-role-only, verify block runs', () => {
  it('all eleven relations exist', async () => {
    for (const t of MICHAEL_TABLES) expect(await relationExists(t), t).toBe(true);
  });

  it.each(MICHAEL_TABLES)('%s: anon and authenticated hold none of the 7 privileges; service_role holds all', async (t) => {
    const anon = await privilegeState('anon', t);
    const auth = await privilegeState('authenticated', t);
    const svc = await privilegeState('service_role', t);
    for (const p of PRIVILEGE_TYPES) {
      expect(anon[p], `anon ${p} on ${t}`).toBe(false);
      expect(auth[p], `authenticated ${p} on ${t}`).toBe(false);
      expect(svc[p], `service_role ${p} on ${t}`).toBe(true);
    }
  });

  it.each(MICHAEL_TABLES)('%s: RLS on, exactly one FOR ALL policy TO service_role', async (t) => {
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

  it('the migration\'s own DO $verify$ block passes against the applied schema', async () => {
    await expect(client.query(VERIFY_BLOCK_SQL)).resolves.toBeDefined();
  });

  it('the trigger function is not executable by anon or authenticated', async () => {
    const { rows } = await client.query(`
      SELECT has_function_privilege('anon', 'public.michael_set_updated_at()', 'EXECUTE') AS anon,
             has_function_privilege('authenticated', 'public.michael_set_updated_at()', 'EXECUTE') AS auth,
             has_function_privilege('service_role', 'public.michael_set_updated_at()', 'EXECUTE') AS svc
    `);
    expect(rows[0]).toEqual({ anon: false, auth: false, svc: true });
  });

  it('behaviour: partial unique admits a superseded ancestor beside one active row; the autonomy CHECK binds', async () => {
    const prov = JSON.stringify({ source: 'terminal:ddl', uttered_at: '2026-09-06T00:00:00Z' });
    const { rows: first } = await client.query(
      "INSERT INTO public.michael_rules (domain, rule_key, rule_text, provenance) VALUES ('gmail', 'k1', 'v1', $1::jsonb) RETURNING id",
      [prov],
    );
    await expect(client.query(
      "INSERT INTO public.michael_rules (domain, rule_key, rule_text, provenance) VALUES ('gmail', 'k1', 'v2', $1::jsonb)",
      [prov],
    )).rejects.toMatchObject({ code: '23505' });
    await client.query("UPDATE public.michael_rules SET status = 'superseded' WHERE id = $1", [first[0].id]);
    await expect(client.query(
      "INSERT INTO public.michael_rules (domain, rule_key, rule_text, provenance, supersedes) VALUES ('gmail', 'k1', 'v2', $1::jsonb, $2)",
      [prov, first[0].id],
    )).resolves.toBeDefined();
    await expect(client.query(
      "UPDATE public.michael_rules SET auto_apply = true WHERE rule_key = 'k1' AND status = 'active'",
    )).rejects.toMatchObject({ code: '23514' });
    await expect(client.query(
      "UPDATE public.michael_rules SET auto_apply = true, auto_apply_verb = 'complete', auto_apply_since = now() WHERE rule_key = 'k1' AND status = 'active'",
    )).rejects.toMatchObject({ code: '23514' });
    const { rows: upd } = await client.query(
      "UPDATE public.michael_rules SET auto_apply = true, auto_apply_verb = 'archive', auto_apply_since = now() WHERE rule_key = 'k1' AND status = 'active' RETURNING updated_at > created_at AS bumped",
    );
    expect(upd[0].bumped).toBe(true);
    await client.query("DELETE FROM public.michael_rules WHERE rule_key = 'k1'");
  });

  it('a second apply is a no-op (idempotent DDL) and the verify block still passes', async () => {
    await expect(client.query(UP_SQL)).resolves.toBeDefined();
    await expect(client.query(VERIFY_BLOCK_SQL)).resolves.toBeDefined();
  });
});

describe('DOWN restores', () => {
  it('drops the eleven relations and the trigger function, nothing else', async () => {
    await client.query('CREATE TABLE IF NOT EXISTS public.ddl_bystander_michael (id int)');
    await client.query(DOWN_SQL);
    for (const t of MICHAEL_TABLES) expect(await relationExists(t), t).toBe(false);
    const { rows } = await client.query("SELECT to_regprocedure('public.michael_set_updated_at()') AS f");
    expect(rows[0].f).toBeNull();
    expect(await relationExists('ddl_bystander_michael')).toBe(true);
    await client.query('DROP TABLE public.ddl_bystander_michael');
  });
});
