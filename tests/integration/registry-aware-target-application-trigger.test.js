/**
 * SD-LEO-INFRA-VENTURE-REPO-AWARE-001 — integration coverage for the
 * registry-aware retrospectives.target_application trigger.
 *
 * Complements the unit test (tests/unit/registry-aware-target-application.test.js,
 * which exercises the JS resolver against stubs) by asserting the actual DB-side
 * trigger behavior — including the UPDATE path and the NULL edge — that vitest
 * stubs cannot reach. All assertions run inside rolled-back transactions, so the
 * suite never persists rows.
 *
 * LIVE-gated: requires a real DB connection. Skips (does not fail) when no pooler
 * URL is configured, so hermetic CI without DB creds stays green.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const HAS_DB = !!(process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
const SD = 'ad881b08-afc0-49ae-ac31-ba9b8c66d234';

const COLS = `(sd_id, target_application, project_name, retro_type, title, description, conducted_date,
   learning_category, quality_score, key_learnings, what_went_well, action_items,
   what_needs_improvement, agents_involved, retrospective_type)`;
const VALS = `($1,$2,'integration-test','SD_COMPLETION','x','x',now(),'PROCESS_IMPROVEMENT',85,
   '[{"learning":"x"}]'::jsonb,'["x"]'::jsonb,'["x"]'::jsonb,'["x"]'::jsonb, ARRAY['LEAD'], NULL)`;

describe.skipIf(!HAS_DB)('registry-aware target_application trigger (LIVE, rolled back)', () => {
  let client;

  beforeAll(async () => {
    const { createDatabaseClient } = await import('../../lib/supabase-connection.js');
    client = await createDatabaseClient('engineer', { verify: false });
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  async function inTxn(fn) {
    await client.query('BEGIN');
    try {
      const result = await fn();
      await client.query('ROLLBACK');
      return { ok: true, result };
    } catch (e) {
      await client.query('ROLLBACK');
      return { ok: false, message: e.message };
    }
  }

  const insert = (app) =>
    client.query(`INSERT INTO retrospectives ${COLS} VALUES ${VALS} RETURNING id`, [SD, app]);

  it('INSERT: accepts a registered venture (CronGenius)', async () => {
    const r = await inTxn(() => insert('CronGenius'));
    expect(r.ok).toBe(true);
  });

  it('INSERT: accepts a registered venture case-insensitively (crongenius)', async () => {
    const r = await inTxn(() => insert('crongenius'));
    expect(r.ok).toBe(true);
  });

  it('INSERT: accepts platform values via fail-open short-circuit (EHG, EHG_Engineer)', async () => {
    expect((await inTxn(() => insert('EHG'))).ok).toBe(true);
    expect((await inTxn(() => insert('EHG_Engineer'))).ok).toBe(true);
  });

  it('INSERT: rejects an unregistered app with the actionable error', async () => {
    const r = await inTxn(() => insert('BogusUnregistered_zzz'));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not a registered application/);
  });

  it('INSERT: rejects NULL target_application (column is NOT NULL + trigger guard)', async () => {
    const r = await inTxn(() => insert(null));
    expect(r.ok).toBe(false);
  });

  it('UPDATE: re-validates target_application — rejects change to an unregistered value', async () => {
    const r = await inTxn(async () => {
      const ins = await insert('EHG');
      const id = ins.rows[0].id;
      await client.query(`UPDATE retrospectives SET target_application='BogusUnregistered_zzz' WHERE id=$1`, [id]);
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not a registered application/);
  });

  it('UPDATE: accepts change to a registered venture (EHG -> CronGenius)', async () => {
    const r = await inTxn(async () => {
      const ins = await insert('EHG');
      const id = ins.rows[0].id;
      await client.query(`UPDATE retrospectives SET target_application='CronGenius' WHERE id=$1`, [id]);
    });
    expect(r.ok).toBe(true);
  });
});
