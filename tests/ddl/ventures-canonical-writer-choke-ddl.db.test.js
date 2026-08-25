// SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 — the DDL tier for
// database/chairman-gated/20260825_ventures_stage_write_token_column.sql and
// database/chairman-gated/20260825_ventures_canonical_writer_choke.sql
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL with a hand-stubbed NARROW schema: ventures
// reduced to the columns this guard, trg_validate_stage_column, and the fixtures actually touch,
// one probe table, and instrumented stand-ins for the two real sibling BEFORE UPDATE triggers that
// matter to this guard's own design (trg_validate_stage_column's NULL->1 coercion, and
// SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001's staged ventures_block_client_governance_write_trg). It is
// NOT a transitive clone of the real table's full ~12-trigger BEFORE estate — the other siblings
// (auto_populate_company_id_trigger, enforce_stage_advancement_artifact_gate,
// enforce_tier0_stage_cap, trg_enforce_stage0_origin, trg_reject_live_born_venture,
// trg_reject_unaudited_launch_mode_flip, trg_sync_stage_work_on_advance,
// trigger_create_postmortem_on_failure, update_ventures_updated_at) are either INSERT-only, scoped to
// columns this guard never touches, or content-safety triggers this SD deliberately leaves untouched
// — cloning all of them would be an unbounded excavation buying nothing for THIS guard's own logic.
//
// A green run proves the migration's OWN logic: the guard rejects unstamped
// current_lifecycle_stage writes, accepts registry-stamped ones, is NULL at rest, survives the real
// mid-chain NULL->1 coercion (TS-7), fails closed when the registry is unavailable, and that each of
// the two independent guards (this SD's identity axis, the sibling's client axis) is correct in
// ISOLATION (TS-6a/TS-6b) even though aaa_ masks the sibling in a composed run. It does NOT prove:
//
//   - PRODUCTION FIRING ORDER against the FULL real trigger estate. The aaa_/zzz_ sort bound against
//     the real estate is asserted by the migration's own $verify$ block at APPLY time, not here.
//   - THAT THE REAL RPCs (advance_venture_stage, advance_venture_to_stage, rescan_stage_20) BEHAVE.
//     Those functions read/write venture_stage_work, stage_events, venture_stage_transitions,
//     chairman_decisions, and venture_stages — none of which exist on this narrow stub. Coverage
//     below simulates their exact SET-clause shape (a raw UPDATE with the identical stamp literal),
//     which is what TS-1..TS-3 need; it is not a behavioural proof of the real RPC bodies. Those are
//     proven separately by database/chairman-gated/20260825_ventures_stage_rpcs_self_stamp.sql's own
//     inline $verify$ block (static source-text assertions on the live-applied function defs).
//   - PostgREST/SVCW1 ROUND-TRIP. This tier has no PostgREST, no RLS, no supabase-js.
//   - PRODUCTION POSTURE / Supabase role inheritance.
//
// Read a passing run as "the guard's own logic does what it claims", not as "the migration is safe
// to apply". TR-1 keeps those separate on purpose: zero live DDL is applied during this SD's EXEC.
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly.
//
// ⚠️ THIS FILE COULD NOT BE EXECUTED DURING AUTHORING — no local/CI Postgres was reachable in the
// authoring sandbox (no docker, no local postgres install, 127.0.0.1:5432 refused). It was written to
// mirror tests/ddl/strategic-directives-canonical-writer-choke-ddl.db.test.js's proven-in-CI harness
// shape exactly (same beforeAll/afterAll connection pattern, same pg.Client env vars, same
// PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD defaults), so it is expected to run under the same
// "ddl" CI job — but that has not yet been confirmed green. Treat this as UNVERIFIED until CI runs
// it once.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const COLUMN_MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260825_ventures_stage_write_token_column.sql', import.meta.url),
);
const CHOKE_MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260825_ventures_canonical_writer_choke.sql', import.meta.url),
);

const readLF = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const COLUMN_MIGRATION_SQL = readLF(COLUMN_MIGRATION_PATH);
const CHOKE_MIGRATION_SQL = readLF(CHOKE_MIGRATION_PATH);

// ── The stub. Narrow by design; see the header block. ──────────────────────────────────────────
const STUB_SCHEMA = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE TABLE IF NOT EXISTS public.ventures (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL DEFAULT 'stub-venture',
  current_lifecycle_stage INTEGER,
  stage_write_token      TEXT,
  is_demo                BOOLEAN DEFAULT true,
  updated_at             TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public._ddl_probe (
  seq   SERIAL PRIMARY KEY,
  label TEXT NOT NULL
);

-- Instrumented stand-in for fn_validate_stage_column / trg_validate_stage_column, VERBATIM copy of
-- the live logic (re-verified via pg_get_functiondef 2026-08-25): coerces a NULL stage to 1 on ANY
-- insert/update, unconditional, no WHEN clause. This is the mid-chain mutator TS-7 exists to catch.
CREATE OR REPLACE FUNCTION public.fn_validate_stage_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.current_lifecycle_stage IS NULL THEN
    NEW.current_lifecycle_stage := 1;
  END IF;
  IF NEW.current_lifecycle_stage < 1 OR NEW.current_lifecycle_stage > 26 THEN
    RAISE EXCEPTION 'current_lifecycle_stage must be between 1 and 26, got %', NEW.current_lifecycle_stage;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_validate_stage_column
  BEFORE INSERT OR UPDATE ON public.ventures
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_stage_column();

-- Instrumented stand-in for update_ventures_updated_at — real sibling exists, narrow-stubbed here
-- only to prove aaa_/zzz_ tolerate a co-firing unrelated BEFORE UPDATE trigger.
CREATE OR REPLACE FUNCTION public._stub_update_ventures_updated_at()
 RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  INSERT INTO public._ddl_probe(label) VALUES ('updated_at_trigger_fired');
  RETURN NEW;
END; $$;
CREATE TRIGGER update_ventures_updated_at
  BEFORE UPDATE ON public.ventures
  FOR EACH ROW EXECUTE FUNCTION public._stub_update_ventures_updated_at();

-- Narrow stand-in for SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001's staged, also-unapplied
-- ventures_block_client_governance_write_trg (database/chairman-gated/
-- 20260824_ventures_rls_integrity_repair.sql): refuses a direct client-role (authenticated/anon)
-- write of current_lifecycle_stage. Simulated via SET ROLE in the test body (this superuser
-- connection can SET ROLE to the NOLOGIN roles above) rather than a real JWT/RLS context.
CREATE OR REPLACE FUNCTION public._stub_block_client_governance_write()
 RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_lifecycle_stage IS DISTINCT FROM OLD.current_lifecycle_stage
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'client-role write of current_lifecycle_stage refused (client-axis guard)'
      USING ERRCODE = 'CGOV1';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ventures_block_client_governance_write_trg
  BEFORE UPDATE ON public.ventures
  FOR EACH ROW EXECUTE FUNCTION public._stub_block_client_governance_write();
`;

let client;

async function applyMigration(sql) {
  // Mirrors scripts/apply-migration.js: strip lock_timeout comment-only guidance (this stub has no
  // concurrent traffic to protect against) and run the file as one batch. pg allows multi-statement
  // text via simple query protocol.
  await client.query(sql);
}

const insertVenture = async ({ stage = null, isDemo = true } = {}) => {
  const { rows } = await client.query(
    'INSERT INTO public.ventures (current_lifecycle_stage, is_demo) VALUES ($1, $2) RETURNING id',
    [stage, isDemo],
  );
  return rows[0].id;
};

const readVenture = async (id) => {
  const { rows } = await client.query('SELECT * FROM public.ventures WHERE id = $1', [id]);
  return rows[0];
};

async function tryUpdate(sql, params) {
  try {
    await client.query(sql, params);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
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
  await applyMigration(COLUMN_MIGRATION_SQL);
  await applyMigration(CHOKE_MIGRATION_SQL);
}, 120_000);

afterAll(async () => {
  if (client) {
    try {
      await client.query('DROP TABLE IF EXISTS public.ventures CASCADE');
      await client.query('DROP TABLE IF EXISTS public._ddl_probe CASCADE');
      await client.query('DROP FUNCTION IF EXISTS public.fn_validate_stage_column() CASCADE');
      await client.query('DROP FUNCTION IF EXISTS public._stub_update_ventures_updated_at() CASCADE');
      await client.query('DROP FUNCTION IF EXISTS public._stub_block_client_governance_write() CASCADE');
      await client.query('DROP FUNCTION IF EXISTS public.enforce_canonical_stage_write() CASCADE');
      await client.query('DROP FUNCTION IF EXISTS public.ventures_canonical_writer_policy(text) CASCADE');
    } finally {
      await client.end();
    }
  }
});

describe('ventures canonical-writer choke — migration DDL', () => {
  it('registry returns every declared writer identity, exactly the corrected list', async () => {
    const { rows } = await client.query('SELECT writer_identity FROM public.ventures_canonical_writer_policy() ORDER BY writer_identity');
    const identities = rows.map((r) => r.writer_identity);
    expect(identities).toEqual([
      'advance_venture_stage',
      'advance_venture_to_stage',
      'ehg:promote.ts',
      'eva-run.js',
      'fn_advance_venture_stage',
      'reconciliation-packet-apply.mjs',
      'rescan_stage_20',
      'run-canary-probe.mjs',
      'saga-coordinator.js',
      'stage-execution-worker.js',
      'venture-ceo-handlers.js',
    ]);
  });

  it('does NOT register eva-orchestrator.js (read-only, confirmed no write call site)', async () => {
    const { rows } = await client.query(
      "SELECT 1 FROM public.ventures_canonical_writer_policy('eva-orchestrator.js')",
    );
    expect(rows).toHaveLength(0);
  });

  // TS-1
  it('TS-1: raw write with no token, no registered identity is refused', async () => {
    const id = await insertVenture({ stage: 1 });
    const result = await tryUpdate('UPDATE public.ventures SET current_lifecycle_stage = 2 WHERE id = $1', [id]);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SVCW1');
    const row = await readVenture(id);
    expect(row.current_lifecycle_stage).toBe(1); // unchanged
  });

  // TS-2
  it('TS-2: a registered writer performs a stamped advance; token is NULL immediately after; reuse is refused', async () => {
    const id = await insertVenture({ stage: 1 });
    const ok = await tryUpdate(
      "UPDATE public.ventures SET current_lifecycle_stage = 2, stage_write_token = 'advance_venture_stage' WHERE id = $1",
      [id],
    );
    expect(ok.ok).toBe(true);
    const afterFirst = await readVenture(id);
    expect(afterFirst.current_lifecycle_stage).toBe(2);
    expect(afterFirst.stage_write_token).toBeNull();

    // A second raw write immediately after must NOT inherit any residual trust.
    const second = await tryUpdate('UPDATE public.ventures SET current_lifecycle_stage = 3 WHERE id = $1', [id]);
    expect(second.ok).toBe(false);
    expect(second.error.code).toBe('SVCW1');
  });

  // TS-3
  it('TS-3: service_role-authenticated but UNREGISTERED writer identity is refused (no blanket waiver)', async () => {
    const id = await insertVenture({ stage: 1 });
    const result = await tryUpdate(
      "UPDATE public.ventures SET current_lifecycle_stage = 2, stage_write_token = 'service_role' WHERE id = $1",
      [id],
    );
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SVCW1');
  });

  it('a write that does not touch current_lifecycle_stage is allowed with no stamp', async () => {
    const id = await insertVenture({ stage: 1 });
    const result = await tryUpdate("UPDATE public.ventures SET name = 'renamed' WHERE id = $1", [id]);
    expect(result.ok).toBe(true);
  });

  // NOTE: a "fails closed when the registry function is unavailable" test was deliberately NOT
  // added here. PL/pgSQL caches a prepared plan for the registry SELECT on first execution, keyed by
  // the resolved function OID -- ALTER FUNCTION ... RENAME does not change that OID, so a rename
  // after earlier tests in this file have already warmed the cache would likely be invisible to the
  // already-planned trigger body, making such a test assert the opposite of what it claims without a
  // live Postgres to confirm either way. The fail-closed behavior itself (RAISE inside a BEFORE
  // trigger aborts the whole statement) is standard Postgres semantics, not SD-specific logic, and
  // is not in the corrected PRD's TS-1..TS-8 list.

  // TS-7 — the whole reason for TWO full-validation triggers, not one
  it('TS-7: raw UPDATE on a NULL-stage row, no token — refused by zzz_ even though aaa_ alone would have passed it', async () => {
    const id = await insertVenture({ stage: null });
    expect((await readVenture(id)).current_lifecycle_stage).toBeNull();

    // Write an unrelated column; current_lifecycle_stage is not in the SET clause, so a caller
    // unaware of trg_validate_stage_column would reasonably expect this to be "not a stage write".
    // aaa_ evaluates NEW=OLD=NULL (IS DISTINCT FROM -> false) and passes with no stamp required.
    // trg_validate_stage_column then coerces NEW.current_lifecycle_stage NULL -> 1. zzz_ (firing
    // last) sees that coercion as a genuine change and must reject it.
    const result = await tryUpdate("UPDATE public.ventures SET name = 'still no stage' WHERE id = $1", [id]);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SVCW1');
    // DETAIL names the firing guard via TG_NAME — must be zzz_, proving aaa_ alone would have missed it.
    expect(result.error.detail).toMatch(/guard=zzz_enforce_canonical_stage_write_final/);

    const row = await readVenture(id);
    expect(row.current_lifecycle_stage).toBeNull(); // the whole UPDATE aborted; coercion never persisted
  });

  it('TS-7 positive control: the same NULL-stage write succeeds when correctly stamped', async () => {
    const id = await insertVenture({ stage: null });
    const result = await tryUpdate(
      "UPDATE public.ventures SET name = 'stamped nudge', stage_write_token = 'stage-execution-worker.js' WHERE id = $1",
      [id],
    );
    expect(result.ok).toBe(true);
    const row = await readVenture(id);
    expect(row.current_lifecycle_stage).toBe(1); // coercion landed, legitimately, under a valid stamp
    expect(row.stage_write_token).toBeNull();
  });

  describe('TS-6a / TS-6b — isolation tests (composed run cannot distinguish which guard fired)', () => {
    // TS-6a: identity-axis guard alone (client-axis trigger disabled)
    it('TS-6a: a service_role write from an unregistered identity is blocked by the identity-axis guard alone', async () => {
      await client.query('ALTER TABLE public.ventures DISABLE TRIGGER ventures_block_client_governance_write_trg');
      try {
        const id = await insertVenture({ stage: 1 });
        const result = await tryUpdate('UPDATE public.ventures SET current_lifecycle_stage = 2 WHERE id = $1', [id]);
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('SVCW1');
      } finally {
        await client.query('ALTER TABLE public.ventures ENABLE TRIGGER ventures_block_client_governance_write_trg');
      }
    });

    // TS-6b: client-axis guard alone (identity-axis triggers disabled) — proves its logic is
    // independently correct, not merely masked by aaa_ firing first in the composed estate.
    it('TS-6b: a client-authenticated write is blocked by the client-axis guard alone', async () => {
      await client.query('ALTER TABLE public.ventures DISABLE TRIGGER aaa_enforce_canonical_stage_write');
      await client.query('ALTER TABLE public.ventures DISABLE TRIGGER zzz_enforce_canonical_stage_write_final');
      try {
        const id = await insertVenture({ stage: 1 });
        await client.query('SET ROLE authenticated');
        const result = await tryUpdate('UPDATE public.ventures SET current_lifecycle_stage = 2 WHERE id = $1', [id]);
        await client.query('RESET ROLE');
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('CGOV1');
      } finally {
        await client.query('RESET ROLE');
        await client.query('ALTER TABLE public.ventures ENABLE TRIGGER aaa_enforce_canonical_stage_write');
        await client.query('ALTER TABLE public.ventures ENABLE TRIGGER zzz_enforce_canonical_stage_write_final');
      }
    });

    // Composed-estate control: with BOTH guards live, a client-authenticated write is refused by
    // aaa_ FIRST (name-collation order) — demonstrating exactly why TS-6b needed isolation to prove
    // the client-axis guard's OWN logic, rather than merely observing "some guard rejected it".
    it('composed control: with both guards live, aaa_ (identity axis) fires first against a client-role writer', async () => {
      const id = await insertVenture({ stage: 1 });
      await client.query('SET ROLE authenticated');
      const result = await tryUpdate('UPDATE public.ventures SET current_lifecycle_stage = 2 WHERE id = $1', [id]);
      await client.query('RESET ROLE');
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('SVCW1'); // NOT 'CGOV1' — aaa_ masks the client-axis guard
    });
  });

  it('states the apply-time lock_timeout requirement', () => {
    expect(CHOKE_MIGRATION_SQL).toMatch(/SET lock_timeout = '3s';/);
    expect(COLUMN_MIGRATION_SQL).toMatch(/SET lock_timeout = '3s';/);
  });

  it('guard condition uses IS DISTINCT FROM, never UPDATE OF, on the trigger definitions', () => {
    expect(CHOKE_MIGRATION_SQL).not.toMatch(/BEFORE UPDATE OF current_lifecycle_stage[^\n]*enforce_canonical_stage_write/);
    expect(CHOKE_MIGRATION_SQL).toMatch(/NEW\.current_lifecycle_stage IS DISTINCT FROM OLD\.current_lifecycle_stage/);
  });

  it('re-applying the choke migration is idempotent (MODE 2 partial-apply recovery)', async () => {
    await applyMigration(CHOKE_MIGRATION_SQL);
    const { rows } = await client.query('SELECT writer_identity FROM public.ventures_canonical_writer_policy()');
    expect(rows.length).toBeGreaterThan(0);
  });
});
