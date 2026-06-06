/**
 * Regression test for advance_venture_stage(uuid,integer,integer,text) — the
 * NON-GATE bug fixed by 20260606_fix_advance_venture_stage_nongate.sql
 * (SD-LEO-FIX-FIX-ADVANCE-VENTURE-001).
 *
 * BUG: For a non-gate from_stage (NOT in {3,5,13,17,18,23,24}) the gate-enforcement
 * block was skipped, leaving the RECORD `v_gate_decision` unassigned. The
 * venture_stage_transitions INSERT then read `v_gate_decision.id` UNCONDITIONALLY,
 * raising `record "v_gate_decision" is not assigned yet`. The function's
 * EXCEPTION WHEN OTHERS handler swallowed it and returned
 * {success:false, error:'record "v_gate_decision" is not assigned yet'} — so
 * every non-gate advance silently failed.
 *
 * FIX (Option A): a NULL-initialized scalar `v_gate_decision_id UUID := NULL` that
 * is assigned `v_gate_decision.id` ONLY inside the gate path; the INSERT reads the
 * scalar. Result: gate_decision_id = NULL for non-gate stages, real UUID for gate
 * stages.
 *
 * Why this test is MEANINGFUL (fails against the OLD buggy shape):
 *   - The behavioural test advances a venture FROM a non-gate stage and asserts
 *     {success:true} with handoff_data.gate_decision_id === null. Against the old
 *     function this returns {success:false, error:'record ... not assigned yet'} —
 *     so the assertion fails loudly.
 *   - The structural test inspects the LIVE pg_get_functiondef and asserts the
 *     INSERT no longer contains the unconditional `'gate_decision_id', v_gate_decision.id`
 *     read and that `v_gate_decision_id` is declared — a second, source-level guard
 *     that also fails against the pre-fix definition.
 *
 * ZERO-LEAK contract (mirrors tests/integration/sd-park.test.js): the whole suite
 * runs inside ONE outer real transaction that is ROLLED BACK in afterAll; each
 * test nests in its own SAVEPOINT. No live venture / stage_event / transition is
 * ever committed. Routed to the opt-in `db` vitest project via the `.db.test.js`
 * suffix (vitest.config.js DB_INCLUDE), so a no-DB `npm test` run skips it cleanly.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { HAS_REAL_DB } from '../../../helpers/db-available.js';

const describeDb = describe.skipIf(!HAS_REAL_DB);

const NON_GATE_FROM = 1; // stage 1 is NOT in {3,5,13,17,18,23,24}
const NON_GATE_TO = 2;
const GATE_FROM = 3;     // stage 3 is a kill gate
const GATE_TO = 4;
const ALL_GATES = [3, 5, 13, 17, 18, 23, 24];

const RUN_ID = `ADVNG-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let rawClient;
let spCounter = 0;
let companyId;

/** Seed a throwaway venture inside the outer txn, bypassing the Stage-0 origin
 *  guard (SET LOCAL leo.stage0_bypass) and supplying an explicit company_id so the
 *  auto_populate_company_id BEFORE-INSERT trigger does not require an auth.uid(). */
async function seedVenture(stage, { tier = 1 } = {}) {
  // leo.stage0_bypass is transaction-scoped (SET LOCAL); re-assert per seed is cheap
  // and harmless. tier=1 avoids the Tier-0 stage-3 cap on the gate-path 3->4 advance.
  await rawClient.query(`SET LOCAL leo.stage0_bypass = 'true'`);
  const { rows } = await rawClient.query(
    `INSERT INTO ventures (name, problem_statement, current_lifecycle_stage, company_id, tier)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [`${RUN_ID} venture s${stage}`, `regression fixture ${RUN_ID}`, stage, companyId, tier],
  );
  return rows[0].id;
}

async function callAdvance(ventureId, fromStage, toStage) {
  const { rows } = await rawClient.query(
    `SELECT advance_venture_stage($1, $2, $3, 'normal') AS result`,
    [ventureId, fromStage, toStage],
  );
  return rows[0].result;
}

async function readTransitionHandoff(ventureId) {
  const { rows } = await rawClient.query(
    `SELECT handoff_data FROM venture_stage_transitions WHERE venture_id = $1`,
    [ventureId],
  );
  return rows.map((r) => r.handoff_data);
}

describeDb('advance_venture_stage — non-gate regression (live DB, savepoint-isolated)', () => {
  beforeAll(async () => {
    const { createDatabaseClient } = await import('../../../../lib/supabase-connection.js');
    rawClient = await createDatabaseClient('engineer');
    await rawClient.query('BEGIN'); // outer txn — rolled back in afterAll
    // Pick any existing company to satisfy the company_id FK on ventures.
    const { rows } = await rawClient.query(`SELECT id FROM companies LIMIT 1`);
    expect(rows.length).toBe(1); // environment sanity: at least one company exists
    companyId = rows[0].id;
  });

  afterAll(async () => {
    if (rawClient) {
      await rawClient.query('ROLLBACK'); // discard EVERY seeded row — zero reach prod
      const { rows } = await rawClient.query(
        `SELECT count(*)::int AS n FROM ventures WHERE name LIKE $1`,
        [`${RUN_ID}%`],
      );
      expect(rows[0].n).toBe(0); // confirm rollback cleaned up the fixtures
      await rawClient.end();
    }
  });

  let testSp;
  beforeEach(async () => {
    testSp = `sp_advng_${++spCounter}`;
    await rawClient.query(`SAVEPOINT ${testSp}`);
    return async () => {
      await rawClient.query(`ROLLBACK TO SAVEPOINT ${testSp}`);
      await rawClient.query(`RELEASE SAVEPOINT ${testSp}`);
    };
  });

  it('sanity: the chosen NON_GATE_FROM stage is genuinely not a gate', () => {
    expect(ALL_GATES).not.toContain(NON_GATE_FROM);
  });

  it('advancing FROM a non-gate stage returns {success:true} with gate_decision_id NULL (no "record not assigned" error)', async () => {
    const ventureId = await seedVenture(NON_GATE_FROM);

    const result = await callAdvance(ventureId, NON_GATE_FROM, NON_GATE_TO);

    // The exact failure shape the old buggy function produced — must NOT appear.
    if (result?.success === false) {
      expect(result.error).not.toMatch(/record "?v_gate_decision"? is not assigned yet/i);
    }
    expect(result.success).toBe(true);
    expect(result.from_stage).toBe(NON_GATE_FROM);
    expect(result.to_stage).toBe(NON_GATE_TO);

    const handoffs = await readTransitionHandoff(ventureId);
    expect(handoffs.length).toBe(1);
    // gate_decision_id is present in the JSONB and is explicitly null for a non-gate advance.
    expect(handoffs[0]).toHaveProperty('gate_decision_id');
    expect(handoffs[0].gate_decision_id).toBeNull();
  });

  it('the gate path still records the REAL chairman_decision id (fix did not break gate stages)', async () => {
    const ventureId = await seedVenture(GATE_FROM);
    const { rows: cd } = await rawClient.query(
      `INSERT INTO chairman_decisions (venture_id, lifecycle_stage, decision, status, decision_type)
       VALUES ($1, $2, 'pass', 'approved', 'gate_review')
       RETURNING id`,
      [ventureId, GATE_FROM],
    );
    const decisionId = cd[0].id;

    const result = await callAdvance(ventureId, GATE_FROM, GATE_TO);
    expect(result.success).toBe(true);

    const handoffs = await readTransitionHandoff(ventureId);
    expect(handoffs.length).toBe(1);
    expect(handoffs[0].gate_decision_id).toBe(decisionId);
  });

  it('a gate stage WITHOUT an approved decision is still rejected (gate enforcement intact)', async () => {
    const ventureId = await seedVenture(GATE_FROM);
    // No chairman_decisions row inserted → gate not approved.
    const result = await callAdvance(ventureId, GATE_FROM, GATE_TO);
    expect(result.success).toBe(false);
    expect(result.error).toBe('gate_not_approved');
    expect(result.error).not.toMatch(/not assigned yet/i);
  });

  it('STRUCTURAL guard: live function declares v_gate_decision_id and the INSERT no longer reads v_gate_decision.id unconditionally', async () => {
    const { rows } = await rawClient.query(
      `SELECT pg_get_functiondef('public.advance_venture_stage(uuid,integer,integer,text)'::regprocedure) AS def`,
    );
    const def = rows[0].def;

    // Delta 1: scalar declared and NULL-initialized.
    expect(def).toMatch(/v_gate_decision_id\s+UUID\s*:=\s*NULL\s*;/);
    // Delta 2: assigned only on the gate path.
    expect(def).toMatch(/v_gate_decision_id\s*:=\s*v_gate_decision\.id\s*;/);
    // Delta 3: the JSONB handoff key now binds to the scalar, NOT the record field.
    expect(def).toMatch(/'gate_decision_id',\s*v_gate_decision_id\b/);

    // The OLD buggy shape — the JSONB key bound to the unguarded record field —
    // must be gone. (Strip line comments so a "-- was v_gate_decision.id" note in
    // the source does not produce a false match.)
    const codeOnly = def
      .split('\n')
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n');
    expect(codeOnly).not.toMatch(/'gate_decision_id',\s*v_gate_decision\.id\b/);
    // In executable code, v_gate_decision.id appears exactly once: the guarded assignment.
    const dotIdRefs = (codeOnly.match(/v_gate_decision\.id/g) || []).length;
    expect(dotIdRefs).toBe(1);
  });
});
