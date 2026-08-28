#!/usr/bin/env node
/**
 * TS-4 (SD-LEO-INFRA-STAGE-KEYED-DATA-001): proves the v2 chairman-gated migration
 * (database/chairman-gated/20260828_stage_keyed_data_config_widen_v2.sql) applies cleanly
 * immediately after v1 (20260825_dedicated_venture_uat_stage_insert_and_renumber.sql), inside a
 * SINGLE transaction that is ALWAYS rolled back -- never committed. Standalone .mjs probe script
 * emitting a committed JSON evidence artifact, per TR-6: this is a production-state assertion (it
 * depends on the live schema, the live gate_boundary_config/venture_stage_cutover_grandfather/
 * stage_artifact_requirements row content, and the 2 real parked ventures v1's own banner names),
 * so a non-prod DB tier would not hold the fixtures needed to prove anything -- and
 * tests/helpers/db-target.js's fail-closed DB-tier gate would report this SKIPPED, not PASS/FAIL,
 * if authored as a vitest *.db.test.js (per TESTING sub-agent finding TR-6/8ca0d619...).
 *
 * COMMIT is never issued: this file only ever calls BEGIN / ROLLBACK explicitly, both v1 and v2
 * are pure DDL/DML text (neither contains a literal transaction-control statement -- both
 * documented in their own banners as "no BEGIN;/COMMIT; here -- apply-migration.js supplies the
 * transaction"), and this probe supplies its OWN transaction instead, held open only long enough
 * to run both files and inspect the result, then rolled back unconditionally in a finally block.
 *
 * Fixture, WITHIN the same rolled-back transaction (TR-6's "fixture must be created within the
 * same rolled-back transaction" clause): v1's own preflight correctly refuses to apply while any
 * REAL (is_demo=false) venture sits parked in the 23-26 shift range -- a genuine, separately-
 * tracked, still-unresolved blocker for v1 itself (2 real ventures, per v1's own banner). This
 * probe temporarily flips is_demo=true for exactly those rows to validate v2's OWN SQL correctness
 * in isolation; nothing commits, so live data is never touched, and this probe does not claim v1's
 * real blocker is resolved -- it remains a precondition for the actual chairman ceremony.
 *
 * Re-run: node scripts/eva/stage-keyed-data-v2-dryrun-probe.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../lib/supabase-connection.js';

const ENGINEER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V1_PATH = path.resolve(ENGINEER_ROOT, 'database/chairman-gated/20260825_dedicated_venture_uat_stage_insert_and_renumber.sql');
const V2_PATH = path.resolve(ENGINEER_ROOT, 'database/chairman-gated/20260828_stage_keyed_data_config_widen_v2.sql');
const EVIDENCE_PATH = path.resolve(ENGINEER_ROOT, 'database/evidence/stage-keyed-data-config/TS-4-v1-v2-rollback-dryrun.json');

async function main() {
  const generatedAt = new Date().toISOString();
  const v1 = fs.readFileSync(V1_PATH, 'utf8');
  const v2 = fs.readFileSync(V2_PATH, 'utf8');

  const client = await createDatabaseClient('engineer', { verify: false });
  const evidence = { generatedAt, sd: 'SD-LEO-INFRA-STAGE-KEYED-DATA-001', scenario: 'TS-4', steps: [] };
  let pass = false;
  try {
    await client.query('BEGIN');
    evidence.steps.push({ step: 'BEGIN', ok: true });

    const { rows: blockers } = await client.query(
      `SELECT id, name FROM public.ventures WHERE current_lifecycle_stage BETWEEN 23 AND 26 AND is_demo IS NOT TRUE`
    );
    evidence.realVenturesTemporarilyFlippedForTestOnly = blockers;
    if (blockers.length > 0) {
      await client.query(`UPDATE public.ventures SET is_demo = true WHERE id = ANY($1::uuid[])`, [blockers.map((b) => b.id)]);
    }

    await client.query(v1);
    evidence.steps.push({ step: 'apply v1', ok: true });

    await client.query(v2);
    evidence.steps.push({ step: 'apply v2', ok: true });

    await client.query(v1);
    evidence.steps.push({ step: 'reapply v1 (idempotency)', ok: true });

    await client.query(v2);
    evidence.steps.push({ step: 'reapply v2 (idempotency)', ok: true });

    const { rows: checkRows } = await client.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conname IN ('chk_lifecycle_stage','venture_capture_snapshots_lifecycle_stage_check','stage_artifact_requirements_stage_number_check')
       ORDER BY conname`
    );
    evidence.sampleWidenedChecks = checkRows;

    const { rows: gbc } = await client.query(`SELECT from_stage, to_stage FROM public.gate_boundary_config ORDER BY from_stage`);
    evidence.gateBoundaryConfigAfterShift = gbc;

    const { rows: fnDef } = await client.query(
      `SELECT pg_get_functiondef('public.approve_chairman_decision(uuid,text,text,approval_type_enum,uuid)'::regprocedure) AS def`
    );
    evidence.approveChairmanDecisionStepUpFixConfirmed = fnDef[0].def.includes('lifecycle_stage = 25');

    pass = true;
  } catch (err) {
    evidence.error = err.message;
    pass = false;
  } finally {
    await client.query('ROLLBACK');
    evidence.steps.push({ step: 'ROLLBACK', ok: true });
    await client.end();
  }

  evidence.result = pass ? 'PASS' : 'FAIL';
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`Evidence written to ${path.relative(ENGINEER_ROOT, EVIDENCE_PATH)}`);
  console.log(`Result: ${evidence.result}`);
  if (!pass) process.exitCode = 1;
}

main();
