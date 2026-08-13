// SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001 — the DDL tier for
// database/chairman-gated/20260813_revoke_telegram_bot_insert_feedback.sql.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL 16 with hand-stubbed roles AND a hand-stubbed
// public.feedback/public.ventures pair, reproduced only as far as this migration's own DROP POLICY
// and $verify$ block touch them. `SET LOCAL ROLE anon` inside a rolled-back transaction proves the
// SQL-level RLS logic (which policy authorizes which row shape) — it does NOT prove the real
// production grant surface, Supabase's ALTER DEFAULT PRIVILEGES posture, or the PostgREST schema
// cache. The genuine "reachable over the real anon key" claim (TS-5/TS-6/TS-8) is Tier C's job
// (scripts/telegram-feedback-anon-probe.mjs), not here. Read a passing run here as "the migration's
// own DROP + $verify$ logic does what it claims", not as "the migration is safe to apply".
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing (matches tests/ddl/venture-ingest-key-binding-ddl.db.test.js's own convention).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260813_revoke_telegram_bot_insert_feedback.sql', import.meta.url),
);
const MIGRATION_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8');

// Extracted from the REAL migration file text, not hand-copied — mutation tests below run the
// actual $verify$ block this migration ships, so they cannot silently drift from what applies.
function extractVerifyBlock(sql) {
  // Anchored to start-of-line: the migration's own header prose mentions "DO $verify$" inside a
  // comment (the L3 tooling-gap note), which a plain indexOf would find INSTEAD of the real
  // statement opener, extracting the wrong (and syntactically invalid) slice.
  const startMatch = /^DO \$verify\$$/m.exec(sql);
  const marker = '$verify$;';
  const markerIdx = startMatch ? sql.indexOf(marker, startMatch.index) : -1;
  if (!startMatch || markerIdx === -1) {
    throw new Error('could not locate DO $verify$ ... $verify$; block in migration SQL');
  }
  return sql.slice(startMatch.index, markerIdx + marker.length);
}
const VERIFY_BLOCK_SQL = extractVerifyBlock(MIGRATION_SQL);

// Minimal stand-ins for the parts of the real schema this migration's DROP POLICY and $verify$
// block read: the two pre-existing anon INSERT policies on public.feedback, the table-level anon
// INSERT grant, and the two functions venture_user_insert_feedback's WITH CHECK calls (needed so
// CREATE POLICY itself can resolve them).
const STUB_SCHEMA = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE TABLE IF NOT EXISTS public.ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_type VARCHAR NOT NULL DEFAULT 'sentry_error',
  source_type VARCHAR NOT NULL,
  venture_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON public.feedback TO anon;
-- No explicit grant on public.ventures for the connecting role: it is that role's own table (table
-- owner has full privileges regardless of grants), and the CI container's bootstrap superuser is
-- named per POSTGRES_USER (ddl_runner), never literally "postgres" — granting to a hardcoded
-- "postgres" role does not exist there and makes beforeAll fail with 42704 (DATABASE sub-agent
-- finding, EXEC review, B2).

-- SECURITY DEFINER, matching the LIVE function exactly (confirmed via pg_get_functiondef before
-- authoring this stub) — without it, evaluating venture_exists_and_active(...) under SET LOCAL
-- ROLE anon reads public.ventures with ANON's own privileges, which have no grant on it, turning
-- TS-2/TS-8 into a false permission-denied that looks like (but is not) the over-broad-drop
-- regression they exist to detect (DATABASE sub-agent finding, EXEC review, B3).
CREATE OR REPLACE FUNCTION public.venture_exists_and_active(p_venture_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.ventures v WHERE v.id = p_venture_id AND v.deleted_at IS NULL);
$$;

-- SECURITY DEFINER for the same reason/fidelity, even though this stub's trivial body (a constant)
-- does not itself require it today.
CREATE OR REPLACE FUNCTION public.check_feedback_rate_limit(p_venture_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$ SELECT false; $$;

-- Pre-existing, mirrors live state BEFORE this migration runs.
CREATE POLICY telegram_bot_insert_feedback ON public.feedback
  FOR INSERT TO anon
  WITH CHECK (source_type = 'telegram');

CREATE POLICY venture_user_insert_feedback ON public.feedback
  FOR INSERT TO anon
  WITH CHECK (
    feedback_type LIKE 'user_%'
    AND venture_id IS NOT NULL
    AND venture_exists_and_active(venture_id)
    AND (NOT check_feedback_rate_limit(venture_id))
  );

-- RESTRICTIVE, WITH CHECK(true) — the stub does not reproduce this policy's real content/rate
-- bounds (that is Tier C's job, live), it exists ONLY so the migration's own $verify$ block (which
-- now asserts this policy is present and RESTRICTIVE, DATABASE sub-agent finding M1) does not
-- spuriously RAISE on this ephemeral database. Always-true, so it never changes any other test's
-- observable behavior below.
CREATE POLICY anon_feedback_ingress_bounds ON public.feedback
  AS RESTRICTIVE
  FOR INSERT TO public
  WITH CHECK (true);
`;

let client;

async function applyMigration() {
  await client.query(MIGRATION_SQL);
}

async function makeVenture() {
  const { rows } = await client.query('INSERT INTO public.ventures DEFAULT VALUES RETURNING id');
  return rows[0].id;
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
  it('telegram_bot_insert_feedback is gone from pg_policies', async () => {
    const { rows } = await client.query(`
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='feedback' AND policyname='telegram_bot_insert_feedback'
    `);
    expect(rows).toHaveLength(0);
  });

  it('anon retains table-level INSERT privilege on feedback (grant not collaterally revoked, TR-1/TR-2)', async () => {
    const { rows } = await client.query(`SELECT has_table_privilege('anon','public.feedback','INSERT') AS ok`);
    expect(rows[0].ok).toBe(true);
  });

  it('venture_user_insert_feedback survives with its WITH CHECK clause unchanged', async () => {
    const { rows } = await client.query(`
      SELECT with_check FROM pg_policies
      WHERE schemaname='public' AND tablename='feedback' AND policyname='venture_user_insert_feedback'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].with_check).toMatch(/venture_exists_and_active/);
    expect(rows[0].with_check).toMatch(/check_feedback_rate_limit/);
  });

  it('[TS-3] re-applying the full migration file is idempotent', async () => {
    await applyMigration();
  });

  it('public.feedback still has RLS enabled (M1, DATABASE sub-agent finding)', async () => {
    const { rows } = await client.query(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.feedback'::regclass`);
    expect(rows[0].relrowsecurity).toBe(true);
  });

  it('anon_feedback_ingress_bounds remains present, applies to INSERT, and is RESTRICTIVE (M1, DATABASE sub-agent finding — it was NEVER a permissive fallback grant; cmd pin added per SECURITY sub-agent finding L1)', async () => {
    const { rows } = await client.query(`
      SELECT cmd, permissive FROM pg_policies
      WHERE schemaname='public' AND tablename='feedback' AND policyname='anon_feedback_ingress_bounds'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].cmd).toBe('INSERT');
    expect(rows[0].permissive).toBe('RESTRICTIVE');
  });
});

describe('TR-1: mechanism is DROP POLICY, never a table-level REVOKE', () => {
  it('the file text uses DROP POLICY IF EXISTS and never REVOKEs the table-level grant', () => {
    expect(MIGRATION_SQL).toMatch(/DROP POLICY IF EXISTS telegram_bot_insert_feedback ON public\.feedback/);
    expect(MIGRATION_SQL).not.toMatch(/REVOKE\s+(ALL|INSERT)\s+ON\s+(TABLE\s+)?(public\.)?feedback/i);
  });
});

describe('TR-4: migration file stays out of excluded scope', () => {
  it('never references record_venture_error in executable SQL (comments are exempt — the header deliberately documents this exclusion, US-005/FR-5)', () => {
    // Strips full-line `--` comments before matching (DATABASE sub-agent finding, EXEC review,
    // B1): the header's own SCOPE-exclusion paragraph names record_venture_error by design, and a
    // raw-text match against MIGRATION_SQL fails on that prose every time, deterministically, with
    // no database needed — this is exactly the "I could not get a real green run locally" gap that
    // concealed it.
    const codeOnly = MIGRATION_SQL.replace(/^\s*--.*$/gm, '');
    expect(codeOnly).not.toMatch(/record_venture_error/);
  });

  it('never CREATEs/ALTERs/DROPs venture_user_insert_feedback', () => {
    expect(MIGRATION_SQL).not.toMatch(/(CREATE|ALTER|DROP)\s+POLICY\s+(IF EXISTS\s+)?venture_user_insert_feedback/i);
  });
});

describe('TS-1/TS-6: bare telegram-sourced anon INSERT is rejected post-migration (POLICY_DENIED shape: grant present, policy absent)', () => {
  it('a bare telegram-sourced row (no venture_id, non-user feedback_type) is refused with an RLS policy violation, not merely SOME 42501', async () => {
    // TIGHTENED (testing-agent finding, EXEC review, T-16): a bare `code: '42501'` match cannot
    // distinguish an RLS-policy refusal (what this test claims) from a missing-grant refusal,
    // which is also 42501 but a DIFFERENT message ("permission denied for table ..."). Asserting
    // the live-measured RLS message text closes that gap — confirmed live against the real
    // instance (via a rolled-back simulation, never committed) before pinning this string.
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE anon');
      await expect(
        client.query(
          `INSERT INTO public.feedback (source_type, feedback_type, venture_id) VALUES ('telegram', 'sentry_error', NULL)`,
        ),
      ).rejects.toMatchObject({ code: '42501', message: /row-level security policy/ });
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('[T-11 control] the IDENTICAL row LANDS if telegram_bot_insert_feedback is put back — the refusal above is caused by the drop, not by some other property of this row shape', async () => {
    // Testing-agent finding (EXEC review, T-11, independently re-measured live against production
    // and offered as corroboration): TS-1 alone asserts a STATE (refused post-migration) but not
    // CAUSATION (refused BECAUSE the policy is gone, not because this row shape could never have
    // landed). Recreating the already-dropped policy inside a rolled-back sub-transaction proves
    // the same exact statement that just failed above would have succeeded pre-migration.
    await client.query('BEGIN');
    try {
      await client.query(`
        CREATE POLICY telegram_bot_insert_feedback ON public.feedback
          FOR INSERT TO anon WITH CHECK (source_type = 'telegram')
      `);
      await client.query('SET LOCAL ROLE anon');
      // No RETURNING here either — telegram_bot_select_feedback would cover this specific row
      // (source_type='telegram'), but confirming via a privileged read after RESET ROLE keeps this
      // test's proof mechanism uniform with TS-2/TS-8 above rather than depending on it.
      await client.query(
        `INSERT INTO public.feedback (source_type, feedback_type, venture_id) VALUES ('telegram', 'sentry_error', NULL)`,
      );
      await client.query('RESET ROLE');
      const { rows } = await client.query(
        `SELECT id FROM public.feedback WHERE source_type = 'telegram' AND feedback_type = 'sentry_error' AND venture_id IS NULL`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('TS-2/TS-8: the venture_user_insert_feedback residual path still lands post-migration (deliberate, not a fix failure)', () => {
  // NEITHER case uses RETURNING (live-measured correction, this pass): an auto_capture-sourced row
  // has NO matching anon SELECT policy (telegram_bot_select_feedback covers only
  // source_type='telegram' — the exact "asymmetric case" scripts/security/rls-feedback-live-
  // probe.cjs's own header documents), so `INSERT ... RETURNING` for TS-2 throws 42501 even though
  // the INSERT itself is fully authorized — confirmed live against production before writing this.
  // That is a DIFFERENT policy dimension (SELECT coverage) than what TS-2/TS-8 test (INSERT
  // authorization), so both cases confirm landing via a privileged read after RESET ROLE instead.
  it('[TS-2] a valid venture-owned user_% submission succeeds regardless of source_type', async () => {
    const ventureId = await makeVenture();
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE anon');
      await client.query(
        `INSERT INTO public.feedback (source_type, feedback_type, venture_id) VALUES ('auto_capture', 'user_bug', $1)`,
        [ventureId],
      );
      await client.query('RESET ROLE');
      const { rows } = await client.query(
        `SELECT id FROM public.feedback WHERE venture_id = $1 AND source_type = 'auto_capture'`,
        [ventureId],
      );
      expect(rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('[TS-8] the SAME shape with source_type=telegram ALSO still lands — the intended residual path, not a regression', async () => {
    const ventureId = await makeVenture();
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE anon');
      await client.query(
        `INSERT INTO public.feedback (source_type, feedback_type, venture_id) VALUES ('telegram', 'user_bug', $1)`,
        [ventureId],
      );
      await client.query('RESET ROLE');
      const { rows } = await client.query(
        `SELECT id FROM public.feedback WHERE venture_id = $1 AND source_type = 'telegram'`,
        [ventureId],
      );
      expect(rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('TS-4a/TS-4b: the REAL $verify$ block (extracted from the migration file, not hand-copied) is mutation-resistant', () => {
  it('[TS-4a] RAISEs if the target policy were NOT actually dropped', async () => {
    await client.query('BEGIN');
    try {
      // Simulate "the DROP did not happen": recreate the policy this beforeAll already dropped.
      await client.query(`
        CREATE POLICY telegram_bot_insert_feedback ON public.feedback
          FOR INSERT TO anon WITH CHECK (source_type = 'telegram')
      `);
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/telegram_bot_insert_feedback still present/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('[TS-4b] RAISEs if the sibling policy were ALSO dropped (over-broad drop)', async () => {
    await client.query('BEGIN');
    try {
      await client.query('DROP POLICY IF EXISTS venture_user_insert_feedback ON public.feedback');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/venture_user_insert_feedback is missing/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('[M2a] RAISEs if the table-level anon-INSERT grant is collaterally REVOKEd instead of DROP POLICY being used (DATABASE sub-agent finding)', async () => {
    await client.query('BEGIN');
    try {
      await client.query('REVOKE INSERT ON public.feedback FROM anon');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/lost table-level INSERT privilege/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('[M2b] RAISEs if the sibling policy is left in place but its WITH CHECK is silently altered (DATABASE sub-agent finding)', async () => {
    await client.query('BEGIN');
    try {
      await client.query('ALTER POLICY venture_user_insert_feedback ON public.feedback WITH CHECK (true)');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/WITH CHECK text changed unexpectedly/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('[M1a] RAISEs if RLS is disabled on public.feedback (DATABASE sub-agent finding)', async () => {
    await client.query('BEGIN');
    try {
      await client.query('ALTER TABLE public.feedback DISABLE ROW LEVEL SECURITY');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/does not have RLS enabled/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('[M1b] RAISEs if anon_feedback_ingress_bounds is dropped or stops being RESTRICTIVE (DATABASE sub-agent finding)', async () => {
    await client.query('BEGIN');
    try {
      await client.query('DROP POLICY IF EXISTS anon_feedback_ingress_bounds ON public.feedback');
      // Message text updated (SECURITY sub-agent finding, EXEC re-review, L1) to match the migration's
      // cmd='INSERT' pin added to this same assertion.
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/anon_feedback_ingress_bounds is missing, no longer applies to INSERT, or is no longer RESTRICTIVE/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('does NOT raise in the correct post-migration state (two-sided — a verify block strict enough to always fail would never catch a REAL regression)', async () => {
    await expect(client.query(VERIFY_BLOCK_SQL)).resolves.toBeDefined();
  });
});
