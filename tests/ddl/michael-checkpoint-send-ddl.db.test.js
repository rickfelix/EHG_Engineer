// SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001 — the DDL tier for
// database/migrations/20260914_michael_checkpoint_send.sql.
//
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN: same posture as
// tests/ddl/michael-tables-ddl.db.test.js / michael-v1-1-tables-ddl.db.test.js — it proves the
// migration's own DDL/REVOKE/$verify$/partial-unique-index logic against an EPHEMERAL vanilla
// PostgreSQL 16 with hand-stubbed roles, that a second apply is a no-op, and the DOWN restores. It
// does not prove production's pg_default_acl or PostgREST reachability, and does NOT require the
// chairman to have applied anything (TESTING H2 — this is the instrument that proves FR-7's
// DB-level dedup constraint, which a stubbed-client unit test cannot).
//
// This migration REUSES public.michael_set_updated_at() from the base michael tables migration
// (never re-creates it) — so 20260906_michael_tables.sql is applied first in this container,
// exactly reproducing the real apply order the chairman will use (it is already applied in
// production).
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

const BASE_UP_PATH = fileURLToPath(new URL('../../database/migrations/20260906_michael_tables.sql', import.meta.url));
const UP_PATH = fileURLToPath(new URL('../../database/migrations/20260914_michael_checkpoint_send.sql', import.meta.url));
const DOWN_PATH = fileURLToPath(new URL('../../database/migrations/20260914_michael_checkpoint_send_DOWN.sql', import.meta.url));
const BASE_UP_SQL = fs.readFileSync(BASE_UP_PATH, 'utf8');
const UP_SQL = fs.readFileSync(UP_PATH, 'utf8');
const DOWN_SQL = fs.readFileSync(DOWN_PATH, 'utf8');

const TABLES = ['michael_checkpoint_send_ledger', 'michael_checkpoint_send_enabled'];
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
  // Reproduce the real apply order: the base migration lands the shared trigger function this
  // migration's own verify block checks it did NOT disturb.
  await client.query(BASE_UP_SQL);
  await client.query(DOWN_SQL); // clean slate if a prior run left the checkpoint-send tables
  await client.query(UP_SQL);
}, 120_000);

afterAll(async () => {
  if (client) await client.end();
});

describe('apply: two checkpoint-send tables, service-role-only, verify block runs, shared function untouched', () => {
  it('both relations exist', async () => {
    for (const t of TABLES) expect(await relationExists(t), t).toBe(true);
  });

  it.each(TABLES)('%s: anon and authenticated hold none of the 7 privileges; service_role holds all', async (t) => {
    const anon = await privilegeState('anon', t);
    const auth = await privilegeState('authenticated', t);
    const svc = await privilegeState('service_role', t);
    for (const p of PRIVILEGE_TYPES) {
      expect(anon[p], `anon ${p} on ${t}`).toBe(false);
      expect(auth[p], `authenticated ${p} on ${t}`).toBe(false);
      expect(svc[p], `service_role ${p} on ${t}`).toBe(true);
    }
  });

  it.each(TABLES)('%s: RLS on, exactly one FOR ALL policy TO service_role', async (t) => {
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

  it('the seeded checkpoint_send config row landed, enabled=true', async () => {
    const { rows } = await client.query("SELECT enabled FROM public.michael_checkpoint_send_enabled WHERE config_key = 'checkpoint_send'");
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(true);
  });

  it('the shared trigger function still exists and is still service_role-only executable (other michael_* tables depend on it)', async () => {
    const { rows } = await client.query(`
      SELECT has_function_privilege('anon', 'public.michael_set_updated_at()', 'EXECUTE') AS anon,
             has_function_privilege('authenticated', 'public.michael_set_updated_at()', 'EXECUTE') AS auth,
             has_function_privilege('service_role', 'public.michael_set_updated_at()', 'EXECUTE') AS svc
    `);
    expect(rows[0]).toEqual({ anon: false, auth: false, svc: true });
  });

  it('michael_rules (from the base migration) is untouched (still present)', async () => {
    expect(await relationExists('michael_rules')).toBe(true);
  });

  // TESTING H2 / FR-7: the instrument that proves the partial unique index actually enforces the
  // per-slot dedup constraint -- unprovable at the mocked-client unit tier.
  it('FR-7: the partial unique (et_date, window_slot) WHERE outcome=\'sent\' constraint independently rejects a concurrent double-insert', async () => {
    await client.query(
      "INSERT INTO public.michael_checkpoint_send_ledger (et_date, window_slot, outcome, body_sha256, body_len) VALUES ('2026-09-14', '06:00', 'sent', 'abc123', 42)",
    );
    await expect(client.query(
      "INSERT INTO public.michael_checkpoint_send_ledger (et_date, window_slot, outcome, body_sha256, body_len) VALUES ('2026-09-14', '06:00', 'sent', 'def456', 43)",
    )).rejects.toMatchObject({ code: '23505' });
    // A second 'held' or 'refused' row for the SAME slot is NOT blocked (the index is partial, only
    // covers outcome='sent') -- this is intentional: a capped/refused attempt followed by a later
    // successful send in the same slot must both be able to land.
    await expect(client.query(
      "INSERT INTO public.michael_checkpoint_send_ledger (et_date, window_slot, outcome, refusal_code) VALUES ('2026-09-14', '06:00', 'refused', 'CAP_EXCEEDED')",
    )).resolves.toBeDefined();
    await client.query("DELETE FROM public.michael_checkpoint_send_ledger WHERE et_date = '2026-09-14'");
  });

  it('outcome CHECK constraint rejects an out-of-enum value', async () => {
    await expect(client.query(
      "INSERT INTO public.michael_checkpoint_send_ledger (et_date, window_slot, outcome) VALUES ('2026-09-14', '06:00', 'bogus')",
    )).rejects.toMatchObject({ code: '23514' });
  });

  // SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 TS-20/TR-4: proves the specific concern that motivated
  // the on-demand path's per-minute window_slot stamp -- lib/michael/feeder.mjs's windowIdFor()
  // returns null off-window, and if checkpoint-send.mjs's on-demand branch ever let that null reach
  // an insert (instead of substituting a stamped value), it would hit this constraint in
  // production. The in-memory unit-tier fake (scripts/michael/checkpoint-send.test.js) does NOT
  // enforce NOT NULL, so this is the ONLY tier that can prove the production failure mode is real
  // and that a well-formed on-demand slot value (e.g. 'on-demand:08:12', proven schema-safe since
  // window_slot carries no format-specific CHECK) does not hit it.
  it("TS-20: window_slot NOT NULL rejects a null insert, and accepts an on-demand-shaped ('on-demand:HH:MM') value with the same partial-unique dedup as a fixed-window slot", async () => {
    await expect(client.query(
      "INSERT INTO public.michael_checkpoint_send_ledger (et_date, window_slot, outcome, refusal_code) VALUES ('2026-09-14', NULL, 'refused', 'QUIET_HOURS')",
    )).rejects.toMatchObject({ code: '23502' }); // not_null_violation
    await client.query(
      "INSERT INTO public.michael_checkpoint_send_ledger (et_date, window_slot, outcome, body_sha256, body_len) VALUES ('2026-09-14', 'on-demand:08:12', 'sent', 'abc123', 42)",
    );
    await expect(client.query(
      "INSERT INTO public.michael_checkpoint_send_ledger (et_date, window_slot, outcome, body_sha256, body_len) VALUES ('2026-09-14', 'on-demand:08:12', 'sent', 'def456', 43)",
    )).rejects.toMatchObject({ code: '23505' }); // same dedup mechanism as a fixed-window slot
    await client.query("DELETE FROM public.michael_checkpoint_send_ledger WHERE et_date = '2026-09-14'");
  });

  it('SEC-M5: the verify block goes RED when a table is exposed (it can fail, not only pass)', async () => {
    await client.query('GRANT SELECT ON public.michael_checkpoint_send_enabled TO anon');
    await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toMatchObject({ message: expect.stringMatching(/anon can SELECT|non-service table grant/) });
    await client.query('REVOKE ALL ON public.michael_checkpoint_send_enabled FROM anon');
    await expect(client.query(VERIFY_BLOCK_SQL)).resolves.toBeDefined();
  });

  it('a second apply is a no-op (idempotent DDL), the seed row is not duplicated, and the verify block still passes', async () => {
    await expect(client.query(UP_SQL)).resolves.toBeDefined();
    const { rows } = await client.query("SELECT count(*)::int AS n FROM public.michael_checkpoint_send_enabled WHERE config_key = 'checkpoint_send'");
    expect(rows[0].n).toBe(1);
    await expect(client.query(VERIFY_BLOCK_SQL)).resolves.toBeDefined();
  });
});

describe('DOWN restores', () => {
  it('drops the two checkpoint-send relations but NEVER the shared trigger function or michael_rules', async () => {
    await client.query('CREATE TABLE IF NOT EXISTS public.ddl_bystander_michael_checkpoint_send (id int)');
    await client.query(DOWN_SQL);
    for (const t of TABLES) expect(await relationExists(t), t).toBe(false);
    const { rows } = await client.query("SELECT to_regprocedure('public.michael_set_updated_at()') AS f");
    expect(rows[0].f).not.toBeNull();
    expect(await relationExists('michael_rules')).toBe(true);
    expect(await relationExists('ddl_bystander_michael_checkpoint_send')).toBe(true);
    await client.query('DROP TABLE public.ddl_bystander_michael_checkpoint_send');
  });
});
