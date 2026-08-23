// SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 — the DDL tier for
// database/migrations/20260823145041_ventures_teardown_disposition.sql (FR-1).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL 16 with a hand-stubbed schema. It proves
// this migration's OWN new logic (the teardown_disposition COALESCE-default in kill_venture()
// and reject_chairman_decision()'s kill-gate branch) does what it claims. It does NOT prove:
//   - authorization: public.fn_is_chairman() is STUBBED to always return TRUE here. The real
//     kill_venture() is gated by fn_is_chairman() reading auth.jwt() app_metadata (TESTING
//     evidence dbd754fd F1: a service-role client's auth.uid() is NULL, raising 42501 before
//     ever reaching the disposition logic -- this is exactly WHY this tier exists, to reach
//     logic that a service-role JS integration test cannot).
//   - production posture: workflow_status is a native Postgres ENUM in the real schema
//     (extend_workflow_status_killed.sql); this stub uses plain TEXT since only the
//     teardown_disposition column's own CHECK domain is under test here.
//   - the trigger sync_ventures_to_eva_ventures_update() (a sibling migration, not stubbed) --
//     unrelated to this migration's own logic.
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing (matches tests/ddl/*.db.test.js's established convention).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ORIGINAL_RPC_MIGRATION_PATH = fileURLToPath(
  new URL('../../database/migrations/20260505224113_ventures_kill_log_and_rpc.sql', import.meta.url),
);
const THIS_MIGRATION_PATH = fileURLToPath(
  new URL('../../database/migrations/20260823145041_ventures_teardown_disposition.sql', import.meta.url),
);
const ORIGINAL_RPC_SQL = fs.readFileSync(ORIGINAL_RPC_MIGRATION_PATH, 'utf8');
const MIGRATION_SQL = fs.readFileSync(THIS_MIGRATION_PATH, 'utf8');

// Minimal stand-ins for the parts of the real schema the original kill_venture/
// reject_chairman_decision migration (applied for real below) and this SD's migration touch.
const STUB_SCHEMA = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULL::uuid; $$;

-- STUB: real fn_is_chairman() reads auth.jwt() app_metadata; this tier is not testing
-- authorization (see file header) so it is stubbed to always authorize.
CREATE OR REPLACE FUNCTION public.fn_is_chairman() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$ SELECT true; $$;

CREATE TABLE IF NOT EXISTS public.ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  status TEXT,
  workflow_status TEXT DEFAULT 'pending',
  deployment_url TEXT,
  killed_at TIMESTAMPTZ,
  kill_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.eva_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT,
  event_source TEXT,
  event_data JSONB,
  eva_venture_id UUID
);

CREATE TABLE IF NOT EXISTS public.operations_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT,
  entity_id TEXT,
  action TEXT,
  performed_by UUID,
  severity TEXT,
  metadata JSONB,
  performed_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chairman_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID,
  lifecycle_stage INTEGER,
  decision_outcome TEXT,
  decision_rationale TEXT,
  decided_by_user_id UUID,
  decided_at TIMESTAMPTZ
);
`;

let client;

async function makeVenture({ status = 'active', deploymentUrl = null } = {}) {
  const { rows } = await client.query(
    'INSERT INTO public.ventures (name, status, deployment_url) VALUES ($1, $2, $3) RETURNING id',
    [`fixture ${Math.random().toString(36).slice(2)}`, status, deploymentUrl],
  );
  return rows[0].id;
}

async function getVenture(id) {
  const { rows } = await client.query(
    'SELECT teardown_disposition, teardown_disposition_reason FROM public.ventures WHERE id = $1',
    [id],
  );
  return rows[0];
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
  await client.query(STUB_SCHEMA);
  await client.query(ORIGINAL_RPC_SQL);
  await client.query(MIGRATION_SQL);
}, 60_000);

afterAll(async () => {
  if (client) await client.end();
});

describe('the migration applied', () => {
  it('teardown_disposition columns + CHECK constraint exist', async () => {
    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ventures' AND column_name LIKE 'teardown_disposition%'
      ORDER BY column_name
    `);
    expect(rows.map((r) => r.column_name)).toEqual([
      'teardown_disposition',
      'teardown_disposition_at',
      'teardown_disposition_by',
      'teardown_disposition_reason',
    ]);
  });

  it('kill_venture() signature is unchanged (2 params, no new overload)', async () => {
    const { rows } = await client.query(`
      SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'kill_venture'
    `);
    expect(rows[0].n).toBe(1);
  });

  it('an out-of-domain teardown_disposition value is rejected by the CHECK constraint', async () => {
    const ventureId = await makeVenture();
    await expect(
      client.query('UPDATE public.ventures SET teardown_disposition = \'not_a_real_value\' WHERE id = $1', [ventureId]),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('TS-1: kill a venture with a live deployment_url and no prior disposition', () => {
  it('teardown_disposition defaults to pending_teardown, not null', async () => {
    const ventureId = await makeVenture({ deploymentUrl: 'https://example-zombie.run.app' });
    await client.query('SELECT public.kill_venture($1, $2)', [ventureId, 'DDL-tier fixture kill, 20+ chars long']);
    const v = await getVenture(ventureId);
    expect(v.teardown_disposition).toBe('pending_teardown');
  });
});

describe('TS-2: kill a venture that already has an explicit disposition set', () => {
  it('a pre-existing retained disposition is preserved, not overwritten to pending_teardown', async () => {
    const ventureId = await makeVenture({ deploymentUrl: 'https://example-retained.run.app' });
    await client.query(
      'UPDATE public.ventures SET teardown_disposition = \'retained\', teardown_disposition_reason = \'pre-emptive retain\' WHERE id = $1',
      [ventureId],
    );
    await client.query('SELECT public.kill_venture($1, $2)', [ventureId, 'DDL-tier fixture kill, 20+ chars long']);
    const v = await getVenture(ventureId);
    expect(v.teardown_disposition).toBe('retained');
    expect(v.teardown_disposition_reason).toBe('pre-emptive retain');
  });
});

describe('TS-3: kill a venture with no deployment_url', () => {
  it('teardown_disposition stays NULL -- not applicable, no false-positive disposition', async () => {
    const ventureId = await makeVenture({ deploymentUrl: null });
    await client.query('SELECT public.kill_venture($1, $2)', [ventureId, 'DDL-tier fixture kill, 20+ chars long']);
    const v = await getVenture(ventureId);
    expect(v.teardown_disposition).toBeNull();
  });
});

describe("reject_chairman_decision()'s kill-gate branch gets the same disposition-default logic", () => {
  it('a kill-gate stage (3) decision on a venture with a live deployment_url defaults to pending_teardown', async () => {
    const ventureId = await makeVenture({ deploymentUrl: 'https://example-gate.run.app' });
    const { rows: decisionRows } = await client.query(
      'INSERT INTO public.chairman_decisions (venture_id, lifecycle_stage) VALUES ($1, 3) RETURNING id',
      [ventureId],
    );
    await client.query('SELECT public.reject_chairman_decision($1, $2)', [
      decisionRows[0].id,
      'DDL-tier fixture kill-gate rejection, 20+ chars',
    ]);
    const v = await getVenture(ventureId);
    expect(v.teardown_disposition).toBe('pending_teardown');
  });

  it('a non-kill-gate stage (7) decision does NOT touch teardown_disposition', async () => {
    const ventureId = await makeVenture({ deploymentUrl: 'https://example-nongate.run.app' });
    const { rows: decisionRows } = await client.query(
      'INSERT INTO public.chairman_decisions (venture_id, lifecycle_stage) VALUES ($1, 7) RETURNING id',
      [ventureId],
    );
    await client.query('SELECT public.reject_chairman_decision($1, $2)', [
      decisionRows[0].id,
      'DDL-tier fixture non-gate rejection, 20+ chars',
    ]);
    const v = await getVenture(ventureId);
    expect(v.teardown_disposition).toBeNull();
  });
});
