// SD-FDBK-FIX-VENTURE-CRACK-GATE-001 — the DDL tier for
// database/chairman-gated/20260817_venture_gate_attestations.sql.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL 16 with a hand-stubbed public.ventures FK
// target only. It proves the migration's OWN constraints/triggers behave as claimed. It does
// NOT prove production RLS/grant posture (Supabase role inheritance is not reproduced by
// vanilla Postgres — same caveat as tests/ddl/drive-reports-ddl.db.test.js and
// tests/ddl/venture-ingest-key-binding-ddl.db.test.js).
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing.
//
// NOTE (verified in this session, no local Postgres available): this file could not be executed
// locally — Docker is unavailable in this environment. It follows the established repo pattern
// exactly and is designed to run in the DDL CI tier (vitest.ddl.config.mjs). EXEC must add its
// path to .github/workflows/drive-reports-ddl.yml's per-migration path list (TR-6) or it is
// collected locally but never runs in CI — a documented, previously-recurring trap in this repo.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260817_venture_gate_attestations.sql', import.meta.url),
);
const MIGRATION_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8');

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
  name TEXT
);
`;

let client;

async function makeVenture(name = 'Test Venture') {
  const { rows } = await client.query('INSERT INTO public.ventures (name) VALUES ($1) RETURNING id', [name]);
  return rows[0].id;
}

const VALID_ROW = (ventureId, overrides = {}) => ({
  venture_id: ventureId,
  check_type: 'stage17_judgment',
  verdict: 'PASS',
  attested_by: 'rick@example.com',
  produced_by: 'stage-17-blueprint-review',
  subject_ref: 'probe://verify',
  subject_content_hash: 'a'.repeat(64),
  citation: 'https://example.com/review',
  path_to_pass: 'n/a',
  findings: '{}',
  enforcement_strength: 'convention',
  ...overrides,
});

async function insertRow(row) {
  return client.query(
    `INSERT INTO public.venture_gate_attestations
       (venture_id, check_type, verdict, attested_by, produced_by, subject_ref,
        subject_content_hash, citation, path_to_pass, findings, enforcement_strength)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) RETURNING id`,
    [row.venture_id, row.check_type, row.verdict, row.attested_by, row.produced_by, row.subject_ref,
      row.subject_content_hash, row.citation, row.path_to_pass, row.findings, row.enforcement_strength],
  );
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
  // ADVERSARIAL REVIEW FIX (PR1 deep-tier review): the migration's own DO $verify$ block gates
  // its generic-actor-rejection and judge<>producer behavioural proofs on `SELECT id INTO v_id
  // FROM public.ventures LIMIT 1; IF v_id IS NOT NULL THEN ...` — with an empty ventures table
  // (the original state here), v_id was NULL and BOTH proofs silently no-op on every CI run,
  // giving zero executed coverage of the SD's headline anti-rubber-stamp controls. Seed one
  // venture row BEFORE applying the migration so those proofs actually execute.
  await client.query("INSERT INTO public.ventures (name) VALUES ('DDL verify-block seed venture')");
  // Applying the migration also runs its own DO $verify$ block (TRUNCATE rejection,
  // generic-actor rejection, judge<>producer rejection, absence-of-boolean-columns,
  // trigger/constraint existence) — a migration-apply failure here IS a test failure,
  // propagated as a rejected promise.
  await client.query(MIGRATION_SQL);
}, 60_000);

afterAll(async () => {
  if (client) await client.end();
});

describe('venture_gate_attestations DDL (SD-FDBK-FIX-VENTURE-CRACK-GATE-001 TS-6)', () => {
  it('rejects a TRUNCATE (the statement-level guard, not covered by the row-level UPDATE/DELETE freeze triggers)', async () => {
    await expect(client.query('TRUNCATE public.venture_gate_attestations')).rejects.toThrow(/append-only/);
  });

  it('rejects attested_by="system" independently of the migration\'s own internal verify-block proof', async () => {
    const ventureId = await makeVenture();
    await expect(insertRow(VALID_ROW(ventureId, { attested_by: 'system' }))).rejects.toThrow(/check/i);
  });

  it('rejects a case/whitespace-varied self-judged row (attested_by ~= produced_by) independently of the migration\'s own internal verify-block proof', async () => {
    const ventureId = await makeVenture();
    await expect(insertRow(VALID_ROW(ventureId, { attested_by: 'Stage-17-Blueprint-Review ', produced_by: 'stage-17-blueprint-review' }))).rejects.toThrow(/check/i);
  });

  it('accepts a well-formed PASS attestation', async () => {
    const ventureId = await makeVenture();
    const { rows } = await insertRow(VALID_ROW(ventureId));
    expect(rows[0].id).toBeDefined();
  });

  it('rejects a closed-vocabulary violation on verdict', async () => {
    const ventureId = await makeVenture();
    await expect(insertRow(VALID_ROW(ventureId, { verdict: 'MAYBE' }))).rejects.toThrow(/check/i);
  });

  it('rejects check_type outside the closed vocabulary', async () => {
    const ventureId = await makeVenture();
    await expect(insertRow(VALID_ROW(ventureId, { check_type: 'vibes' }))).rejects.toThrow(/check/i);
  });

  it('rejects a PASS with no subject_content_hash (vga_pass_requires_content_hash)', async () => {
    const ventureId = await makeVenture();
    await expect(insertRow(VALID_ROW(ventureId, { subject_content_hash: null }))).rejects.toThrow(/check/i);
  });

  it('allows a NO_DATA row with no subject_content_hash (nullable off-PASS by design)', async () => {
    const ventureId = await makeVenture();
    const { rows } = await insertRow(VALID_ROW(ventureId, { verdict: 'NO_DATA', subject_content_hash: null }));
    expect(rows[0].id).toBeDefined();
  });

  it('rejects a citation that does not match the URL/kind:id/path@sha shape', async () => {
    const ventureId = await makeVenture();
    await expect(insertRow(VALID_ROW(ventureId, { citation: 'reviewed it' }))).rejects.toThrow(/check/i);
  });

  it('rejects chairman_site_review whose attested_by is not email-shaped', async () => {
    const ventureId = await makeVenture();
    await expect(insertRow(VALID_ROW(ventureId, { check_type: 'chairman_site_review', attested_by: 'chairman-cli' }))).rejects.toThrow(/check/i);
  });

  it('accepts chairman_site_review with an email-shaped attested_by', async () => {
    const ventureId = await makeVenture();
    const { rows } = await insertRow(VALID_ROW(ventureId, { check_type: 'chairman_site_review', attested_by: 'chairman@example.com' }));
    expect(rows[0].id).toBeDefined();
  });

  it('append-only: an UPDATE after insert is rejected by the freeze trigger', async () => {
    const ventureId = await makeVenture();
    const { rows } = await insertRow(VALID_ROW(ventureId));
    await expect(client.query('UPDATE public.venture_gate_attestations SET verdict = $1 WHERE id = $2', ['NO_DATA', rows[0].id]))
      .rejects.toThrow(/append-only/);
  });

  it('append-only: a DELETE after insert is rejected by the freeze trigger', async () => {
    const ventureId = await makeVenture();
    const { rows } = await insertRow(VALID_ROW(ventureId));
    await expect(client.query('DELETE FROM public.venture_gate_attestations WHERE id = $1', [rows[0].id]))
      .rejects.toThrow(/append-only/);
  });

  it('v_venture_gate_attestations_latest returns the newest row per (venture_id, check_type)', async () => {
    const ventureId = await makeVenture();
    await insertRow(VALID_ROW(ventureId, { verdict: 'NO_DATA', subject_content_hash: null, citation: 'kind:first-attempt' }));
    // A second, later attestation for the same (venture, check_type) — since the table is
    // append-only, this is a NEW row, not an update to the first.
    await new Promise((r) => setTimeout(r, 10));
    await insertRow(VALID_ROW(ventureId, { citation: 'kind:second-attempt' }));

    const { rows } = await client.query(
      'SELECT verdict, citation FROM public.v_venture_gate_attestations_latest WHERE venture_id = $1 AND check_type = $2',
      [ventureId, 'stage17_judgment'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe('PASS');
    expect(rows[0].citation).toBe('kind:second-attempt');
  });
});
