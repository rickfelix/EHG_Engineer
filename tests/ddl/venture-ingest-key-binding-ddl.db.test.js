// SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 — the DDL tier for
// database/chairman-gated/20260812_venture_ingest_key_binding.sql.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL 16 with hand-stubbed roles AND hand-stubbed
// versions of public.ventures / public.feedback / venture_exists_and_active / fn_anon_ingress_
// prior_hour_count — the real schema this migration depends on, reproduced only as far as this
// migration's own logic touches it. It proves the migration's OWN new logic (secret binding,
// per-venture rate limit, content-integrity bound, uniform rejection). It does NOT prove:
//   - production posture (Supabase role inheritance / ALTER DEFAULT PRIVILEGES are not
//     reproduced by vanilla Postgres — see drive-reports-ddl.db.test.js's identical caveat)
//   - that record_venture_error's ORIGINAL signature survives untouched (TS-5) — that requires
//     the real record_venture_error to already exist, which is a live-schema fact, not something
//     an ephemeral stub can honestly assert. TS-5 belongs to Tier B (the chairman-gated
//     acceptance script), not here.
//   - anon-readability of venture_ingest_keys (GAP-1 / FR-1's anon-probe acceptance criterion) —
//     that requires the real PostgREST/Supabase grant surface, which is Tier C
//     (scripts/anon-write-contract-probe.mjs), not this ephemeral Postgres.
//
// Read a passing run here as "the new functions' OWN logic does what it claims", not as "the
// migration is safe to apply". Those are different claims.
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing (matches tests/ddl/drive-reports-ddl.db.test.js's own convention).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260812_venture_ingest_key_binding.sql', import.meta.url),
);
const MIGRATION_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8');

// Minimal stand-ins for the parts of the real schema this migration's OWN functions read.
// Deliberately narrow — this is not an attempt to reproduce public.ventures/public.feedback in
// full, only the columns and functions fn_submit_venture_feedback / fn_submit_venture_error /
// _verify_venture_ingest_secret actually touch.
const STUB_SCHEMA = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  deleted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR NOT NULL DEFAULT 'issue',
  source_application VARCHAR,
  source_type VARCHAR NOT NULL,
  title VARCHAR NOT NULL DEFAULT '',
  description TEXT,
  status VARCHAR DEFAULT 'new',
  severity VARCHAR,
  category VARCHAR,
  error_message TEXT,
  error_hash VARCHAR,
  occurrence_count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  votes INTEGER DEFAULT 0,
  assigned_to VARCHAR,
  triaged_by VARCHAR,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  venture_id UUID,
  feedback_type VARCHAR NOT NULL DEFAULT 'sentry_error'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_venture_error_hash
  ON public.feedback (venture_id, error_hash)
  WHERE feedback_type = 'venture_error' AND venture_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._venture_error_storm_watermark_hash()
RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'; $$;

CREATE OR REPLACE FUNCTION public.venture_exists_and_active(p_venture_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ventures v
    WHERE v.id = p_venture_id
      AND v.deleted_at IS NULL
      AND COALESCE(v.metadata->>'telemetry_ingestion_enabled', 'true') <> 'false'
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_anon_ingress_prior_hour_count(p_source_type text)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*) FROM public.feedback f
  WHERE f.source_type IS NOT DISTINCT FROM p_source_type
    AND f.created_at > now() - interval '1 hour';
$$;
`;

let client;

async function applyMigration() {
  await client.query(MIGRATION_SQL);
}

async function makeVenture(name = 'Test Venture') {
  const { rows } = await client.query(
    'INSERT INTO public.ventures (name) VALUES ($1) RETURNING id',
    [name],
  );
  return rows[0].id;
}

async function provisionSecret(ventureId) {
  const { rows } = await client.query(
    'SELECT public.fn_provision_venture_ingest_key($1) AS secret',
    [ventureId],
  );
  return rows[0].secret;
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
  await applyMigration();
}, 60_000);

afterAll(async () => {
  if (client) await client.end();
});

describe('the migration applied', () => {
  it('created venture_ingest_keys with RLS enabled and zero policies', async () => {
    const { rows: t } = await client.query("SELECT to_regclass('public.venture_ingest_keys') AS t");
    expect(t[0].t).toBe('venture_ingest_keys');

    const { rows: rls } = await client.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.venture_ingest_keys'::regclass",
    );
    expect(rls[0].relrowsecurity).toBe(true);

    const { rows: pol } = await client.query(
      "SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='venture_ingest_keys'",
    );
    expect(pol).toHaveLength(0);
  });

  it('re-running the migration is idempotent', async () => {
    await expect(applyMigration()).resolves.toBeTruthy();
  });
});

describe('FR-1: venture_ingest_keys is not directly readable/writable by anon or authenticated', () => {
  it('anon has no table-level privilege on venture_ingest_keys', async () => {
    const { rows } = await client.query(`
      SELECT count(*)::int AS n
      FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='venture_ingest_keys'
        AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    `);
    expect(rows[0].n).toBe(0);
  });
});

describe('FR-5: fn_provision_venture_ingest_key', () => {
  it('mints a secret and it round-trips through the RPC', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });

  it('stores exactly sha256(secret) as the hash — mutation-resistant, not merely "not the plaintext"', async () => {
    // Peer review finding (sec-rls-expert, this session): asserting `stored !== plaintext` (the
    // original check, in a since-deleted script) does not distinguish "correctly hashed" from
    // "wrongly hashed" or even "garbage" — any non-plaintext value passes. This asserts the exact
    // digest, which a mutant that hashed with the wrong algorithm, truncated the digest, or
    // stored a random value would fail.
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    const { rows } = await client.query(
      'SELECT ingest_secret_hash FROM public.venture_ingest_keys WHERE venture_id = $1',
      [ventureId],
    );
    const expected = createHash('sha256').update(secret).digest('hex');
    expect(rows[0].ingest_secret_hash).toBe(expected);
  });

  it('is not executable by anon or authenticated', async () => {
    const { rows } = await client.query(`
      SELECT count(*)::int AS n
      FROM information_schema.role_routine_grants
      WHERE routine_schema='public' AND routine_name='fn_provision_venture_ingest_key'
        AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    `);
    expect(rows[0].n).toBe(0);
  });

  it('rotating an existing venture updates rotated_at and the returned secret changes', async () => {
    const ventureId = await makeVenture();
    const first = await provisionSecret(ventureId);
    const second = await provisionSecret(ventureId);
    expect(second).not.toBe(first);
    const { rows } = await client.query(
      'SELECT rotated_at FROM public.venture_ingest_keys WHERE venture_id = $1',
      [ventureId],
    );
    expect(rows[0].rotated_at).not.toBeNull();
  });
});

describe('FR-2/TS-1/TS-6: fn_submit_venture_feedback ownership binding', () => {
  it('a valid secret for the SAME venture succeeds', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    const { rows } = await client.query(
      'SELECT public.fn_submit_venture_feedback($1, $2, \'venture_worker\', \'medium\', \'bug\', \'it broke\') AS r',
      [ventureId, secret],
    );
    expect(rows[0].r.ok).toBe(true);
  });

  it("[TS-1] venture A's valid secret with p_venture_id=B is rejected, uniform code", async () => {
    // CORRECTED (peer review sec-rls-expert, this session): the original version provisioned a
    // secret for ventureA ONLY, so ventureB had NO row in venture_ingest_keys at all — the
    // rejection was then produced entirely by "WHERE k.venture_id = p_venture_id" matching zero
    // rows, never reaching the hash comparison. A mutant that deleted the hash-comparison clause
    // entirely would still pass this test. Both ventures now get a REAL row, so the venture_id
    // predicate matches (a row for B exists) and the hash comparison is what must reject A's
    // secret against B's row — this is the only version of the test that actually exercises the
    // ownership check it claims to validate.
    const ventureA = await makeVenture('A');
    const ventureB = await makeVenture('B');
    const secretA = await provisionSecret(ventureA);
    await provisionSecret(ventureB);
    await expect(
      client.query(
        'SELECT public.fn_submit_venture_feedback($1, $2, \'venture_worker\', NULL, NULL, \'spoofed\') AS r',
        [ventureB, secretA],
      ),
    ).rejects.toThrow(/unauthorized/);
  });

  it('[TS-6] a nonexistent venture_id and a real venture with the wrong secret raise the SAME error', async () => {
    const ventureId = await makeVenture();
    await provisionSecret(ventureId);

    let errNonexistent;
    try {
      await client.query(
        'SELECT public.fn_submit_venture_feedback(gen_random_uuid(), \'whatever-secret\', \'venture_worker\', NULL, NULL, \'x\') AS r',
      );
    } catch (e) { errNonexistent = e; }

    let errWrongSecret;
    try {
      await client.query(
        'SELECT public.fn_submit_venture_feedback($1, \'wrong-secret-entirely\', \'venture_worker\', NULL, NULL, \'x\') AS r',
        [ventureId],
      );
    } catch (e) { errWrongSecret = e; }

    expect(errNonexistent).toBeTruthy();
    expect(errWrongSecret).toBeTruthy();
    expect(errNonexistent.message).toBe(errWrongSecret.message);
    expect(errNonexistent.code).toBe(errWrongSecret.code);
    expect(errNonexistent.code).toBe('28000');
  });

  it('a NULL secret is rejected the same uniform way, not a distinct null-handling error', async () => {
    const ventureId = await makeVenture();
    await provisionSecret(ventureId);
    await expect(
      client.query(
        'SELECT public.fn_submit_venture_feedback($1, NULL, \'venture_worker\', NULL, NULL, \'x\') AS r',
        [ventureId],
      ),
    ).rejects.toThrow(/unauthorized/);
  });
});

describe('FR-2/TS-2: forgeable workflow columns are never accepted as parameters', () => {
  it('the function signature has no status/votes/created_at/assigned_to/triaged_by/user_id parameter', async () => {
    const { rows } = await client.query(`
      SELECT pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p WHERE p.proname = 'fn_submit_venture_feedback'
    `);
    const args = rows[0].args.toLowerCase();
    for (const forged of ['status', 'votes', 'created_at', 'assigned_to', 'triaged_by', 'user_id']) {
      expect(args).not.toContain(forged);
    }
  });

  it('a successful insert gets server defaults for status/votes, never a caller-influenced value', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    const { rows } = await client.query(
      'SELECT (public.fn_submit_venture_feedback($1, $2, \'venture_worker\', NULL, NULL, \'test\'))->>\'id\' AS id',
      [ventureId, secret],
    );
    const { rows: row } = await client.query(
      'SELECT status, votes, assigned_to, triaged_by, user_id FROM public.feedback WHERE id = $1',
      [rows[0].id],
    );
    expect(row[0].status).toBe('new');
    expect(row[0].votes).toBe(0);
    expect(row[0].assigned_to).toBeNull();
    expect(row[0].triaged_by).toBeNull();
    expect(row[0].user_id).toBeNull();
  });
});

describe('content-integrity bound re-implemented (mirrors anon_feedback_ingress_bounds, which cannot see this SECURITY DEFINER path)', () => {
  it('severity=critical is rejected', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    await expect(
      client.query(
        'SELECT public.fn_submit_venture_feedback($1, $2, \'venture_worker\', \'critical\', NULL, \'x\') AS r',
        [ventureId, secret],
      ),
    ).rejects.toThrow(/severity not permitted/);
  });

  it('severity=high is rejected', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    await expect(
      client.query(
        'SELECT public.fn_submit_venture_feedback($1, $2, \'venture_worker\', \'high\', NULL, \'x\') AS r',
        [ventureId, secret],
      ),
    ).rejects.toThrow(/severity not permitted/);
  });

  it('[TWO-SIDED] severity=medium is accepted — the bound must not reject everything', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    const { rows } = await client.query(
      'SELECT public.fn_submit_venture_feedback($1, $2, \'venture_worker\', \'medium\', NULL, \'x\') AS r',
      [ventureId, secret],
    );
    expect(rows[0].r.ok).toBe(true);
  });

  it('category=chairman_decision_deferred is rejected', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    await expect(
      client.query(
        'SELECT public.fn_submit_venture_feedback($1, $2, \'venture_worker\', NULL, \'chairman_decision_deferred\', \'x\') AS r',
        [ventureId, secret],
      ),
    ).rejects.toThrow(/category not permitted/);
  });
});

describe('FR-4/TS-4: rate limiting is enforced from INSIDE the function, per-venture', () => {
  it('the function body contains an explicit rate-limit check, not merely assumed inherited RLS', async () => {
    const { rows } = await client.query(
      "SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname = 'fn_submit_venture_feedback'",
    );
    expect(rows[0].def).toMatch(/fn_venture_ingest_prior_hour_count/);
    expect(rows[0].def).toMatch(/fn_anon_ingress_prior_hour_count/);
  });

  it('[THE DISCRIMINATING CASE] a venture exceeding ITS OWN per-venture threshold is rejected while a DIFFERENT venture under threshold is not', async () => {
    const ventureA = await makeVenture('flooder');
    const secretA = await provisionSecret(ventureA);
    for (let i = 0; i < 50; i++) {
      await client.query(
        'SELECT public.fn_submit_venture_feedback($1, $2, \'venture_worker\', NULL, NULL, \'flood\') AS r',
        [ventureA, secretA],
      );
    }
    await expect(
      client.query(
        'SELECT public.fn_submit_venture_feedback($1, $2, \'venture_worker\', NULL, NULL, \'one too many\') AS r',
        [ventureA, secretA],
      ),
    ).rejects.toThrow(/rate limited/);

    // GAP-3 closed: a SIBLING venture on the same source_type, under its own threshold, is NOT
    // rejected by venture A's flood — proving the scope is per-venture, not a re-check of a
    // shared global limit that A's flood would also exhaust for B.
    const ventureB = await makeVenture('sibling');
    const secretB = await provisionSecret(ventureB);
    const { rows } = await client.query(
      'SELECT public.fn_submit_venture_feedback($1, $2, \'venture_worker\', NULL, NULL, \'unaffected\') AS r',
      [ventureB, secretB],
    );
    expect(rows[0].r.ok).toBe(true);
  }, 30_000);
});

describe('FR-3/TS-1/TS-6: fn_submit_venture_error ownership binding and dedup', () => {
  const hash1 = 'a'.repeat(64);

  it('a valid secret for the SAME venture succeeds and creates a row', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    const { rows } = await client.query(
      'SELECT public.fn_submit_venture_error($1, $2, $3, \'boom\') AS r',
      [ventureId, secret, hash1],
    );
    expect(rows[0].r.ok).toBe(true);
    expect(rows[0].r.action).toBe('created');
  });

  it('a repeat of the same fingerprint aggregates instead of duplicating', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    await client.query('SELECT public.fn_submit_venture_error($1, $2, $3, \'boom\') AS r', [ventureId, secret, hash1]);
    const { rows } = await client.query('SELECT public.fn_submit_venture_error($1, $2, $3, \'boom again\') AS r', [ventureId, secret, hash1]);
    expect(rows[0].r.action).toBe('aggregated');
  });

  it("venture A's secret with p_venture_id=B is rejected, uniform 28000", async () => {
    // Same predicate-void correction as TS-1 above — ventureB needs its own real row or the
    // venture_id predicate alone (not the hash comparison) produces the rejection.
    const ventureA = await makeVenture('A2');
    const ventureB = await makeVenture('B2');
    const secretA = await provisionSecret(ventureA);
    await provisionSecret(ventureB);
    await expect(
      client.query('SELECT public.fn_submit_venture_error($1, $2, $3, \'spoof\') AS r', [ventureB, secretA, hash1]),
    ).rejects.toThrow(/unauthorized/);
  });

  it('an invalid error_hash is rejected with a business-logic reason, AFTER the ownership check passes', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    const { rows } = await client.query(
      'SELECT public.fn_submit_venture_error($1, $2, \'not-a-valid-hash\', \'x\') AS r',
      [ventureId, secret],
    );
    expect(rows[0].r.ok).toBe(false);
    expect(rows[0].r.reason).toBe('invalid_error_hash');
  });
});

describe('TS-5 (partial, structural half only): fn_submit_venture_error is a NEW function, not an overload', () => {
  it('exactly one signature exists for fn_submit_venture_error', async () => {
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'fn_submit_venture_error'",
    );
    expect(rows[0].n).toBe(1);
  });

  it('this migration defines no function named record_venture_error at all (the real coexistence-with-the-untouched-original claim is Tier B, not provable on a stub without it)', async () => {
    expect(MIGRATION_SQL).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.record_venture_error/);
  });
});
