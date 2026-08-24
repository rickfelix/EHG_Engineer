// SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-7 group (2)/TS-3 — DDL-tier proof of the composite
// (provider_message_id, message_status) uniqueness key on sms_status_staging.
//
// WHAT A GREEN RUN OF THIS FILE DOES NOT MEAN: database/chairman-gated/20260824_sms_status_staging.sql
// is CHAIRMAN-GATED and NOT YET APPLIED to the live database (per this SD's FR-5/risk-1 scope —
// the SD completes on "performable", not "cutover live"). This file runs the SAME migration SQL
// against an ephemeral vanilla PostgreSQL 16 to prove the constraint's real database behavior —
// a mocked-client unit test cannot prove a database CHECK/UNIQUE constraint exists at all
// (prospective TESTING finding on the original unit-level TS-3, sub_agent_execution_results
// cbcb68fa-d415-426c-93b8-6e61f4a044fc: "an implementation with no unique constraint at all
// passes it, as does a mocked client (tautology)"). It does NOT prove the migration has been
// applied live.
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing (matches tests/ddl/*.db.test.js's established convention).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260824_sms_status_staging.sql', import.meta.url),
);
const MIGRATION_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8');

let client;

beforeAll(async () => {
  client = new pg.Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'ddl_check',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  });
  await client.connect();
  await client.query(MIGRATION_SQL);
  // The RPC's secret check requires a seeded row — set a known secret for this ephemeral DB only.
  await client.query(
    `INSERT INTO sms_relay_secret (id, secret_value) VALUES (1, 'ddl-test-secret')
     ON CONFLICT (id) DO UPDATE SET secret_value = EXCLUDED.secret_value`,
  );
}, 60_000);

afterAll(async () => {
  if (client) await client.end();
});

beforeEach(async () => {
  await client.query('DELETE FROM sms_status_staging');
});

describe('sms_status_staging composite uniqueness (VALIDATION W4 / TR-4)', () => {
  it('a sent-then-delivered pair for the same MessageSid produces TWO distinct rows', async () => {
    await client.query(
      'SELECT fn_relay_insert_sms_status($1, $2, $3::jsonb, $4)',
      ['SM-composite-1', 'sent', '{}', 'ddl-test-secret'],
    );
    await client.query(
      'SELECT fn_relay_insert_sms_status($1, $2, $3::jsonb, $4)',
      ['SM-composite-1', 'delivered', '{}', 'ddl-test-secret'],
    );
    const { rows } = await client.query(
      'SELECT message_status FROM sms_status_staging WHERE provider_message_id = \'SM-composite-1\' ORDER BY message_status',
    );
    expect(rows.map((r) => r.message_status)).toEqual(['delivered', 'sent']);
  });

  it('inserting the SAME status twice for the same MessageSid is idempotent (exactly one row)', async () => {
    await client.query(
      'SELECT fn_relay_insert_sms_status($1, $2, $3::jsonb, $4)',
      ['SM-composite-2', 'delivered', '{}', 'ddl-test-secret'],
    );
    await client.query(
      'SELECT fn_relay_insert_sms_status($1, $2, $3::jsonb, $4)',
      ['SM-composite-2', 'delivered', '{}', 'ddl-test-secret'],
    );
    const { rows } = await client.query(
      'SELECT id FROM sms_status_staging WHERE provider_message_id = \'SM-composite-2\' AND message_status = \'delivered\'',
    );
    expect(rows.length).toBe(1);
  });

  it('a wrong relay secret is rejected with ERRCODE 28000 and inserts nothing', async () => {
    await expect(
      client.query('SELECT fn_relay_insert_sms_status($1, $2, $3::jsonb, $4)', ['SM-bad-secret', 'sent', '{}', 'wrong-secret']),
    ).rejects.toMatchObject({ code: '28000' });
    const { rows } = await client.query(
      'SELECT id FROM sms_status_staging WHERE provider_message_id = \'SM-bad-secret\'',
    );
    expect(rows.length).toBe(0);
  });

  it('anon can EXECUTE the RPC; PUBLIC and authenticated cannot', async () => {
    const { rows } = await client.query(`
      SELECT grantee, privilege_type FROM information_schema.routine_privileges
      WHERE routine_name = 'fn_relay_insert_sms_status' AND privilege_type = 'EXECUTE'
    `);
    const grantees = rows.map((r) => r.grantee);
    expect(grantees).toContain('anon');
    expect(grantees).not.toContain('PUBLIC');
    expect(grantees).not.toContain('authenticated');
  });

  it('RLS is enabled on sms_status_staging', async () => {
    const { rows } = await client.query(
      'SELECT relrowsecurity FROM pg_class WHERE relname = \'sms_status_staging\'',
    );
    expect(rows[0].relrowsecurity).toBe(true);
  });
});
