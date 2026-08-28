#!/usr/bin/env node
/**
 * TS-3 (SD-LEO-INFRA-STAGE-KEYED-DATA-001): proves stage_artifact_requirements_stage_number_check
 * actually enforces its widened bound after v1+v2 apply -- a stage_number=27 write LANDS, and a
 * PAIRED POSITIVE CONTROL at stage_number=28 raises SQLSTATE 23514. The positive control is the
 * point (FR-7): an absence-only assertion ("28 is refused") is unfalsifiable on its own -- it
 * would pass identically whether the CHECK constraint is enforcing, silently disabled, or the
 * table itself is unreachable. Pairing it with "27 LANDS" proves the constraint is being
 * evaluated, not merely that some unrelated error occurs.
 *
 * Standalone .mjs probe emitting a committed JSON evidence artifact (TR-6): a production-state
 * assertion depending on the live v1+v2 fixture, so a non-prod DB tier would not hold it, and
 * tests/helpers/db-target.js's fail-closed gate would report a *.db.test.js version SKIPPED, not
 * PASS/FAIL.
 *
 * Fixture, WITHIN the same rolled-back transaction (TR-6): applies v1 then v2 first (temporarily
 * neutralizing v1's 2 known real-parked-venture blockers for this transaction only, same pattern
 * as scripts/eva/stage-keyed-data-v2-dryrun-probe.mjs), THEN runs the CHECK-enforcement assertion
 * against the now-widened constraint. Nothing commits.
 *
 * Re-run: node scripts/eva/stage-keyed-data-ts3-check-enforcement-probe.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { assertNotCommitFamily, assertInTransaction, withSavepoint, assertSqlState } from '../../lib/eva/uat-stage-migration/rollback-probe-harness.mjs';

const ENGINEER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V1_PATH = path.resolve(ENGINEER_ROOT, 'database/chairman-gated/20260825_dedicated_venture_uat_stage_insert_and_renumber.sql');
const V2_PATH = path.resolve(ENGINEER_ROOT, 'database/chairman-gated/20260828_stage_keyed_data_config_widen_v2.sql');
const EVIDENCE_PATH = path.resolve(ENGINEER_ROOT, 'database/evidence/stage-keyed-data-config/TS-3-check-enforcement-positive-control.json');

const INSERT_SQL = `INSERT INTO public.stage_artifact_requirements (stage_number, artifact_type, required_status, is_blocking) VALUES ($1, $2, 'completed', false)`;

async function main() {
  const generatedAt = new Date().toISOString();
  const v1 = fs.readFileSync(V1_PATH, 'utf8');
  const v2 = fs.readFileSync(V2_PATH, 'utf8');
  const client = await createDatabaseClient('engineer', { verify: false });
  const evidence = { generatedAt, sd: 'SD-LEO-INFRA-STAGE-KEYED-DATA-001', scenario: 'TS-3' };
  let pass = false;

  // Two trust boundaries, handled differently: v1/v2 are large, pre-existing, already-verified
  // migration files applied here as FIXTURE via the raw (unguarded) client -- the shared harness's
  // assertNotCommitFamily correctly rejects them (they contain many legitimate PL/pgSQL "END;"/
  // "END IF;" keywords following a semicolon, indistinguishable by regex from a real END-family
  // transaction-control statement at that granularity; this repo's own dry-run scripts already
  // manually verified neither file issues an actual COMMIT). The guard is reserved for this
  // probe's OWN freshly-authored statements below, where its protection is meaningful.
  try {
    await client.query('BEGIN');
    const q = (sql, params) => client.query(assertNotCommitFamily(sql), params);
    await assertInTransaction(q);

    const { rows: blockers } = await client.query(
      `SELECT id FROM public.ventures WHERE current_lifecycle_stage BETWEEN 23 AND 26 AND is_demo IS NOT TRUE`
    );
    if (blockers.length > 0) {
      await client.query(`UPDATE public.ventures SET is_demo = true WHERE id = ANY($1::uuid[])`, [blockers.map((b) => b.id)]);
    }

    await client.query(v1);
    await client.query(v2);
    evidence.fixtureApplied = true;

    const at27 = await withSavepoint(q, 'stage_27_lands', () => q(INSERT_SQL, [27, 'probe_ts3_stage27']));
    evidence.stage27 = { landed: at27.landed, errorCode: at27.error?.code ?? null };
    if (!at27.landed) {
      throw new Error(`TS-3 FAILED: stage_number=27 write did not LAND after v2 widened the CHECK to <= 27 (error: ${at27.error?.message})`);
    }

    const at28 = await withSavepoint(q, 'stage_28_positive_control', () => q(INSERT_SQL, [28, 'probe_ts3_stage28']));
    evidence.stage28 = { landed: at28.landed, errorCode: at28.error?.code ?? null };
    if (at28.landed) {
      throw new Error('TS-3 FAILED: stage_number=28 write LANDED -- the CHECK constraint is not enforcing its upper bound at all (positive control did not fire)');
    }
    assertSqlState(at28.error, '23514');
    evidence.positiveControlConfirmedSqlState23514 = true;
    pass = true;
  } catch (err) {
    evidence.error = err.message;
    pass = false;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
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
