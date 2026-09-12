/**
 * SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001 — FR-4 live-DB tier, mirroring the SD's own
 * smoke_test_steps exactly:
 *   1. direct-pg governed write (createDatabaseClient) -> created_by = session id,
 *      metadata.actor_source = 'app.actor'
 *   2. PostgREST governed write (createSupabaseServiceClient) -> created_by = session id,
 *      metadata.actor_source = 'request.headers'
 *   3. bare write with neither identity source set -> created_by = session_user,
 *      metadata.actor_source = 'session_user' (unchanged, no regression)
 *
 * Gated by describeDb (tests/helpers/db-available.js) — skips unless the configured target is
 * an explicitly DESIGNATED non-production Supabase project (none is provisioned today, so this
 * suite is inert everywhere until that changes; see db-target.js for the rationale). It documents
 * the intended end-to-end behavior and will start running the moment a safe target exists.
 *
 * NOTE: this test exercises the REPLACED trigger function shipped by the chairman-gated migration
 * 20260912_sd_mutation_audit_actor_threading.sql. Until that migration is applied, steps 1-2 will
 * fail (metadata.actor_source absent/different) against any target that still has only the
 * pre-threading function — that is expected and correct, not a flaky test.
 *
 * The direct-pg write (step 1) and the neither-source write (step 3) go through the SAME raw pg
 * connection used to seed/clean up, so their trigger-fired audit_log rows are covered by the seed
 * row's lifecycle. The PostgREST write (step 2) commits on a SEPARATE connection (PostgREST's own)
 * and cannot be rolled back from here — cleanup deletes the disposable row and its audit_log rows
 * explicitly in afterAll (try/finally), following the "never leave rows behind" rule documented in
 * tests/integration/sd-park.test.js (a prior SD leaked rows from a missing guaranteed cleanup).
 */
import { it, expect, beforeAll, afterAll } from 'vitest';
import { describeDb } from '../helpers/db-available.js';
import { createDatabaseClient, createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const RUN_ID = `ACTORTEST-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const SD_KEY = `SD-${RUN_ID}`;
const TEST_SESSION_ID = `test-session-${RUN_ID}`;

let rawClient;

async function cleanup() {
  if (!rawClient) return;
  await rawClient.query('DELETE FROM audit_log WHERE entity_id = $1', [SD_KEY]);
  await rawClient.query('DELETE FROM strategic_directives_v2 WHERE sd_key = $1', [SD_KEY]);
}

async function latestAuditRow(eventType) {
  const { rows } = await rawClient.query(
    `SELECT created_by, metadata FROM audit_log
     WHERE entity_id = $1 AND event_type = $2
     ORDER BY created_at DESC LIMIT 1`,
    [SD_KEY, eventType],
  );
  return rows[0];
}

describeDb('sd_mutation_audit trigger — actor threading (live DB)', () => {
  beforeAll(async () => {
    rawClient = await createDatabaseClient('engineer', { verify: false });
    // Neutralize whatever createDatabaseClient may have auto-set from an AMBIENT
    // CLAUDE_SESSION_ID (this suite may itself run inside an active coding session) —
    // rawClient's app.actor must start clean so step 3's session_user assertion is not
    // accidentally satisfied by a leftover identity from this connection's own creation.
    await rawClient.query('SELECT set_config(\'app.actor\', \'\', false)');
    await cleanup(); // defensive pre-clean in case a prior run crashed before its own cleanup
    await rawClient.query(
      `INSERT INTO strategic_directives_v2
         (id, sd_key, title, status, category, priority, description, rationale, scope,
          current_phase, progress, metadata, created_by, updated_by)
       VALUES ($1,$2,$3,'draft','infrastructure','low',$4,$5,$6,'LEAD',0,'{}'::jsonb,'TEST','TEST')`,
      [
        SD_KEY, SD_KEY, `Throwaway actor-threading test ${RUN_ID}`,
        `Disposable row for ${RUN_ID}. Deleted in afterAll.`,
        'Regression fixture for SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001.',
        'Seeded and deleted by this test; never a real SD.',
      ],
    );
  });

  afterAll(async () => {
    if (!rawClient) return;
    try {
      await cleanup();
    } finally {
      await rawClient.end();
    }
  });

  it('step 1: direct-pg write with app.actor set -> created_by = session id, actor_source = app.actor', async () => {
    // Exercises the REAL production path: createDatabaseClient itself resolves
    // CLAUDE_SESSION_ID and issues set_config('app.actor', ...) — no manual override here.
    process.env.CLAUDE_SESSION_ID = TEST_SESSION_ID;
    let client;
    try {
      client = await createDatabaseClient('engineer', { verify: false });
      await client.query('UPDATE strategic_directives_v2 SET status = \'in_progress\' WHERE sd_key = $1', [SD_KEY]);
    } finally {
      delete process.env.CLAUDE_SESSION_ID;
      if (client) await client.end();
    }
    const row = await latestAuditRow('sd_status_change');
    expect(row?.created_by).toBe(TEST_SESSION_ID);
    expect(row?.metadata?.actor_source).toBe('app.actor');
  });

  it('step 2: PostgREST write with x-actor-session header -> created_by = session id, actor_source = request.headers', async () => {
    process.env.CLAUDE_SESSION_ID = TEST_SESSION_ID;
    try {
      const client = await createSupabaseServiceClient('engineer');
      const { error } = await client
        .from('strategic_directives_v2')
        .update({ current_phase: 'PLAN' })
        .eq('sd_key', SD_KEY);
      expect(error).toBeNull();
    } finally {
      delete process.env.CLAUDE_SESSION_ID;
    }
    const row = await latestAuditRow('sd_phase_transition');
    expect(row?.created_by).toBe(TEST_SESSION_ID);
    expect(row?.metadata?.actor_source).toBe('request.headers');
  });

  it('step 3: neither app.actor nor x-actor-session set -> created_by = session_user, actor_source = session_user (no regression)', async () => {
    await rawClient.query('SELECT set_config(\'app.actor\', \'\', false)'); // clear any leakage from step 1
    await rawClient.query('UPDATE strategic_directives_v2 SET status = \'active\' WHERE sd_key = $1', [SD_KEY]);
    const row = await latestAuditRow('sd_status_change');
    const { rows: whoami } = await rawClient.query('SELECT session_user AS u');
    expect(row?.created_by).toBe(whoami[0].u);
    expect(row?.metadata?.actor_source).toBe('session_user');
  });
});
