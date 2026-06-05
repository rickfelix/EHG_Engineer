/**
 * Regression test for SD-LEO-FIX-FIX-AUTO-POPULATE-001 (auto_populate trigger
 * predicate) and SD-FDBK-FIX-FIX-RETROSPECTIVE-TRIGGER-001 (publish-gate firing
 * order). Asserts the live DB-side trigger behavior that vitest stubs cannot reach:
 *   1. DRAFT insert with rich arrays and no pre-set quality_score lands and
 *      auto_validate computes quality_score >= 70.
 *   2. PUBLISHED insert with a low computed score raises P0001.
 *   3. Direct PUBLISHED insert with rich content and no pre-set score succeeds
 *      (firing-order fix — the gate runs AFTER the score is computed).
 *   4. Status-only DRAFT->PUBLISHED update with a low stored score raises P0001.
 *
 * SD-LEO-INFRA-STOP-RETRO-TRIGGER-001: this test PREVIOUSLY inserted SD_COMPLETION
 * retrospectives into the PRODUCTION retrospectives table via the Supabase JS client
 * and tried to remove them in afterEach. That delete SILENTLY FAILED — the
 * AFTER-DELETE audit trigger (trg_retrospectives_audit) inserts an audit row whose
 * non-deferrable FK (retrospectives_audit_retrospective_id_fkey) references the row
 * being deleted, so a hard DELETE raises a FK violation — and the afterEach never
 * checked the error, leaking 3 rows per run (~2,294 accumulated, ~30% of the table).
 *
 * It now runs every scenario inside a pg-client BEGIN/ROLLBACK transaction. ROLLBACK
 * discards both the inserted retrospective AND its audit row, so the audit-FK block
 * never arises and no session_replication_role=replica is needed here. A unique
 * per-run marker (RUN_ID) plus a final zero-survivors assertion fails the suite
 * loudly if any future regression commits a row instead of rolling it back.
 *
 * Pattern mirrors tests/integration/registry-aware-target-application-trigger.test.js.
 * LIVE-gated: skips (does not fail) when no pg connection URL is configured, so
 * hermetic CI without DB creds stays green.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const HAS_DB = !!(process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
const TEST_SD_UUID = 'f91556d5-6226-486f-a179-27c9b602029f';

// Unique per-run marker. The zero-survivors assertion keys on this exact value, so
// it is robust against (a) concurrent sessions running this same test and (b) the
// historical fixture rows — both use different TEST-RETRO- prefixes. Any row bearing
// this RUN_ID that survives the suite means a scenario committed instead of rolling
// back (the leak has regressed). All RUN_ID values still match the purge predicate's
// `project_name LIKE 'TEST-RETRO-%'`, so an accidental leak remains purgeable.
const RUN_ID = `TEST-RETRO-RUN-${Date.now()}-${process.pid}`;

const PUB_GATE_RE = /PUBLISHED retrospectives must have quality_score >= 70|non-empty action_items/;

// quality_score is intentionally NOT set: the auto_validate trigger overrides any
// pre-set value, computing it from the content arrays (rich -> >=70, empty -> low).
const INSERT_SQL = `INSERT INTO retrospectives
  (sd_id, project_name, retro_type, title, description, status, generated_by,
   learning_category, target_application, auto_generated, conducted_date,
   what_went_well, key_learnings, action_items, what_needs_improvement)
  VALUES ($1,$2,'SD_COMPLETION',$3,$4,$5,'MANUAL','PROCESS_IMPROVEMENT','EHG_Engineer',false,now(),
   $6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb)
  RETURNING id, status, quality_score, retro_type`;

const RICH_WW = [
  'Trigger fix landed cleanly via CREATE OR REPLACE; idempotent.',
  'Integration test catches the regression at insert time, not at handoff time.',
  'Source-side fix protects all callers — no per-script workaround needed.',
  'Single-line predicate change with verbatim preservation of every other branch.',
  'Verification via pg_get_functiondef confirmed the new predicate is in place.'
];
const RICH_KL = [
  'BEFORE-row triggers fire alphabetically by trigger NAME, so the gate ran before the score compute.',
  'is_status_changing_to_published needs both TG_OP and NEW.status checked together.',
  'The auto_validate trigger overrides NEW.quality_score, so any pre-set value is transient.',
  'Rolling back a transaction discards the inserted row and its audit row together.',
  'Pure root-cause fixes preserve the audit trail; bypass quota does not.'
];
const RICH_AI = [
  'Mirror the sibling registry-aware test BEGIN/ROLLBACK pattern in all live DB tests.',
  'Keep a per-run marker so a future leak fails the suite loudly.',
  'Purge the accumulated fixture pollution under coordinator gating.'
];
const RICH_WNI = [
  'Trigger ordering implications should be documented when a new retrospectives trigger is added.',
  'Regression coverage on retrospectives triggers was thin before this SD.',
  'Live-DB tests must isolate writes in rolled-back transactions, never best-effort deletes.'
];

const insertArgs = (title, status, ww, kl, ai, wni) => [
  TEST_SD_UUID, RUN_ID, title, `${title} (rolled back; RUN_ID ${RUN_ID})`, status,
  JSON.stringify(ww), JSON.stringify(kl), JSON.stringify(ai), JSON.stringify(wni)
];

describe.skipIf(!HAS_DB)('auto_populate/auto_validate retrospective triggers (LIVE, rolled back) — SD-LEO-INFRA-STOP-RETRO-TRIGGER-001', () => {
  let client;

  beforeAll(async () => {
    const { createDatabaseClient } = await import('../../lib/supabase-connection.js');
    client = await createDatabaseClient('engineer', { verify: false });
  });

  afterAll(async () => {
    if (!client) return;
    // Zero-survivors guard: nothing this run inserted may have committed.
    const r = await client.query(
      `SELECT count(*)::int AS n FROM retrospectives WHERE project_name = $1`, [RUN_ID]
    );
    await client.end();
    expect(r.rows[0].n).toBe(0);
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

  it('DRAFT insert with rich arrays lands and auto_validate computes quality_score >= 70', async () => {
    const r = await inTxn(async () => {
      const ins = await client.query(INSERT_SQL, insertArgs('Regression row — DRAFT happy path', 'DRAFT', RICH_WW, RICH_KL, RICH_AI, RICH_WNI));
      return ins.rows[0];
    });
    expect(r.ok).toBe(true);
    expect(r.result.status).toBe('DRAFT');
    expect(r.result.retro_type).toBe('SD_COMPLETION');
    expect(r.result.quality_score).toBeGreaterThanOrEqual(70);
  });

  it('PUBLISHED insert with a low computed quality_score still raises P0001', async () => {
    const r = await inTxn(() => client.query(INSERT_SQL, insertArgs('Regression row — PUBLISHED low-score negative path', 'PUBLISHED', [], [], [], [])));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(PUB_GATE_RE);
  });

  it('direct PUBLISHED insert with rich content and no pre-set quality_score succeeds (firing-order fix)', async () => {
    const r = await inTxn(async () => {
      const ins = await client.query(INSERT_SQL, insertArgs('Regression row — direct PUBLISHED positive path', 'PUBLISHED', RICH_WW, RICH_KL, RICH_AI, RICH_WNI));
      return ins.rows[0];
    });
    expect(r.ok).toBe(true);
    expect(r.result.status).toBe('PUBLISHED');
    expect(r.result.quality_score).toBeGreaterThanOrEqual(70);
  });

  it('status-only DRAFT->PUBLISHED update with a low stored score still raises P0001', async () => {
    await client.query('BEGIN');
    let draftScore;
    let pubErr;
    try {
      const ins = await client.query(INSERT_SQL, insertArgs('Regression row — status-only publish enforcement', 'DRAFT', ['one'], ['two'], ['three'], ['four']));
      draftScore = ins.rows[0].quality_score;
      try {
        await client.query(`UPDATE retrospectives SET status='PUBLISHED' WHERE id=$1`, [ins.rows[0].id]);
      } catch (e) {
        pubErr = e;
      }
    } finally {
      await client.query('ROLLBACK');
    }
    expect(draftScore).toBeLessThan(70);
    expect(pubErr).toBeTruthy();
    expect(pubErr.message).toMatch(PUB_GATE_RE);
  });
});
