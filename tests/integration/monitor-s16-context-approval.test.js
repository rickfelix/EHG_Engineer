/**
 * Regression test for QF-20260521-332 (closes feedback ccf15e75).
 *
 * monitor-venture-run.cjs now writes chairman_decisions.context (an evaluation payload with
 * 'stage' + 'timestamp' keys) before calling approve_chairman_decision, so the
 * reject_s16_programmatic_approval trigger accepts unattended monitoring_agent approvals at
 * lifecycle stage 16. This test pins the trigger contract the fix relies on:
 *   - S16 agent approval with NO context            -> rejected ("evaluation payload")
 *   - S16 agent approval with partial context        -> rejected (needs stage AND timestamp)
 *   - S16 agent approval with the monitor's payload   -> ACCEPTED
 *   - S16 chairman approval with no context           -> still accepted (unchanged)
 *
 * Each scenario runs inside a BEGIN/ROLLBACK transaction, so nothing persists. Skips when no
 * direct-pg credentials are present. Run: DISABLE_SSL_VERIFY=true npx vitest run \
 *   tests/integration/monitor-s16-context-approval.test.js
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

const HAS_DB = Boolean(process.env.SUPABASE_DB_PASSWORD || process.env.EHG_DB_PASSWORD);
const VENTURE_ID = '694eea94-0e61-4650-816f-1dfef3f58baa'; // existing venture (NicheMetrics)

let client;
beforeAll(async () => { if (HAS_DB) client = await createDatabaseClient('engineer', { verify: false }); });
afterAll(async () => { if (client) await client.end(); });

async function inRolledBackTx(work) {
  await client.query('BEGIN');
  try { return await work(); } finally { await client.query('ROLLBACK'); }
}

// Insert a pending stage-16 decision and return its id.
async function insertPendingS16() {
  // venture 694eea94 already has S16 decision(s); uq_chairman_decision_attempt covers
  // (venture_id, lifecycle_stage, attempt_number), so use a unique high attempt_number.
  // Everything is rolled back, so this never persists.
  const attempt = 900000 + Math.floor(Math.random() * 99999);
  const r = await client.query(
    `INSERT INTO chairman_decisions (venture_id, lifecycle_stage, decision, decision_type, status, attempt_number)
     VALUES ($1, 16, 'pending', 'stage_gate', 'pending', $2) RETURNING id`,
    [VENTURE_ID, attempt]
  );
  return r.rows[0].id;
}
// Approve as a given actor with an optional context (mirrors what the row looks like at trigger time).
async function approveAs(id, decidedBy, context) {
  return client.query(
    `UPDATE chairman_decisions
        SET status='approved', decided_by=$2, context=$3, decision='go', updated_at=now()
      WHERE id=$1`,
    [id, decidedBy, context == null ? null : JSON.stringify(context)]
  );
}

describe.skipIf(!HAS_DB)('QF-20260521-332 — S16 agent approval requires an evaluation-payload context', () => {
  it('BASELINE: monitoring_agent approval with NO context is rejected by the trigger', async () => {
    await inRolledBackTx(async () => {
      const id = await insertPendingS16();
      await expect(approveAs(id, 'monitoring_agent', null)).rejects.toThrow(/evaluation payload/i);
    });
  });

  it('partial context (stage only, no timestamp) is still rejected', async () => {
    await inRolledBackTx(async () => {
      const id = await insertPendingS16();
      await expect(approveAs(id, 'monitoring_agent', { stage: 16 })).rejects.toThrow(/stage.*timestamp|timestamp/i);
    });
  });

  it("the monitor's payload {stage,timestamp,...} is ACCEPTED", async () => {
    await inRolledBackTx(async () => {
      const id = await insertPendingS16();
      const ctx = { stage: 16, timestamp: new Date().toISOString(), decided_by: 'monitoring_agent', source: 'monitor-venture-run', gate_type: 'PROMO' };
      await expect(approveAs(id, 'monitoring_agent', ctx)).resolves.toBeDefined();
      const r = await client.query('SELECT status FROM chairman_decisions WHERE id=$1', [id]);
      expect(r.rows[0].status).toBe('approved');
    });
  });

  it('chairman approval with no context is unaffected (still accepted)', async () => {
    await inRolledBackTx(async () => {
      const id = await insertPendingS16();
      await expect(approveAs(id, 'chairman_test', null)).resolves.toBeDefined();
      const r = await client.query('SELECT status FROM chairman_decisions WHERE id=$1', [id]);
      expect(r.rows[0].status).toBe('approved');
    });
  });
});
