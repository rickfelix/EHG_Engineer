// SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 — the DDL tier for
// database/migrations/20260823145041_ventures_teardown_disposition.sql (FR-1).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL 16 with a hand-stubbed schema. It proves
// this migration's OWN new logic (the teardown_disposition COALESCE-default in kill_venture()
// and reject_chairman_decision()'s kill-gate branch) does what it claims. It does NOT prove:
//   - authorization: public.fn_is_chairman() is STUBBED to always return TRUE here, and
//     auth.role() is stubbed to NULL (so reject_chairman_decision's OR falls through to the
//     fn_is_chairman() stub). The real kill_venture()/reject_chairman_decision() are gated by
//     fn_is_chairman()/auth.role()='service_role' reading real JWT claims (TESTING evidence
//     dbd754fd F1: a service-role client's auth.uid() is NULL, raising 42501 before ever
//     reaching the disposition logic -- this is exactly WHY this tier exists, to reach logic
//     a service-role JS integration test cannot).
//   - production posture: workflow_status is a native Postgres ENUM in the real schema
//     (extend_workflow_status_killed.sql); this stub uses plain TEXT since only the
//     teardown_disposition column's own CHECK domain is under test here.
//   - the trigger sync_ventures_to_eva_ventures_update() (a sibling migration, not stubbed) --
//     unrelated to this migration's own logic.
//   - fn_write_kill_audit_trail() / fn_verify_and_consume_stepup_token()'s own real behavior --
//     both are NO-OP stubs here (this SD does not touch either); only their SIGNATURES matter,
//     so reject_chairman_decision's unrelated call sites don't error.
//
// SECURITY EXEC review f30e26e7 (S1 CRITICAL / S2 HIGH): an earlier draft of this migration
// copied kill_venture()/reject_chairman_decision() from the ORIGINAL
// 20260505224113_ventures_kill_log_and_rpc.sql migration file, which has since drifted from
// the LIVE functions -- reject_chairman_decision gained a 4th parameter (p_stepup_token) and
// an authorization guard; kill_venture gained an SD cascade-cancel step and a guarded
// eva_events insert. This file's STUB_SCHEMA and MIGRATION_SQL now both reflect the CURRENT
// live definitions (verified via pg_get_functiondef(oid) against the live database,
// 2026-08-23) -- NOT the stale original migration file, which this file deliberately no
// longer applies at all (applying it would have created a competing, stale-signature
// reject_chairman_decision overload inside this test's own database).
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing (matches tests/ddl/*.db.test.js's established convention).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import pg from 'pg';

const THIS_MIGRATION_PATH = fileURLToPath(
  new URL('../../database/migrations/20260823145041_ventures_teardown_disposition.sql', import.meta.url),
);
const MIGRATION_SQL = fs.readFileSync(THIS_MIGRATION_PATH, 'utf8');

// Minimal stand-ins for every table/function kill_venture() and reject_chairman_decision()'s
// LIVE bodies reference (not the stale original migration's bodies -- see file header).
const STUB_SCHEMA = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULL::uuid; $$;
-- STUB: reject_chairman_decision's guard is (auth.role() = 'service_role' OR fn_is_chairman());
-- this tier is not testing authorization (see file header), fn_is_chairman() below always
-- authorizes so auth.role()'s own value never matters -- it just needs to exist and be callable.
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT NULL::text; $$;

-- STUB: real fn_is_chairman() reads auth.jwt() app_metadata; this tier is not testing
-- authorization (see file header) so it is stubbed to always authorize.
CREATE OR REPLACE FUNCTION public.fn_is_chairman() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$ SELECT true; $$;

-- STUBS: not touched by this SD, but called from reject_chairman_decision's unrelated
-- branches -- no-op bodies, real signatures (matches live pg_get_function_identity_arguments).
CREATE OR REPLACE FUNCTION public.fn_verify_and_consume_stepup_token(p_token UUID, p_decision_id UUID)
  RETURNS BOOLEAN LANGUAGE sql AS $$ SELECT true; $$;
CREATE OR REPLACE FUNCTION public.fn_write_kill_audit_trail(
  p_venture_id UUID, p_lifecycle_stage INTEGER, p_rationale TEXT, p_decided_by UUID, p_source TEXT, p_decision_id UUID
) RETURNS UUID LANGUAGE sql AS $$ SELECT NULL::uuid; $$;

-- TESTING F-EXEC-1 (EXEC-phase review): tests/ddl/*.db.test.js all share ONE ephemeral
-- database (fileParallelism: false, no per-file schema isolation) -- whichever file's
-- beforeAll runs first wins this CREATE TABLE, and 3 sibling files (telegram-bot-insert-
-- feedback-drop, venture-ingest-key-binding, venture-user-feedback-ownership-rpc) already
-- converged on a compatible shape (id, name, deleted_at, metadata) specifically to survive
-- that race regardless of ordering. This file's own needed columns are disjoint from that
-- shape, so declaring them ONLY here would make every test order-dependent: red if this
-- file loses the CREATE TABLE race, and it would break the 3 siblings if it wins. Declaring
-- the converged shape here too, THEN adding this file's own columns via ADD COLUMN IF NOT
-- EXISTS (idempotent, runs regardless of who won CREATE TABLE), makes both directions safe.
CREATE TABLE IF NOT EXISTS public.ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  deleted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.ventures
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS deployment_url TEXT,
  ADD COLUMN IF NOT EXISTS killed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kill_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Reproduces the REAL production sequence this migration's own GRANT-preservation claim
-- depends on: the original 20260505224113 migration created kill_venture() and GRANTed it to
-- authenticated FIRST; THIS migration's CREATE OR REPLACE (in MIGRATION_SQL below) only
-- preserves that pre-existing ACL because it already exists. Without this placeholder,
-- MIGRATION_SQL would be creating kill_venture() fresh in this test DB, which gets ONLY the
-- PUBLIC-default ACL (acldefault()) -- silently making the GRANT-preservation test meaningless.
CREATE OR REPLACE FUNCTION public.kill_venture(p_venture_id UUID, p_rationale TEXT)
  RETURNS UUID LANGUAGE sql AS $$ SELECT NULL::uuid; $$;
GRANT EXECUTE ON FUNCTION public.kill_venture(UUID, TEXT) TO authenticated;

-- Matches live column set exactly (verified via information_schema.columns, 2026-08-23) --
-- this table has NOT drifted from the original 20260505224113 migration's definition.
CREATE TABLE IF NOT EXISTS public.ventures_kill_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  killed_by_user_id UUID REFERENCES auth.users(id),
  rationale TEXT NOT NULL CHECK (length(rationale) >= 20),
  killed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL
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

-- kill_venture()'s SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001 cascade-cancel step. Minimal --
-- only the columns that UPDATE statement touches.
CREATE TABLE IF NOT EXISTS public.strategic_directives_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID,
  status TEXT,
  cancellation_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- kill_venture()'s guarded eva_events insert: WHERE EXISTS (SELECT 1 FROM eva_ventures WHERE id = p_venture_id).
CREATE TABLE IF NOT EXISTS public.eva_ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Matches live column set (verified via information_schema.columns, 2026-08-23): id,
-- venture_id, lifecycle_stage, consequence_level, status, decision, rationale, decided_by,
-- decided_by_user_id, blocking, updated_at -- NOT the decision_outcome/decision_rationale/
-- decided_at shape an earlier draft of this file guessed at.
CREATE TABLE IF NOT EXISTS public.chairman_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID,
  lifecycle_stage INTEGER,
  consequence_level TEXT,
  status TEXT,
  decision TEXT,
  rationale TEXT,
  decided_by TEXT,
  decided_by_user_id UUID,
  blocking BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
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

  // SECURITY S1 CRITICAL regression guard: pins BOTH functions' argument counts so a future
  // signature drift (this migration authored against a stale copy of either function) creates
  // a visibly-failing count, not a silent second overload.
  it('kill_venture() and reject_chairman_decision() keep their live signatures (2 and 4 params) -- no new overload', async () => {
    const { rows } = await client.query(`
      SELECT proname, pronargs FROM pg_proc
      WHERE proname IN ('kill_venture', 'reject_chairman_decision') AND pronamespace = 'public'::regnamespace
      ORDER BY proname
    `);
    expect(rows).toEqual([
      { proname: 'kill_venture', pronargs: 2 },
      { proname: 'reject_chairman_decision', pronargs: 4 },
    ]);
  });

  it('an out-of-domain teardown_disposition value is rejected by the CHECK constraint', async () => {
    const ventureId = await makeVenture();
    await expect(
      client.query('UPDATE public.ventures SET teardown_disposition = \'not_a_real_value\' WHERE id = $1', [ventureId]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  // FR-1 AC#4 (TESTING F-EXEC-6, corrected per SECURITY S3): has_function_privilege() alone is
  // a vacuous check -- vanilla Postgres' acldefault() grants EXECUTE to PUBLIC by default, so
  // that assertion passes even with NO explicit `authenticated` grant at all. Assert on
  // pg_proc.proacl directly for an explicit `authenticated=X/...` aclitem instead, with a
  // negative control proving the assertion actually discriminates (a function with no explicit
  // grant must NOT match the same pattern).
  it('kill_venture() keeps its explicit GRANT EXECUTE TO authenticated after CREATE OR REPLACE (not just the PUBLIC-inherited default)', async () => {
    const { rows } = await client.query(`
      SELECT proacl::text AS acl FROM pg_proc WHERE proname = 'kill_venture' AND pronamespace = 'public'::regnamespace
    `);
    expect(rows[0].acl).toMatch(/authenticated=X/);

    // Negative control: fn_is_chairman() has no explicit GRANT in this stub schema, so its
    // proacl must NOT contain an authenticated=X aclitem -- proves the regex above discriminates
    // rather than matching anything.
    const control = await client.query(`
      SELECT proacl::text AS acl FROM pg_proc WHERE proname = 'fn_is_chairman' AND pronamespace = 'public'::regnamespace
    `);
    expect(control.rows[0].acl || '').not.toMatch(/authenticated=X/);
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
    // 2-arg call (p_decided_by/p_stepup_token use their defaults) -- exercises the same call
    // shape TS-6's integration test uses against the real 4-arg live function.
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
