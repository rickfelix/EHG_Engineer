/**
 * Regression test for SD-FDBK-ENH-RETROSPECTIVES-AUTO-VALIDATE-001.
 *
 * Locks in the symmetric/idempotent fix to validate_protocol_improvements_for_process_category():
 *   - adds a missing_protocol_improvements warning ONCE (no duplicates) while
 *     protocol_improvements is empty, and
 *   - CLEARS that warning when protocol_improvements is backfilled or the retro is
 *     no longer PROCESS_IMPROVEMENT.
 *
 * SAFETY: every scenario runs inside a pg-Client BEGIN..ROLLBACK transaction. We never
 * COMMIT and never DELETE — ROLLBACK discards the inserted retro AND its audit-trigger
 * rows together. (A prior retro test used supabase-js INSERT + afterEach DELETE; the
 * AFTER-DELETE audit FK silently blocked the deletes and leaked ~2327 rows into prod —
 * see SD-LEO-INFRA-STOP-RETRO-TRIGGER-001. Do NOT reintroduce that pattern here.)
 *
 * Runs against the live linked database; skips when no DB credentials are available.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

// SD-FDBK-ENH-RETROSPECTIVES-AUTO-VALIDATE-001's own UUID — satisfies the sd_id FK.
const TEST_SD_UUID = 'a41d7ab6-a1b7-42a3-b5f4-0c2a5c58607d';

const CONN_STR = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || null;
const HAS_CREDS = Boolean(
  CONN_STR || process.env.SUPABASE_DB_PASSWORD || process.env.EHG_DB_PASSWORD
);

let client = null;

beforeAll(async () => {
  if (!HAS_CREDS) return;
  client = await createDatabaseClient('engineer', {
    verify: false,
    timeout: 15000,
    ...(CONN_STR ? { connectionString: CONN_STR } : {}),
  });
});

afterAll(async () => {
  if (client) await client.end();
});

const arr = (n, prefix) =>
  JSON.stringify(Array.from({ length: n }, (_, i) => `${prefix} item ${i + 1} with enough descriptive detail to be specific`));

const warnCount = (qi) =>
  (Array.isArray(qi) ? qi.filter((e) => e && e.type === 'missing_protocol_improvements').length : -1);
const hasField = (qi, field) =>
  Array.isArray(qi) && qi.some((e) => e && e.field === field);

// Insert a PROCESS_IMPROVEMENT retro (protocol_improvements NULL) and return its id.
// `wellCount` lets a caller force an auto_validate "too few items" issue (wellCount < 3).
async function insertRetro(wellCount = 5) {
  const r = await client.query(
    `INSERT INTO retrospectives
       (sd_id, project_name, retro_type, title, status, generated_by, learning_category,
        target_application, auto_generated, conducted_date,
        what_went_well, key_learnings, action_items, what_needs_improvement, protocol_improvements)
     VALUES ($1,$2,'AUDIT',$3,'DRAFT','MANUAL','PROCESS_IMPROVEMENT','EHG_Engineer',false, now(),
        $4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb, NULL)
     RETURNING id, quality_issues`,
    [TEST_SD_UUID, `TEST-PI-CLEAR-${Date.now()}-${Math.round(performance.now())}`,
     'retro-protocol-improvements-clear regression',
     arr(wellCount, 'well'), arr(5, 'learn'), arr(3, 'act'), arr(3, 'imp')]
  );
  return r.rows[0].id;
}

const itDb = (name, fn) =>
  test(name, async (ctx) => {
    if (!client) { ctx.skip(); return; }
    await client.query('BEGIN');
    try {
      await fn();
    } finally {
      await client.query('ROLLBACK');
    }
  });

describe('validate_protocol_improvements_for_process_category (SD-FDBK-ENH-RETROSPECTIVES-AUTO-VALIDATE-001)', () => {
  itDb('adds the warning on a non-content UPDATE, then CLEARS it when protocol_improvements is backfilled', async () => {
    const id = await insertRetro();

    // TS-1: a non-content UPDATE while protocol_improvements is missing adds exactly one warning.
    const added = await client.query(
      `UPDATE retrospectives SET title = title || ' x' WHERE id=$1 RETURNING quality_issues`, [id]);
    expect(warnCount(added.rows[0].quality_issues)).toBe(1);

    // TS-2 (the bug): backfilling protocol_improvements (no content-field change) clears the warning.
    const cleared = await client.query(
      `UPDATE retrospectives SET protocol_improvements = $2::jsonb WHERE id=$1 RETURNING quality_issues`,
      [id, JSON.stringify([{ suggestion: 'Add a guardrail to the X workflow' }])]);
    expect(warnCount(cleared.rows[0].quality_issues)).toBe(0);
  });

  itDb('is idempotent — repeated non-content UPDATEs while missing yield a single warning (no duplicates)', async () => {
    const id = await insertRetro();
    await client.query(`UPDATE retrospectives SET title = title || ' x' WHERE id=$1`, [id]);
    const second = await client.query(
      `UPDATE retrospectives SET title = title || ' y' WHERE id=$1 RETURNING quality_issues`, [id]);
    // Pre-fix this returned 2; the idempotent guard keeps it at 1.
    expect(warnCount(second.rows[0].quality_issues)).toBe(1);
  });

  itDb('clears the warning when learning_category is no longer PROCESS_IMPROVEMENT', async () => {
    const id = await insertRetro();
    const added = await client.query(
      `UPDATE retrospectives SET title = title || ' x' WHERE id=$1 RETURNING quality_issues`, [id]);
    expect(warnCount(added.rows[0].quality_issues)).toBe(1);

    const recat = await client.query(
      `UPDATE retrospectives SET learning_category = 'TESTING_STRATEGY' WHERE id=$1 RETURNING quality_issues`, [id]);
    expect(warnCount(recat.rows[0].quality_issues)).toBe(0);
  });

  itDb('preserves other quality_issues (auto_validate entries) when clearing the warning', async () => {
    // wellCount=2 -> auto_validate emits a "too few items" issue on field=what_went_well.
    const id = await insertRetro(2);
    const added = await client.query(
      `UPDATE retrospectives SET title = title || ' x' WHERE id=$1 RETURNING quality_issues`, [id]);
    expect(warnCount(added.rows[0].quality_issues)).toBe(1);
    expect(hasField(added.rows[0].quality_issues, 'what_went_well')).toBe(true);

    const cleared = await client.query(
      `UPDATE retrospectives SET protocol_improvements = $2::jsonb WHERE id=$1 RETURNING quality_issues`,
      [id, JSON.stringify([{ suggestion: 'tighten the loop' }])]);
    // The protocol warning is gone, but the auto_validate "too few items" issue survives.
    expect(warnCount(cleared.rows[0].quality_issues)).toBe(0);
    expect(hasField(cleared.rows[0].quality_issues, 'what_went_well')).toBe(true);
  });
});
