/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C FR-4: regression proof that the 8 originally-named
 * feedback.update() call sites (5 files, excluding lib/quality/snooze-manager.js which this SD
 * actually fixes) already work under the live 2026-09-12 lifecycle-allowlist trigger
 * (database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql) — verification
 * only, no source change to these 5 files.
 *
 * Why this runs against the LIVE trigger, not a mock: feedback_no_update's WHEN clause is a
 * Postgres-side BEFORE UPDATE trigger. Whether a given column-write payload trips it is a
 * database behavior no JS mock can faithfully reproduce — the whole point of this SD's finding
 * was that column-name inspection alone is not proof; only an actual UPDATE against the live
 * trigger is. This exercises the EXACT column-write shapes from each call site (traced during
 * LEAD Explore + PLAN TESTING evidence), inside a single BEGIN...ROLLBACK transaction so nothing
 * persists. LIVE-gated: skips (does not fail) when no pg connection is configured, mirroring
 * tests/integration/claim-sweep-inflight-protection.test.js.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const HAS_DB = !!(process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);

describe.skipIf(!HAS_DB)('feedback_no_update lifecycle-allowlist regression — SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C', () => {
  let client;
  let probeId;

  beforeAll(async () => {
    const { createDatabaseClient } = await import('../../lib/supabase-connection.js');
    client = await createDatabaseClient('engineer', { verify: false });
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO public.feedback (type, source_application, source_type, title)
       VALUES ('issue','terminal:probe-verify','manual_feedback',
               'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C regression probe (rolled back)')
       RETURNING id`
    );
    probeId = ins.rows[0].id;
  });

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('scripts/modules/inbox/assist-runner.js + auto-triage.js shape: ai_triage_* + updated_at', async () => {
    await client.query('SAVEPOINT sp');
    await expect(client.query(
      'UPDATE public.feedback SET ai_triage_classification=$1, ai_triage_confidence=$2, ai_triage_source=$3, updated_at=now() WHERE id=$4',
      ['bug', 80, 'rules', probeId]
    )).resolves.toBeDefined();
    await client.query('RELEASE SAVEPOINT sp');
  });

  it('scripts/modules/inbox/auto-resolve-recovered.js shape: status/resolution_type/resolution_notes/resolved_at', async () => {
    await client.query('SAVEPOINT sp');
    await expect(client.query(
      'UPDATE public.feedback SET status=\'resolved\', resolution_type=$1, resolution_notes=$2, resolved_at=now(), updated_at=now() WHERE id=$3',
      ['pr_merged', 'probe note', probeId]
    )).resolves.toBeDefined();
    await client.query('RELEASE SAVEPOINT sp');
  });

  it('scripts/chairman-decisions.mjs resolveFeedback() shape: status/resolved_at/resolution_notes/resolution_type', async () => {
    await client.query('SAVEPOINT sp');
    await expect(client.query(
      'UPDATE public.feedback SET status=$1, resolved_at=now(), resolution_notes=$2, resolution_type=\'chairman_decision\' WHERE id=$3',
      ['resolved', 'probe note', probeId]
    )).resolves.toBeDefined();
    await client.query('RELEASE SAVEPOINT sp');
  });

  it('lib/quality/assist-engine.js _logRoutingEvent shape: metadata only', async () => {
    await client.query('SAVEPOINT sp');
    await expect(client.query(
      'UPDATE public.feedback SET metadata=$1::jsonb WHERE id=$2',
      [JSON.stringify({ assist_routing: { route: 'quick_fix_skill' } }), probeId]
    )).resolves.toBeDefined();
    await client.query('RELEASE SAVEPOINT sp');
  });

  it('lib/quality/assist-engine.js decision-dispatch shape (wont_do): updated_at/status/resolution_notes', async () => {
    await client.query('SAVEPOINT sp');
    await expect(client.query(
      'UPDATE public.feedback SET updated_at=now(), status=\'wont_fix\', resolution_notes=$1 WHERE id=$2',
      ['Declined during /leo assist', probeId]
    )).resolves.toBeDefined();
    await client.query('RELEASE SAVEPOINT sp');
  });

  it('lib/quality/assist-engine.js decision-dispatch shape (this_week/next_week): status/snoozed_until', async () => {
    await client.query('SAVEPOINT sp');
    await expect(client.query(
      'UPDATE public.feedback SET updated_at=now(), status=\'backlog\', snoozed_until=now()+interval \'7 days\' WHERE id=$1',
      [probeId]
    )).resolves.toBeDefined();
    await client.query('RELEASE SAVEPOINT sp');
  });

  it('a genuine CONTENT-column update is still rejected (control — proves the trigger is actually live and armed)', async () => {
    await client.query('SAVEPOINT sp');
    await expect(client.query(
      'UPDATE public.feedback SET title=\'tampered-content\' WHERE id=$1',
      [probeId]
    )).rejects.toThrow();
    await client.query('ROLLBACK TO SAVEPOINT sp');
  });
});
