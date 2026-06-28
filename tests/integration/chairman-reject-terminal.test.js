/**
 * Integration tests for SD-LEO-INFRA-CHAIRMAN-REJECT-UNBLOCK-TERMINAL-001.
 *
 * Verifies the PAIRED fix:
 *   FR-1: trg_chairman_decision_unblock fires on 'rejected' (unblocks).
 *   FR-2: fn_chairman_decide's 'rejected' branch sets the venture TERMINAL
 *         (ventures.status='cancelled'), so the worker re-pick predicate
 *         (status='active' AND orchestrator_state='idle' AND stage<26) excludes
 *         it — no re-pick, no new gate minted, reject preserved.
 *   Regression: an 'approved' decision still unblocks + stays active.
 *
 * FULLY ISOLATED: applies the new function/trigger defs (from the migration)
 * and exercises throwaway rows inside a single transaction that is ALWAYS
 * rolled back — nothing persists to the database. Safe for the flagship factory.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(__dirname, '../../database/migrations/20260628_chairman_reject_unblock_terminal.sql');

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

// Strip the outer BEGIN/COMMIT so the defs run inside our own test transaction.
function migrationBody() {
  const raw = fs.readFileSync(MIGRATION, 'utf8');
  return raw
    .split('\n')
    .filter((l) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(l))
    .join('\n');
}

// A direct ventures INSERT trips a company-access trigger, so (like
// kill-venture-rpc.test.js) we force an EXISTING venture into the blocked
// shape inside the rolled-back transaction instead.
async function blockedVenture(client, stage = 5) {
  const v = await client.query('SELECT id FROM ventures ORDER BY created_at DESC LIMIT 1');
  const id = v.rows[0].id;
  await client.query(
    `UPDATE ventures SET status='active', orchestrator_state='blocked', current_lifecycle_stage=$2 WHERE id=$1`,
    [id, stage],
  );
  return id;
}

// High, distinct attempt_number to avoid the (venture_id,lifecycle_stage,
// attempt_number) unique constraint with any pre-existing decision.
let nextAttempt = 9001;
async function insertPendingDecision(client, ventureId, stage = 5) {
  const r = await client.query(
    `INSERT INTO chairman_decisions (venture_id, lifecycle_stage, decision, decision_type, status, attempt_number)
     VALUES ($1, $2, 'review', 'stage_gate', 'pending', $3) RETURNING id`,
    [ventureId, stage, nextAttempt++],
  );
  return r.rows[0].id;
}

describe.skipIf(!HAS_REAL_DB)('chairman reject -> terminal venture (SD-LEO-INFRA-CHAIRMAN-REJECT-UNBLOCK-TERMINAL-001)', () => {
  let client;

  beforeAll(async () => {
    client = await createDatabaseClient('ehg');
    await client.query('BEGIN');
    // Apply the new defs inside the rolled-back transaction.
    await client.query(migrationBody());
  });

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK'); // nothing persists
      await client.end();
    }
  });

  it("FR-1+FR-2: a 'rejected' decision makes the venture terminal + unblocked + not re-picked + reject preserved", async () => {
    const ventureId = await blockedVenture(client);
    const decisionId = await insertPendingDecision(client, ventureId);

    const res = await client.query(
      `SELECT fn_chairman_decide($1, 'rejected', 'test-decider', 'integration reject', true) AS r`,
      [decisionId],
    );
    expect(res.rows[0].r.success).toBe(true);

    const v = await client.query('SELECT status, orchestrator_state FROM ventures WHERE id=$1', [ventureId]);
    expect(v.rows[0].status).toBe('cancelled');        // FR-2: terminal
    expect(v.rows[0].orchestrator_state).toBe('idle');  // FR-1: unblocked

    const d = await client.query('SELECT status FROM chairman_decisions WHERE id=$1', [decisionId]);
    expect(d.rows[0].status).toBe('rejected');          // reject preserved

    // Worker re-pick predicate must NOT return the cancelled venture.
    const repick = await client.query(
      `SELECT id FROM ventures
       WHERE id=$1 AND status='active' AND orchestrator_state='idle' AND current_lifecycle_stage < 26`,
      [ventureId],
    );
    expect(repick.rows.length).toBe(0);                 // not re-picked -> no new gate minted
  });

  it("regression: an 'approved' decision unblocks the venture and keeps it active", async () => {
    const ventureId = await blockedVenture(client);
    const decisionId = await insertPendingDecision(client, ventureId);

    const res = await client.query(
      `SELECT fn_chairman_decide($1, 'approved', 'test-decider', 'integration approve', true) AS r`,
      [decisionId],
    );
    expect(res.rows[0].r.success).toBe(true);

    const v = await client.query('SELECT status, orchestrator_state FROM ventures WHERE id=$1', [ventureId]);
    expect(v.rows[0].orchestrator_state).toBe('idle');  // unblocked
    expect(v.rows[0].status).toBe('active');            // NOT terminal -> advances normally
  });
});
