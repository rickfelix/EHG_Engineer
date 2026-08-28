// SD-FDBK-FIX-EVA-YOUTUBE-INTAKE-001 — the DDL tier for
// database/chairman-gated/20260828_eva_youtube_intake_rls_lockdown.sql, mirroring the sibling
// tests/ddl/eva-sync-state-rls-lockdown-ddl.db.test.js pattern (same migration shape, same
// convention: only the UP file is exercised by this CI tier; the DOWN file was reviewed
// statically and via a live ad-hoc dry-run by the EXEC-phase TESTING sub-agent, not automated
// here — matching every prior SD in this family that ships a DOWN file alongside a UP-only test).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL 16 with hand-stubbed roles and a
// hand-stubbed public.eva_youtube_intake table reproduced to match the LIVE pre-migration state
// as far as PG16 can represent it (policies, grants, RLS flag — captured 2026-08-28 via a direct
// pg connection against the real consolidated DB, not assumed). It proves the migration's own
// DROP POLICY / REVOKE / $verify$ logic does what it claims against a KNOWN starting state. It
// does NOT prove the real production grant surface still matches that snapshot at apply time
// (re-measure live immediately before the chairman applies).
//
// KNOWN GAP (same as the sibling): live production is PostgreSQL 17.4, which added the MAINTAIN
// table privilege (anon/authenticated/service_role each hold it live, measured 2026-08-28). This
// CI tier's PG16 container cannot represent MAINTAIN as a grantable privilege at all, so this
// file's 7-privilege-type sweep (PRIVILEGE_TYPES below) cannot exercise that 8th dimension — the
// migration's own $verify$ block carries a version-guarded MAINTAIN check (skipped on PG16,
// active on PG17+) that only ever runs for real against production.
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing (matches tests/ddl/telegram-bot-insert-feedback-drop-ddl.db.test.js's
// convention).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260828_eva_youtube_intake_rls_lockdown.sql', import.meta.url),
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
// grant, confirmed live 2026-08-28; the 8th, MAINTAIN, is PG17+ only — see header).
const PRIVILEGE_TYPES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];

// Minimal stand-in for the parts of the real schema this migration's DROP POLICY / REVOKE /
// verify block read: the table shape, RLS flag, both pre-existing policies, and the anon/
// authenticated table grants matching the live baseline.
const STUB_SCHEMA = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE TABLE IF NOT EXISTS public.eva_youtube_intake (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_video_id TEXT,
  youtube_playlist_item_id TEXT,
  raw_data JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.eva_youtube_intake ENABLE ROW LEVEL SECURITY;

-- Pre-existing, matches live state BEFORE this migration runs.
DROP POLICY IF EXISTS manage_eva_youtube_intake ON public.eva_youtube_intake;
CREATE POLICY manage_eva_youtube_intake ON public.eva_youtube_intake
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS select_eva_youtube_intake ON public.eva_youtube_intake;
CREATE POLICY select_eva_youtube_intake ON public.eva_youtube_intake
  FOR SELECT TO authenticated
  USING (true);

-- Matches the live pg_default_acl-derived grant surface (anon/authenticated hold ALL 7 privilege
-- types, not just SELECT — the systemic exposure this migration's REVOKE ALL closes).
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.eva_youtube_intake TO anon, authenticated, service_role;
`;

let client;

async function applyMigration() {
  await client.query(MIGRATION_SQL);
}

async function privilegeState(role) {
  const result = {};
  for (const priv of PRIVILEGE_TYPES) {
    const { rows } = await client.query('SELECT has_table_privilege($1, \'public.eva_youtube_intake\', $2) AS ok', [role, priv]);
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
  it('select_eva_youtube_intake grants authenticated a qual=true SELECT policy', async () => {
    // pg_policies.roles is name[], and the pg driver returns it as the raw Postgres array-literal
    // string ("{authenticated}"), not a parsed JS array — array_to_string() sidesteps that.
    const { rows } = await client.query(`
      SELECT array_to_string(roles, ',') AS roles, cmd, qual FROM pg_policies
      WHERE schemaname='public' AND tablename='eva_youtube_intake' AND policyname='select_eva_youtube_intake'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].roles).toBe('authenticated');
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

describe('post-migration: select_eva_youtube_intake is gone', () => {
  it('the policy no longer appears in pg_policies', async () => {
    const { rows } = await client.query(`
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='eva_youtube_intake' AND policyname='select_eva_youtube_intake'
    `);
    expect(rows).toHaveLength(0);
  });
});

describe('anon and authenticated are fully locked out post-migration', () => {
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

describe('positive control — service_role is unaffected', () => {
  it('service_role retains all 7 table privileges', async () => {
    const state = await privilegeState('service_role');
    for (const priv of PRIVILEGE_TYPES) {
      expect(state[priv]).toBe(true);
    }
  });

  it('manage_eva_youtube_intake (service_role, ALL, qual=true) is untouched', async () => {
    const { rows } = await client.query(`
      SELECT array_to_string(roles, ',') AS roles, cmd, qual FROM pg_policies
      WHERE schemaname='public' AND tablename='eva_youtube_intake' AND policyname='manage_eva_youtube_intake'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].roles).toBe('service_role');
    expect(rows[0].cmd).toBe('ALL');
    expect(rows[0].qual).toBe('true');
  });

  it('a service_role client can still SELECT (the migration never revokes FROM service_role)', async () => {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE service_role');
      await expect(client.query('SELECT * FROM public.eva_youtube_intake')).resolves.toBeDefined();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('anon/authenticated reads now fail closed, not merely empty', () => {
  it('an anon-role query is refused with permission denied (42501), not a vacuous empty result', async () => {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE anon');
      let err;
      try {
        await client.query('SELECT * FROM public.eva_youtube_intake');
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
  it('RAISEs if select_eva_youtube_intake were restored (over-broad rollback / regression)', async () => {
    await client.query('BEGIN');
    try {
      await client.query(`
        CREATE POLICY select_eva_youtube_intake ON public.eva_youtube_intake
          FOR SELECT TO authenticated USING (true)
      `);
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/select_eva_youtube_intake still present/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('RAISEs if manage_eva_youtube_intake (service_role) were collaterally dropped', async () => {
    await client.query('BEGIN');
    try {
      await client.query('DROP POLICY manage_eva_youtube_intake ON public.eva_youtube_intake');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/manage_eva_youtube_intake.*collaterally altered or dropped/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('RAISEs if anon/authenticated grants were collaterally restored', async () => {
    await client.query('BEGIN');
    try {
      await client.query('GRANT SELECT ON public.eva_youtube_intake TO anon');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/anon\/authenticated still hold privilege/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('RAISEs if RLS were disabled on eva_youtube_intake', async () => {
    await client.query('BEGIN');
    try {
      await client.query('ALTER TABLE public.eva_youtube_intake DISABLE ROW LEVEL SECURITY');
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
    await expect(applyMigration()).rejects.toThrow(/select_eva_youtube_intake policy not found/);
  });
});
