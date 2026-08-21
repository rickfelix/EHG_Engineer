/**
 * TS-9 — the three kill signatures, for SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 FR-4.
 *
 * ⚠ THIS SUITE IS SKIPPED IN EVERY ENVIRONMENT TODAY, AND THAT IS THE CORRECT BEHAVIOUR.
 * It gates on HAS_REAL_DB from tests/helpers/db-available.js, which QF-20260726-459 redefined to
 * mean "is the target an EXPLICITLY DESIGNATED non-production database?". DESIGNATED_NON_PROD_REFS
 * is deliberately EMPTY (no non-prod project is provisioned), so the predicate is false everywhere
 * and this suite reports skipped rather than running against production. Do NOT widen the guard to
 * make it run — a green run bought that way is a run against live customer data. The guard is
 * imported from its single definition site and is never re-derived here.
 *
 * BECAUSE IT CANNOT RUN, IT IS NOT THE EVIDENCE FOR FR-4. The behavioural evidence is
 * scripts/probe-eva-scheduler-hygiene-migrations.mjs, which executes the same scenarios read-only
 * inside one rolled-back transaction (24/24 assertions, 2026-08-21). This file exists so that the
 * moment a designated non-prod target is provisioned, the coverage is already written and wired —
 * not so that a skipped suite can be counted as proof.
 *
 * ZERO-LEAK CONTRACT (mirrors tests/unit/database/migrations/advance-venture-gate-type-ssot.db.test.js):
 * the two chairman-gated migrations are applied INSIDE the outer transaction, every test runs in a
 * savepoint, and afterAll ROLLBACKs the whole thing and asserts nothing survived. Neither the
 * migrations nor the fixtures are ever committed.
 *
 * THE THREE SIGNATURES (why a single happy-path test would be a false negative): only 21 of the 45
 * killed-venture queue rows observed live carry kill_venture()'s signature, and 16 have
 * killed_at IS NULL — meaning kill_venture() never ran for them. A teardown hooked to, or tested
 * only through, that one RPC would miss the majority of the real population.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HAS_REAL_DB } from '../../../helpers/db-available.js';

const describeDb = describe.skipIf(!HAS_REAL_DB);

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrations = join(__dirname, '../../../../database/migrations');
const WIDEN_SQL    = readFileSync(join(migrations, '20260821_eva_scheduler_queue_status_add_cancelled.sql'), 'utf8');
const TEARDOWN_SQL = readFileSync(join(migrations, '20260821_eva_scheduler_queue_kill_time_teardown.sql'), 'utf8');

const RUN_ID = `ESQKILL-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Queue statuses that must be left alone — the narrowness of the WHERE clause IS the safety story. */
const UNTOUCHED_STATUSES = ['dispatching', 'blocked', 'paused', 'completed'];

let rawClient;
let companyId;
let spCounter = 0;

async function seedVenture(label) {
  // trg_enforce_stage0_origin blocks direct INSERTs without its documented provisioner escape hatch.
  await rawClient.query("SET LOCAL leo.stage0_bypass = 'true'");
  const { rows } = await rawClient.query(
    `INSERT INTO ventures (name, problem_statement, current_lifecycle_stage, company_id, tier, status)
     VALUES ($1, $2, 1, $3, 1, 'active')
     RETURNING id`,
    [`${RUN_ID} ${label}`, `eva scheduler kill-teardown fixture ${RUN_ID}`, companyId],
  );
  // is_demo defaults false, so the sync triggers act on it (the is_demo guard would skip a fixture).
  return rows[0].id;
}

/** Queue statuses for a ventures.id, hopping ventures.id -> eva_ventures.id -> queue.venture_id. */
async function queueStatuses(ventureId) {
  const { rows } = await rawClient.query(
    `SELECT q.status FROM eva_scheduler_queue q
       JOIN eva_ventures v ON v.id = q.venture_id
      WHERE v.venture_id = $1`,
    [ventureId],
  );
  return rows.map((r) => r.status);
}

async function isSchedulable(ventureId) {
  const { rows } = await rawClient.query(
    `SELECT count(*)::int AS n FROM select_schedulable_ventures(1000) s
       JOIN eva_ventures v ON v.id = s.venture_id
      WHERE v.venture_id = $1`,
    [ventureId],
  );
  return rows[0].n > 0;
}

describeDb('FR-4 kill-time teardown — three kill signatures (live DB, transaction-local migration apply)', () => {
  beforeAll(async () => {
    const { createDatabaseClient } = await import('../../../../lib/supabase-connection.js');
    rawClient = await createDatabaseClient('engineer');
    await rawClient.query('BEGIN'); // outer txn — rolled back in afterAll; NOTHING here reaches prod

    const { rows: companies } = await rawClient.query('SELECT id FROM companies LIMIT 1');
    expect(companies.length).toBe(1);
    companyId = companies[0].id;

    // PRE-FIX SANITY: prove the hazard is real before installing the fix, so this suite fails loudly
    // if the schema drifted rather than quietly asserting a tautology.
    const { rows: sel } = await rawClient.query(
      `SELECT p.prosrc AS src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='select_schedulable_ventures'`);
    expect(sel[0].src).toMatch(/q\.status = 'pending'/);
    expect(sel[0].src, 'the selector must NOT consult eva_ventures.status — that is the hazard')
      .not.toMatch(/v\.status\s*(=|<>|NOT IN|IN)/);

    // Apply BOTH migrations in dependency order, entirely inside this transaction.
    await rawClient.query(WIDEN_SQL);
    await rawClient.query(TEARDOWN_SQL);
  });

  afterAll(async () => {
    if (!rawClient) return;
    await rawClient.query('ROLLBACK'); // discards fixtures AND both migrations
    const { rows } = await rawClient.query(
      'SELECT count(*)::int AS n FROM ventures WHERE name LIKE $1', [`${RUN_ID}%`]);
    expect(rows[0].n, 'fixtures must not survive the rollback').toBe(0);
    const { rows: con } = await rawClient.query(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
        WHERE conrelid='public.eva_scheduler_queue'::regclass AND conname='eva_scheduler_queue_status_check'`);
    expect(con[0].d, 'the widened CHECK must not survive the rollback').not.toContain('cancelled');
    await rawClient.end();
  });

  let testSp;
  beforeEach(async () => {
    testSp = `sp_esqkill_${++spCounter}`;
    await rawClient.query(`SAVEPOINT ${testSp}`);
    return async () => {
      await rawClient.query(`ROLLBACK TO SAVEPOINT ${testSp}`);
      await rawClient.query(`RELEASE SAVEPOINT ${testSp}`);
    };
  });

  // ── SIGNATURE 2: the direct UPDATE that bypasses kill_venture() ──────────────────────────────
  // Listed first because it is the majority signature in the live backlog.
  it('TS-9.2: a direct UPDATE ventures SET status=cancelled cancels the pending queue row', async () => {
    const vid = await seedVenture('direct-update');
    expect(await queueStatuses(vid)).toEqual(['pending']);
    expect(await isSchedulable(vid)).toBe(true); // the hazard exists before the kill

    await rawClient.query("UPDATE ventures SET status = 'cancelled' WHERE id = $1", [vid]);

    expect(await queueStatuses(vid)).toEqual(['cancelled']);
    expect(await isSchedulable(vid), 'a killed venture must not be schedulable').toBe(false);
  });

  it.each(UNTOUCHED_STATUSES)(
    'TS-9.2b: a %s queue row survives the kill untouched (only pending is transitioned)',
    async (status) => {
      const vid = await seedVenture(`keep-${status}`);
      await rawClient.query(
        `UPDATE eva_scheduler_queue SET status = $2
          WHERE venture_id IN (SELECT id FROM eva_ventures WHERE venture_id = $1)`,
        [vid, status]);

      await rawClient.query("UPDATE ventures SET status = 'cancelled' WHERE id = $1", [vid]);

      expect(await queueStatuses(vid)).toEqual([status]);
    });

  it('TS-9.2c: a non-kill status change does NOT cancel the queue row', async () => {
    // Guards the other direction: the teardown must fire on 'killed' only, not on any status change.
    const vid = await seedVenture('pause-not-kill');
    await rawClient.query("UPDATE ventures SET status = 'paused' WHERE id = $1", [vid]);
    expect(await queueStatuses(vid)).toEqual(['pending']);
  });

  // ── SIGNATURE 1: the kill_venture() RPC ─────────────────────────────────────────────────────
  it('TS-9.1: kill_venture() leaves no pending queue row (skips if the chairman gate rejects us)', async () => {
    const { rows: exists } = await rawClient.query(
      `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
        WHERE n2.nspname='public' AND p.proname='kill_venture'`);
    if (exists[0].n === 0) return; // documented skip: no such RPC in this schema

    const vid = await seedVenture('kill-rpc');
    const sp = `sp_esqkill_rpc_${++spCounter}`;
    await rawClient.query(`SAVEPOINT ${sp}`);
    let threw = null;
    try {
      await rawClient.query('SELECT kill_venture($1, $2)', [vid, `TS-9 ${RUN_ID}`]);
      await rawClient.query(`RELEASE SAVEPOINT ${sp}`);
    } catch (e) {
      // A swallowed SQL error leaves the tx aborted; roll back to the savepoint to clear 25P02.
      await rawClient.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      await rawClient.query(`RELEASE SAVEPOINT ${sp}`);
      threw = e.message;
    }

    // Documented skip, matching tests/integration/kill-venture-rpc.test.js: fn_is_chairman() blocks
    // this RPC for a service-role test client. Measured 2026-08-21 by the probe: "Only chairman or
    // lead can reject a venture".
    if (threw && /chairman|lead|permission|denied|not authoriz/i.test(threw)) return;
    expect(threw, `kill_venture failed for an unexpected reason: ${threw}`).toBeNull();

    expect(await queueStatuses(vid)).not.toContain('pending');
    expect(await isSchedulable(vid)).toBe(false);
  });

  // ── SIGNATURE 3: the steady-state invariant, whichever path was taken ────────────────────────
  it('TS-9.3: after either kill path, no killed venture retains a pending queue row', async () => {
    const viaUpdate = await seedVenture('inv-direct');
    await rawClient.query("UPDATE ventures SET status = 'cancelled' WHERE id = $1", [viaUpdate]);

    const { rows } = await rawClient.query(
      `SELECT count(*)::int AS n FROM eva_scheduler_queue q
         JOIN eva_ventures v ON v.id = q.venture_id
        WHERE v.status = 'killed' AND q.status = 'pending'
          AND v.venture_id IN (SELECT id FROM ventures WHERE name LIKE $1)`,
      [`${RUN_ID}%`]);
    expect(rows[0].n).toBe(0);
  });
});
