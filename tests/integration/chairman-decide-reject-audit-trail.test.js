/**
 * Integration tests for SD-LEO-INFRA-CHAIRMAN-DECIDE-REJECT-AUDIT-TRAIL-001.
 *
 * Verifies that fn_chairman_decide's 'rejected' branch now writes the SAME kill-audit-trail that
 * reject_chairman_decision writes, via the shared helper fn_write_kill_audit_trail:
 *   FR-2: a kill-gate reject (stage 5) writes ventures_kill_log + eva_events + operations_audit_log
 *         and sets ventures.workflow_status='killed'.
 *   FR-2: a non-kill-gate reject (stage 7) writes NO audit trail; status='cancelled' only.
 *   FR-4: the #5211 terminal-status (status='cancelled') + unblock (orchestrator_state='idle') hold.
 *
 * FULLY ISOLATED: applies the #5211 base migration (for the unblock trigger) AND this SD's migration
 * (helper + refactored reject_chairman_decision + audit fn_chairman_decide) inside a single
 * transaction that is ALWAYS rolled back — nothing persists. Safe for the flagship factory.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '../../database/migrations');
const BASE_5211 = path.join(MIGRATIONS_DIR, '20260628_chairman_reject_unblock_terminal.sql');
const AUDIT_TRAIL = path.join(MIGRATIONS_DIR, '20260628_chairman_decide_reject_audit_trail.sql');

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

function migrationBody(file) {
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(l) && !/^\s*--\s*@approved-by/i.test(l))
    .join('\n');
}

async function blockedVenture(client, stage) {
  const v = await client.query('SELECT id FROM ventures ORDER BY created_at DESC LIMIT 1');
  const id = v.rows[0].id;
  // Reset the kill columns too — tests reuse the same (latest) venture inside one transaction, so a
  // prior kill-gate test would otherwise leave workflow_status='killed' for the next test.
  await client.query(
    `UPDATE ventures SET status='active', orchestrator_state='blocked', current_lifecycle_stage=$2,
            workflow_status=NULL, killed_at=NULL, kill_reason=NULL WHERE id=$1`,
    [id, stage],
  );
  return id;
}

let nextAttempt = 9101;
async function insertPendingDecision(client, ventureId, stage) {
  const r = await client.query(
    `INSERT INTO chairman_decisions (venture_id, lifecycle_stage, decision, decision_type, status, attempt_number)
     VALUES ($1, $2, 'review', 'stage_gate', 'pending', $3) RETURNING id`,
    [ventureId, stage, nextAttempt++],
  );
  return r.rows[0].id;
}

const RATIONALE = 'integration audit-trail reject — sufficiently long rationale string';

async function auditCounts(client, ventureId, decisionId) {
  const kl = await client.query('SELECT id, metadata FROM ventures_kill_log WHERE venture_id=$1', [ventureId]);
  const ev = await client.query(
    `SELECT id FROM eva_events WHERE eva_venture_id=$1 AND event_data->>'decision_id'=$2`, [ventureId, decisionId]);
  const op = await client.query(
    `SELECT id FROM operations_audit_log WHERE entity_id=$1 AND action='kill' AND metadata->>'decision_id'=$2`,
    [ventureId, decisionId]);
  // eva_events is FK-guarded on eva_ventures membership (the helper). Only assert its presence when the
  // venture actually has an eva_ventures row; kill_log + operations_audit_log always write.
  const inEva = await client.query('SELECT 1 FROM eva_ventures WHERE id=$1', [ventureId]);
  return { kill: kl.rows, eva: ev.rows.length, ops: op.rows.length, inEva: inEva.rows.length > 0 };
}

describe.skipIf(!HAS_REAL_DB)('fn_chairman_decide reject kill-audit-trail (SD-LEO-INFRA-CHAIRMAN-DECIDE-REJECT-AUDIT-TRAIL-001)', () => {
  let client;

  beforeAll(async () => {
    client = await createDatabaseClient('ehg');
    await client.query('BEGIN');
    // reject_chairman_decision's live auth guard requires auth.role()='service_role' (or fn_is_chairman).
    // A direct pg session has no JWT claim, so set it locally for the transaction.
    await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
    await client.query(migrationBody(BASE_5211));   // #5211 base (unblock trigger)
    await client.query(migrationBody(AUDIT_TRAIL)); // this SD (helper + re-based functions)
  });

  afterAll(async () => {
    if (client) { await client.query('ROLLBACK'); await client.end(); }
  });

  it('FR-2: kill-gate (stage 5) reject writes the full audit trail via the shared helper + sets killed', async () => {
    const ventureId = await blockedVenture(client, 5);
    const decisionId = await insertPendingDecision(client, ventureId, 5);

    const res = await client.query(
      `SELECT fn_chairman_decide($1, 'rejected', 'test-decider', $2, true) AS r`, [decisionId, RATIONALE]);
    expect(res.rows[0].r.success).toBe(true);

    const v = await client.query('SELECT status, workflow_status, orchestrator_state FROM ventures WHERE id=$1', [ventureId]);
    expect(v.rows[0].status).toBe('cancelled');
    expect(v.rows[0].workflow_status).toBe('killed');     // FR-2 parity with reject_chairman_decision
    expect(v.rows[0].orchestrator_state).toBe('idle');    // FR-4 #5211 unblock preserved

    // The complete triple (live FR-1) is preserved: never decision='pending' under a resolved status.
    const d = await client.query('SELECT status, decision, blocking FROM chairman_decisions WHERE id=$1', [decisionId]);
    expect(d.rows[0].status).toBe('rejected');
    expect(d.rows[0].decision).toBe('kill');
    expect(d.rows[0].blocking).toBe(false);

    const a = await auditCounts(client, ventureId, decisionId);
    expect(a.kill.length).toBeGreaterThanOrEqual(1);       // ventures_kill_log
    expect(a.kill[a.kill.length - 1].metadata.source).toBe('fn_chairman_decide');
    expect(a.ops).toBeGreaterThanOrEqual(1);               // operations_audit_log (always)
    if (a.inEva) expect(a.eva).toBeGreaterThanOrEqual(1); // eva_events (only when eva_ventures row exists)
  });

  it('FR-2: non-kill-gate (stage 7) reject writes NO audit trail; status=cancelled only', async () => {
    const ventureId = await blockedVenture(client, 7);
    const decisionId = await insertPendingDecision(client, ventureId, 7);

    const res = await client.query(
      `SELECT fn_chairman_decide($1, 'rejected', 'test-decider', $2, true) AS r`, [decisionId, RATIONALE]);
    expect(res.rows[0].r.success).toBe(true);

    const v = await client.query('SELECT status, workflow_status, orchestrator_state FROM ventures WHERE id=$1', [ventureId]);
    expect(v.rows[0].status).toBe('cancelled');            // FR-4 terminal
    expect(v.rows[0].workflow_status).not.toBe('killed');  // not a kill gate
    expect(v.rows[0].orchestrator_state).toBe('idle');     // FR-4 unblock

    const a = await auditCounts(client, ventureId, decisionId);
    expect(a.eva).toBe(0);
    expect(a.ops).toBe(0);
  });

  it('FR-3: reject_chairman_decision still writes the identical trail via the shared helper', async () => {
    const ventureId = await blockedVenture(client, 5);
    const decisionId = await insertPendingDecision(client, ventureId, 5);

    const res = await client.query(
      `SELECT reject_chairman_decision($1, $2, 'test-decider') AS r`, [decisionId, RATIONALE]);
    expect(res.rows[0].r.success).toBe(true);
    expect(res.rows[0].r.is_kill_gate).toBe(true);
    expect(res.rows[0].r.new_status).toBe('killed');

    const a = await auditCounts(client, ventureId, decisionId);
    expect(a.kill.length).toBeGreaterThanOrEqual(1);
    expect(a.kill[a.kill.length - 1].metadata.source).toBe('reject_chairman_decision');
    expect(a.ops).toBeGreaterThanOrEqual(1);
    if (a.inEva) expect(a.eva).toBeGreaterThanOrEqual(1);
  });
});
