// SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 (FR-3) — the DDL tier for
// database/chairman-gated/20260826_eva_sync_state_rls_lockdown.sql.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL 16 with hand-stubbed roles and a hand-stubbed
// public.eva_sync_state table reproduced to match the LIVE pre-migration state as far as PG16 can
// represent it (policies, grants, RLS flag — captured 2026-08-26 via pg_policies/information_
// schema.role_table_grants against the real consolidated DB, not assumed). It proves the
// migration's own DROP POLICY / REVOKE / $verify$ logic does what it claims against a KNOWN
// starting state. It does NOT prove the real production grant surface still matches that snapshot
// at apply time (re-measure live immediately before the chairman applies), nor does it prove
// PostgREST/anon-key HTTP reachability — that is the live anon-key probe SECURITY sub-agent
// already ran, a different tier.
//
// KNOWN GAP (TESTING sub-agent finding, EXEC review): live production is PostgreSQL 17.4, which
// added the MAINTAIN table privilege (anon/authenticated/service_role each hold it live, measured
// 2026-08-26). This CI tier's PG16 container cannot represent MAINTAIN as a grantable privilege at
// all, so this file's 7-privilege-type sweep (PRIVILEGE_TYPES below) cannot exercise that 8th
// dimension — the migration's own $verify$ block carries a version-guarded MAINTAIN check
// (skipped on PG16, active on PG17+) that only ever runs for real against production.
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing (matches tests/ddl/telegram-bot-insert-feedback-drop-ddl.db.test.js's convention).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260826_eva_sync_state_rls_lockdown.sql', import.meta.url),
);
const MIGRATION_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8');

// Extracted from the REAL migration file text, not hand-copied — the mutation tests below run the
// actual $verify$ block this migration ships, so they cannot silently drift from what applies.
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
const VERIFY_BLOCK_SQL = extractDollarQuotedDoBlock(MIGRATION_SQL, 'verify');

// The 7 table-level privilege types this migration's REVOKE ALL touches — matches the live
// pre-migration baseline exactly (anon/authenticated held all 7 via a systemic pg_default_acl
// grant, confirmed live 2026-08-26).
const PRIVILEGE_TYPES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];

// Minimal stand-in for the parts of the real schema this migration's DROP POLICY / REVOKE / verify
// block read: the table shape, RLS flag, both pre-existing policies, and the anon/authenticated
// table grants matching the live baseline.
const STUB_SCHEMA = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE TABLE IF NOT EXISTS public.eva_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_identifier TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ,
  last_sync_cursor TEXT,
  total_synced INTEGER DEFAULT 0,
  source_metadata JSONB DEFAULT '{}'::jsonb,
  consecutive_failures INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.eva_sync_state ENABLE ROW LEVEL SECURITY;

-- Pre-existing, matches live state BEFORE this migration runs.
DROP POLICY IF EXISTS manage_eva_sync_state ON public.eva_sync_state;
CREATE POLICY manage_eva_sync_state ON public.eva_sync_state
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS select_eva_sync_state ON public.eva_sync_state;
CREATE POLICY select_eva_sync_state ON public.eva_sync_state
  FOR SELECT TO authenticated
  USING (true);

-- Matches the live pg_default_acl-derived grant surface (anon/authenticated hold ALL 7 privilege
-- types, not just SELECT — the systemic exposure this migration's REVOKE ALL closes).
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.eva_sync_state TO anon, authenticated, service_role;
`;

let client;

async function applyMigration() {
  await client.query(MIGRATION_SQL);
}

async function privilegeState(role) {
  const result = {};
  for (const priv of PRIVILEGE_TYPES) {
    const { rows } = await client.query('SELECT has_table_privilege($1, \'public.eva_sync_state\', $2) AS ok', [role, priv]);
    result[priv] = rows[0].ok;
  }
  return result;
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
}, 60_000);

afterAll(async () => {
  if (client) await client.end();
});

describe('negative control: pre-migration baseline reproduces the live exposure', () => {
  it('select_eva_sync_state grants authenticated a qual=true SELECT policy', async () => {
    const { rows } = await client.query(`
      SELECT roles, cmd, qual FROM pg_policies
      WHERE schemaname='public' AND tablename='eva_sync_state' AND policyname='select_eva_sync_state'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].roles).toEqual(['authenticated']);
    expect(rows[0].cmd).toBe('SELECT');
    expect(rows[0].qual).toBe('true');
  });

  it('anon holds all 7 table privileges pre-migration (the systemic pg_default_acl exposure)', async () => {
    const state = await privilegeState('anon');
    for (const priv of PRIVILEGE_TYPES) {
      expect(state[priv]).toBe(true);
    }
  });

  it('authenticated holds all 7 table privileges pre-migration', async () => {
    const state = await privilegeState('authenticated');
    for (const priv of PRIVILEGE_TYPES) {
      expect(state[priv]).toBe(true);
    }
  });
});

describe('applying the migration', () => {
  it('does not throw', async () => {
    await applyMigration();
  });
});

describe('post-migration: select_eva_sync_state is gone', () => {
  it('the policy no longer appears in pg_policies', async () => {
    const { rows } = await client.query(`
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='eva_sync_state' AND policyname='select_eva_sync_state'
    `);
    expect(rows).toHaveLength(0);
  });
});

describe('FR-3 AC-2: anon and authenticated are fully locked out post-migration', () => {
  it('anon has zero of the 7 table privileges', async () => {
    const state = await privilegeState('anon');
    for (const priv of PRIVILEGE_TYPES) {
      expect(state[priv]).toBe(false);
    }
  });

  it('authenticated has zero of the 7 table privileges', async () => {
    const state = await privilegeState('authenticated');
    for (const priv of PRIVILEGE_TYPES) {
      expect(state[priv]).toBe(false);
    }
  });
});

describe('TS-3b / FR-3 AC-3: positive control — service_role is unaffected', () => {
  it('service_role retains all 7 table privileges', async () => {
    const state = await privilegeState('service_role');
    for (const priv of PRIVILEGE_TYPES) {
      expect(state[priv]).toBe(true);
    }
  });

  it('manage_eva_sync_state (service_role, ALL, qual=true) is untouched', async () => {
    const { rows } = await client.query(`
      SELECT roles, cmd, qual FROM pg_policies
      WHERE schemaname='public' AND tablename='eva_sync_state' AND policyname='manage_eva_sync_state'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].roles).toEqual(['service_role']);
    expect(rows[0].cmd).toBe('ALL');
    expect(rows[0].qual).toBe('true');
  });

  it('a service_role client can still SELECT (the migration never revokes FROM service_role)', async () => {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE service_role');
      await expect(client.query('SELECT * FROM public.eva_sync_state')).resolves.toBeDefined();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('anon/authenticated reads now fail closed, not merely empty (TS-3)', () => {
  it('an anon-role query is refused with permission denied (42501), not a vacuous empty result', async () => {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE anon');
      let err;
      try {
        await client.query('SELECT * FROM public.eva_sync_state');
      } catch (e) {
        err = e;
      }
      expect(err).toBeTruthy();
      expect(err.code).toBe('42501');
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('the REAL $verify$ block (extracted from the migration file, not hand-copied) is mutation-resistant', () => {
  it('RAISEs if select_eva_sync_state were restored (over-broad rollback / regression)', async () => {
    await client.query('BEGIN');
    try {
      await client.query(`
        CREATE POLICY select_eva_sync_state ON public.eva_sync_state
          FOR SELECT TO authenticated USING (true)
      `);
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/select_eva_sync_state still present/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('RAISEs if manage_eva_sync_state (service_role) were collaterally dropped', async () => {
    await client.query('BEGIN');
    try {
      await client.query('DROP POLICY manage_eva_sync_state ON public.eva_sync_state');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/manage_eva_sync_state.*collaterally altered or dropped/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('RAISEs if anon/authenticated grants were collaterally restored', async () => {
    await client.query('BEGIN');
    try {
      await client.query('GRANT SELECT ON public.eva_sync_state TO anon');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/anon\/authenticated still hold privilege/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('RAISEs if RLS were disabled on eva_sync_state', async () => {
    await client.query('BEGIN');
    try {
      await client.query('ALTER TABLE public.eva_sync_state DISABLE ROW LEVEL SECURITY');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/RLS is not enabled/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('does NOT raise in the correct post-migration state (two-sided — a verify block strict enough to always fail would never catch a REAL regression)', async () => {
    await expect(client.query(VERIFY_BLOCK_SQL)).resolves.toBeDefined();
  });
});

describe('re-applying the migration', () => {
  it('the precondition guard refuses a second apply (not idempotent by design — protects against out-of-order/double application)', async () => {
    await expect(applyMigration()).rejects.toThrow(/select_eva_sync_state policy not found/);
  });
});
