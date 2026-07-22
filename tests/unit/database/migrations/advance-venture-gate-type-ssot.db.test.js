/**
 * Regression test for advance_venture_stage(uuid,integer,integer,text) — the
 * SSOT gate-type fix (SD-LEO-INFRA-RECONCILE-EHG-REPO-001,
 * 20260722_stage_advancement_advance_venture_stage_gate_type_ssot.sql).
 *
 * BUG BEING FIXED: the LIVE function hardcodes gate membership as
 * v_kill_gates=[3,5,13,24], v_promotion_gates=[17,18,23],
 * v_all_gates=[3,5,13,17,18,23,24] — omitting promotion-gate stages 10, 16,
 * 19, 25 entirely (a confirmed-active chairman-gate bypass) and swapping the
 * 23/24 kill/promotion labels versus the venture_stages.gate_type SSOT.
 *
 * The migration is chairman-gated (SD-LEO-INFRA-MIGRATION-READINESS-CHAIRMAN-
 * GATED-EXEMPT-001) and MUST NOT be applied to production by this suite. To
 * prove the fix without ever touching the live definition, this test applies
 * the migration's CREATE OR REPLACE FUNCTION INSIDE the outer transaction
 * (which is rolled back in afterAll), tests behavior against that
 * transaction-local definition, then discards it entirely on rollback —
 * mirroring the zero-leak contract of advance-venture-nongate.db.test.js, one
 * level further: this suite also stages the code change itself inside the
 * disposable transaction, not just the seeded data.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HAS_REAL_DB } from '../../../helpers/db-available.js';

const describeDb = describe.skipIf(!HAS_REAL_DB);

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = readFileSync(
  join(__dirname, '../../../../database/migrations/20260722_stage_advancement_advance_venture_stage_gate_type_ssot.sql'),
  'utf8',
);

// Live SSOT (verified 2026-07-22): kill={3,5,13,23}, promotion={10,16,17,18,19,24,25}
const KILL_GATES = [3, 5, 13, 23];
const PROMOTION_GATES = [10, 16, 17, 18, 19, 24, 25];
const NEWLY_ENFORCED = [10, 16, 19, 25]; // omitted by the OLD hardcoded arrays
const PREVIOUSLY_ENFORCED_PROMOTION = [17, 18]; // were correct before too
const NON_GATE_STAGE = 1;

const RUN_ID = `ADVSSOT-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let rawClient;
let spCounter = 0;
let companyId;

async function seedVenture(stage, { tier = 1 } = {}) {
  await rawClient.query('SET LOCAL leo.stage0_bypass = \'true\'');
  const { rows } = await rawClient.query(
    `INSERT INTO ventures (name, problem_statement, current_lifecycle_stage, company_id, tier)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [`${RUN_ID} venture s${stage}`, `SSOT gate-type fixture ${RUN_ID}`, stage, companyId, tier],
  );
  return rows[0].id;
}

/** Seed the artifact fn_stage_artifact_precondition requires for a given
 *  stage, so tests that assert a clean {success:true} aren't incidentally
 *  blocked by the unrelated, preserved-verbatim artifact-precondition check
 *  (SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001) - out of scope for this fix. */
async function seedRequiredArtifact(ventureId, stage, artifactType) {
  await rawClient.query(
    `INSERT INTO venture_artifacts (id, venture_id, lifecycle_stage, artifact_type, title, is_current)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, true)`,
    [ventureId, stage, artifactType, `${RUN_ID} required artifact for stage ${stage}`],
  );
}

async function approveGate(ventureId, stage) {
  const { rows } = await rawClient.query(
    `INSERT INTO chairman_decisions (venture_id, lifecycle_stage, decision, status, decision_type)
     VALUES ($1, $2, 'go', 'approved', 'gate_review')
     RETURNING id`,
    [ventureId, stage],
  );
  return rows[0].id;
}

async function callAdvance(ventureId, fromStage, toStage) {
  const { rows } = await rawClient.query(
    'SELECT advance_venture_stage($1, $2, $3, \'normal\') AS result',
    [ventureId, fromStage, toStage],
  );
  return rows[0].result;
}

describeDb('advance_venture_stage — SSOT gate-type fix (live DB, transaction-local migration apply, savepoint-isolated)', () => {
  beforeAll(async () => {
    const { createDatabaseClient } = await import('../../../../lib/supabase-connection.js');
    rawClient = await createDatabaseClient('engineer');
    await rawClient.query('BEGIN'); // outer txn — rolled back in afterAll; NOTHING here reaches prod

    const { rows: companies } = await rawClient.query('SELECT id FROM companies LIMIT 1');
    expect(companies.length).toBe(1);
    companyId = companies[0].id;

    // Sanity: confirm the pre-fix bug is real BEFORE applying the migration,
    // so this suite fails loudly if the SSOT itself drifted since PLAN phase.
    const { rows: ssot } = await rawClient.query(
      'SELECT stage_number, gate_type FROM venture_stages WHERE stage_number = ANY($1) ORDER BY stage_number',
      [[...KILL_GATES, ...PROMOTION_GATES]],
    );
    const ssotMap = Object.fromEntries(ssot.map((r) => [r.stage_number, r.gate_type]));
    for (const s of KILL_GATES) expect(ssotMap[s]).toBe('kill');
    for (const s of PROMOTION_GATES) expect(ssotMap[s]).toBe('promotion');

    // Apply the migration's CREATE OR REPLACE + self-verify DO block, entirely
    // inside this transaction. Discarded on ROLLBACK in afterAll below.
    await rawClient.query(MIGRATION_SQL);
  });

  afterAll(async () => {
    if (rawClient) {
      await rawClient.query('ROLLBACK'); // discards seeded rows AND the function replacement
      const { rows } = await rawClient.query(
        'SELECT count(*)::int AS n FROM ventures WHERE name LIKE $1',
        [`${RUN_ID}%`],
      );
      expect(rows[0].n).toBe(0);
      await rawClient.end();
    }
  });

  let testSp;
  beforeEach(async () => {
    testSp = `sp_advssot_${++spCounter}`;
    await rawClient.query(`SAVEPOINT ${testSp}`);
    return async () => {
      await rawClient.query(`ROLLBACK TO SAVEPOINT ${testSp}`);
      await rawClient.query(`RELEASE SAVEPOINT ${testSp}`);
    };
  });

  // --- TS-9: SSOT canonical-snapshot guard -------------------------------
  it('TS-9: venture_stages gate_type snapshot matches the pinned canonical set for all known gate/non-gate stages', async () => {
    const { rows } = await rawClient.query(
      'SELECT stage_number, gate_type FROM venture_stages WHERE stage_number = ANY($1) ORDER BY stage_number',
      [[...KILL_GATES, ...PROMOTION_GATES, 20]],
    );
    const map = Object.fromEntries(rows.map((r) => [r.stage_number, r.gate_type]));
    for (const s of KILL_GATES) expect(map[s]).toBe('kill');
    for (const s of PROMOTION_GATES) expect(map[s]).toBe('promotion');
    expect(map[20]).toBe('none'); // S20 quality-verdict path must remain a non-gate stage
  });

  // --- TS-1 + TS-10: new enforcement, zero side effects on rejection -----
  it.each(NEWLY_ENFORCED)('TS-1/TS-10: advancing FROM stage %i (newly-enforced) without an approved decision is rejected with zero write side effects', async (stage) => {
    const ventureId = await seedVenture(stage);
    const result = await callAdvance(ventureId, stage, stage + 1);

    expect(result.success).toBe(false);
    expect(result.error).toBe('gate_not_approved');
    expect(result.gate_type).toBe('promotion');

    const { rows: transitions } = await rawClient.query(
      'SELECT count(*)::int AS n FROM venture_stage_transitions WHERE venture_id = $1',
      [ventureId],
    );
    expect(transitions[0].n).toBe(0); // no partial write on rejection
  });

  // --- TS-4: approved decision still allows advance at newly-enforced stages
  it('TS-4: an approved decision at a newly-enforced stage (19) allows the advance to succeed', async () => {
    const ventureId = await seedVenture(19);
    await approveGate(ventureId, 19);
    await seedRequiredArtifact(ventureId, 19, 'build_mvp_build'); // unrelated precondition, not this fix's concern

    const result = await callAdvance(ventureId, 19, 20);
    expect(result.success).toBe(true);
    expect(result.from_stage).toBe(19);
    expect(result.to_stage).toBe(20);
  });

  // --- TS-2: no regression at previously-correct kill/promotion stages ---
  it.each(KILL_GATES)('TS-2: kill stage %i without an approved decision is still rejected exactly as before (no regression)', async (stage) => {
    const ventureId = await seedVenture(stage);
    const result = await callAdvance(ventureId, stage, stage + 1);
    expect(result.success).toBe(false);
    expect(result.error).toBe('gate_not_approved');
    expect(result.gate_type).toBe('kill');
  });

  it.each(PREVIOUSLY_ENFORCED_PROMOTION)('TS-2: promotion stage %i without an approved decision is still rejected exactly as before (no regression)', async (stage) => {
    const ventureId = await seedVenture(stage);
    const result = await callAdvance(ventureId, stage, stage + 1);
    expect(result.success).toBe(false);
    expect(result.error).toBe('gate_not_approved');
    expect(result.gate_type).toBe('promotion');
  });

  // --- TS-3: 23/24 label swap fixed ---------------------------------------
  it('TS-3: stage 23 reports gate_type="kill" (was mislabeled "promotion" pre-fix)', async () => {
    const ventureId = await seedVenture(23);
    const result = await callAdvance(ventureId, 23, 24);
    expect(result.success).toBe(false);
    expect(result.gate_type).toBe('kill');
  });

  it('TS-3: stage 24 reports gate_type="promotion" (was mislabeled "kill" pre-fix)', async () => {
    const ventureId = await seedVenture(24);
    const result = await callAdvance(ventureId, 24, 25);
    expect(result.success).toBe(false);
    expect(result.gate_type).toBe('promotion');
  });

  // --- Non-gate stage still advances freely (no regression vs 20260606 fix)
  it('non-gate stage advance is unaffected (gate_decision_id remains NULL, no "record not assigned" error)', async () => {
    const ventureId = await seedVenture(NON_GATE_STAGE);
    await seedRequiredArtifact(ventureId, NON_GATE_STAGE, 'truth_idea_brief'); // unrelated precondition, not this fix's concern
    const result = await callAdvance(ventureId, NON_GATE_STAGE, NON_GATE_STAGE + 1);
    expect(result.success).toBe(true);

    const { rows } = await rawClient.query(
      'SELECT handoff_data FROM venture_stage_transitions WHERE venture_id = $1',
      [ventureId],
    );
    expect(rows[0].handoff_data.gate_decision_id).toBeNull();
  });

  // --- TS-13: forensic bypass-detection query self-test -------------------
  it('TS-13: the forensic bypass-detection query correctly identifies a planted un-approved historical advance at a newly-enforced stage', async () => {
    // Plant a historical transition FROM stage 16 with NO approved decision,
    // simulating exactly the kind of gap this migration closes going forward.
    const ventureId = await seedVenture(17); // venture now sits at 17 (post-advance)
    await rawClient.query(
      `INSERT INTO venture_stage_transitions (venture_id, from_stage, to_stage, transition_type, approved_by, handoff_data, idempotency_key)
       VALUES ($1, 16, 17, 'normal', NULL, '{"gate_decision_id": null}'::jsonb, gen_random_uuid())`,
      [ventureId],
    );

    const { rows } = await rawClient.query(
      `SELECT DISTINCT t.venture_id
         FROM venture_stage_transitions t
         WHERE t.from_stage = ANY($1)
           AND NOT EXISTS (
             SELECT 1 FROM chairman_decisions cd
             WHERE cd.venture_id = t.venture_id
               AND cd.lifecycle_stage = t.from_stage
               AND cd.status = 'approved'
               AND cd.decision IN ('pass','go','proceed','approve','conditional_pass','conditional_go','continue','release')
           )`,
      [NEWLY_ENFORCED],
    );
    const flagged = rows.map((r) => r.venture_id);
    expect(flagged).toContain(ventureId);
  });

  // --- STRUCTURAL guards: transaction-local live definition ---------------
  it('STRUCTURAL guard: hardcoded gate arrays are gone and the SSOT read landed', async () => {
    const { rows } = await rawClient.query(
      'SELECT pg_get_functiondef(\'public.advance_venture_stage(uuid,integer,integer,text)\'::regprocedure) AS def',
    );
    const def = rows[0].def;

    expect(def).not.toMatch(/v_kill_gates/);
    expect(def).not.toMatch(/v_promotion_gates/);
    expect(def).not.toMatch(/v_all_gates/);
    expect(def).toMatch(/FROM venture_stages/);
    expect(def).toMatch(/v_gate_type IN \('kill', 'promotion'\)/);

    // Preserved behavior (no regression in the non-gate / artifact-precondition paths)
    expect(def).toMatch(/gate_not_approved/);
    expect(def).toMatch(/fn_stage_artifact_precondition/);
    expect(def).toMatch(/artifact_precondition_unmet/);
    expect(def).toMatch(/v_gate_decision_id/);
  });
});
