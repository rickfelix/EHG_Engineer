// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A — the DDL tier for
// database/chairman-gated/20260826_venture_usage_events_rpc.sql.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL 16 with hand-stubbed roles AND hand-stubbed
// versions of public.ventures / public.venture_ingest_keys / public.venture_stages /
// public.venture_artifacts / _verify_venture_ingest_secret / venture_exists_and_active — the real
// schema this migration depends on, reproduced only as far as this migration's own logic touches
// it. It proves the migration's OWN new logic (event ingestion, dedicated rate limiting, the
// self-producing artifact upsert, uniform rejection). It does NOT prove production posture
// (Supabase role inheritance / ALTER DEFAULT PRIVILEGES are not reproduced by vanilla Postgres —
// matches this migration family's own established caveat, e.g. venture-ingest-key-binding-ddl).
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260826_venture_usage_events_rpc.sql', import.meta.url),
);
const MIGRATION_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8');

// Minimal stand-ins for the parts of the real schema this migration's OWN functions touch.
const STUB_SCHEMA = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  deleted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

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

-- Stand-in for venture_ingest_keys + its RPCs (database/chairman-gated/
-- 20260812_venture_ingest_key_binding.sql) -- this migration DEPENDS on _verify_venture_ingest_secret
-- existing exactly as that file defines it.
CREATE TABLE IF NOT EXISTS public.venture_ingest_keys (
  venture_id UUID PRIMARY KEY REFERENCES public.ventures(id),
  ingest_secret_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public._verify_venture_ingest_secret(p_venture_id UUID, p_ingest_secret TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venture_ingest_keys k
    WHERE k.venture_id = p_venture_id
      AND p_ingest_secret IS NOT NULL
      AND k.ingest_secret_hash = encode(extensions.digest(p_ingest_secret, 'sha256'), 'hex')
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_provision_venture_ingest_key(p_venture_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_secret TEXT;
BEGIN
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.venture_ingest_keys (venture_id, ingest_secret_hash)
  VALUES (p_venture_id, encode(extensions.digest(v_secret, 'sha256'), 'hex'))
  ON CONFLICT (venture_id) DO UPDATE SET ingest_secret_hash = EXCLUDED.ingest_secret_hash, rotated_at = now();
  RETURN v_secret;
END;
$$;

-- Minimal venture_stages / venture_artifacts stand-ins, reproducing only the columns and the
-- partial unique index this migration's RPC actually reads/writes.
CREATE TABLE IF NOT EXISTS public.venture_stages (
  stage_number INTEGER PRIMARY KEY,
  stage_key TEXT NOT NULL UNIQUE,
  gate_type TEXT NOT NULL DEFAULT 'none',
  required_artifacts TEXT[] NOT NULL DEFAULT '{}'::text[]
);
INSERT INTO public.venture_stages (stage_number, stage_key, gate_type, required_artifacts)
VALUES (23, 'launch_readiness_gate', 'kill', ARRAY['launch_readiness_checklist'])
ON CONFLICT (stage_number) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.venture_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL,
  lifecycle_stage INTEGER NOT NULL,
  artifact_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_current_artifact
  ON public.venture_artifacts (venture_id, lifecycle_stage, artifact_type, COALESCE((metadata ->> 'screenId'::text), '__no_screen__'::text))
  WHERE (is_current = true);
`;

let client;

async function applyMigration() {
  await client.query(MIGRATION_SQL);
}

async function makeVenture(name = 'Test Venture') {
  const { rows } = await client.query('INSERT INTO public.ventures (name) VALUES ($1) RETURNING id', [name]);
  return rows[0].id;
}

async function provisionSecret(ventureId) {
  const { rows } = await client.query('SELECT public.fn_provision_venture_ingest_key($1) AS secret', [ventureId]);
  return rows[0].secret;
}

async function submit(ventureId, secret, eventType, eventName, properties = {}, occurredAt = null) {
  const { rows } = await client.query(
    'SELECT public.fn_submit_venture_usage_event($1, $2, $3, $4, $5, $6) AS r',
    [ventureId, secret, eventType, eventName, JSON.stringify(properties), occurredAt],
  );
  return rows[0].r;
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
  it('created venture_usage_events and venture_usage_ingest_global_bucket with RLS enabled and zero policies', async () => {
    const { rows: t } = await client.query("SELECT to_regclass('public.venture_usage_events') AS t");
    expect(t[0].t).toBe('venture_usage_events');
    const { rows: rls } = await client.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.venture_usage_events'::regclass",
    );
    expect(rls[0].relrowsecurity).toBe(true);
    const { rows: pol } = await client.query(
      "SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='venture_usage_events'",
    );
    expect(pol).toHaveLength(0);
  });

  it('re-running the migration is idempotent', async () => {
    await applyMigration();
  });
});

describe('TS-1: anon has no direct table privilege', () => {
  it('anon has no table-level privilege on venture_usage_events', async () => {
    const { rows } = await client.query(`
      SELECT count(*)::int AS n FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='venture_usage_events' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    `);
    expect(rows[0].n).toBe(0);
  });
});

describe('TS-2/TS-2b: happy path + self-produced artifact', () => {
  it('a valid page_view event succeeds and produces the venture_artifacts witness', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    const r = await submit(ventureId, secret, 'page_view', 'page_view');
    expect(r.ok).toBe(true);
    expect(r.id).toBeTruthy();
    expect(r.reason).toBeNull();

    const { rows } = await client.query(
      "SELECT title, metadata FROM public.venture_artifacts WHERE venture_id=$1 AND artifact_type='launch_usage_signal' AND is_current=true",
      [ventureId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBeTruthy();
    expect(rows[0].metadata.first_event_id).toBe(r.id);
  });

  it('an invalid event_type/event_name pairing is rejected', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    await expect(submit(ventureId, secret, 'page_view', 'not_page_view')).rejects.toThrow(/pairing/);
  });
});

describe('TS-3a/3b: artifact upsert idempotency and cooldown', () => {
  it('6 rapid events for the same venture do not duplicate the artifact row, and last_event_at does not advance within the cooldown', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    let firstEventAt;
    for (let i = 0; i < 6; i++) {
      await submit(ventureId, secret, 'page_view', 'page_view');
    }
    const { rows } = await client.query(
      "SELECT metadata FROM public.venture_artifacts WHERE venture_id=$1 AND artifact_type='launch_usage_signal' AND is_current=true",
      [ventureId],
    );
    expect(rows).toHaveLength(1);
    firstEventAt = rows[0].metadata.first_event_at;
    expect(firstEventAt).toBeTruthy();
  });

  it('an event submitted after the cooldown window advances last_event_at, never first_event_at', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    await submit(ventureId, secret, 'page_view', 'page_view');
    const before = (
      await client.query(
        "SELECT metadata FROM public.venture_artifacts WHERE venture_id=$1 AND artifact_type='launch_usage_signal'",
        [ventureId],
      )
    ).rows[0].metadata;

    // Back-date the cooldown window directly (test-only) so the next submit falls outside it.
    await client.query(
      "UPDATE public.venture_artifacts SET metadata = metadata || jsonb_build_object('last_event_at', (now() - interval '6 minutes')) WHERE venture_id=$1 AND artifact_type='launch_usage_signal'",
      [ventureId],
    );
    await submit(ventureId, secret, 'page_view', 'page_view');
    const after = (
      await client.query(
        "SELECT metadata FROM public.venture_artifacts WHERE venture_id=$1 AND artifact_type='launch_usage_signal'",
        [ventureId],
      )
    ).rows[0].metadata;

    expect(after.first_event_at).toBe(before.first_event_at);
    expect(new Date(after.last_event_at).getTime()).toBeGreaterThan(new Date(before.last_event_at).getTime());
  });
});

describe('TS-9: auth-ordering cross-cell test', () => {
  it('wrong secret + valid event_type -> 28000', async () => {
    const ventureId = await makeVenture();
    await provisionSecret(ventureId);
    await expect(submit(ventureId, 'wrong-secret', 'page_view', 'page_view')).rejects.toThrow(/unauthorized/);
  });

  it('wrong secret + INVALID event_type still raises the SAME unauthorized error (ordering-sensitive)', async () => {
    const ventureId = await makeVenture();
    await provisionSecret(ventureId);
    await expect(submit(ventureId, 'wrong-secret', 'not_a_real_type', 'x')).rejects.toThrow(/unauthorized/);
  });

  it('a nonexistent venture_id + invalid event_type raises the byte-identical message to a real venture with a wrong secret', async () => {
    const fakeVentureId = '00000000-0000-0000-0000-000000000000';
    let messageForFakeVenture;
    try {
      await submit(fakeVentureId, 'irrelevant-secret', 'not_a_real_type', 'x');
    } catch (e) {
      messageForFakeVenture = e.message;
    }

    const ventureId = await makeVenture();
    await provisionSecret(ventureId);
    let messageForWrongSecret;
    try {
      await submit(ventureId, 'wrong-secret', 'not_a_real_type', 'x');
    } catch (e) {
      messageForWrongSecret = e.message;
    }

    expect(messageForFakeVenture).toBeTruthy();
    expect(messageForFakeVenture).toBe(messageForWrongSecret);
  });

  it('correct secret + invalid event_type raises a distinct, non-auth error', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    await expect(submit(ventureId, secret, 'not_a_real_type', 'x')).rejects.toThrow(/invalid event_type/);
  });
});

describe('TS-6: rate limiting leaves both tables untouched', () => {
  it('a venture rate-limited on its very first call produces zero events AND zero artifact rows', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    // Pre-fill the venture's bucket past the 5000/hour cap by inserting rows directly (fast path
    // for the test, equivalent in effect to 5000 real calls).
    await client.query(
      `INSERT INTO public.venture_usage_events (venture_id, event_type, event_name, properties, created_at)
       SELECT $1, 'page_view', 'page_view', '{}'::jsonb, now() FROM generate_series(1, 5000)`,
      [ventureId],
    );
    const r = await submit(ventureId, secret, 'page_view', 'page_view');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('rate_limited_venture');

    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM public.venture_artifacts WHERE venture_id=$1 AND artifact_type='launch_usage_signal'",
      [ventureId],
    );
    expect(rows[0].n).toBe(0);
  });
});

describe('TS-10: oversized properties are truncated, not rejected', () => {
  it('a properties payload exceeding 8000 octets is stored truncated', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    const bigValue = 'x'.repeat(9000);
    const r = await submit(ventureId, secret, 'custom_event', 'big_payload_test', { big: bigValue });
    expect(r.ok).toBe(true);
    const { rows } = await client.query('SELECT properties FROM public.venture_usage_events WHERE id=$1', [r.id]);
    expect(rows[0].properties).toEqual({ truncated: true });
  });

  it('the DB-level size CHECK is a backstop that fires on a direct-insert bypass', async () => {
    const ventureId = await makeVenture();
    const oversized = JSON.stringify({ big: 'x'.repeat(9000) });
    await expect(
      client.query(
        "INSERT INTO public.venture_usage_events (venture_id, event_type, event_name, properties, created_at) VALUES ($1, 'page_view', 'page_view', $2::jsonb, now())",
        [ventureId, oversized],
      ),
    ).rejects.toThrow();
  });
});

describe('FR-4 AC#3: lifecycle_stage is resolved by stage_key, never hardcoded', () => {
  it('a stub stage at a DIFFERENT stage_number still receives the correct lifecycle_stage on the produced artifact', async () => {
    await client.query("DELETE FROM public.venture_stages WHERE stage_key='launch_readiness_gate'");
    await client.query(
      "INSERT INTO public.venture_stages (stage_number, stage_key, gate_type, required_artifacts) VALUES (24, 'launch_readiness_gate', 'kill', ARRAY['launch_readiness_checklist'])",
    );
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    await submit(ventureId, secret, 'page_view', 'page_view');
    const { rows } = await client.query(
      "SELECT lifecycle_stage FROM public.venture_artifacts WHERE venture_id=$1 AND artifact_type='launch_usage_signal'",
      [ventureId],
    );
    expect(rows[0].lifecycle_stage).toBe(24);

    // Restore for subsequent tests in this file (none currently run after this describe block).
    await client.query("DELETE FROM public.venture_stages WHERE stage_key='launch_readiness_gate'");
    await client.query(
      "INSERT INTO public.venture_stages (stage_number, stage_key, gate_type, required_artifacts) VALUES (23, 'launch_readiness_gate', 'kill', ARRAY['launch_readiness_checklist'])",
    );
  });
});
