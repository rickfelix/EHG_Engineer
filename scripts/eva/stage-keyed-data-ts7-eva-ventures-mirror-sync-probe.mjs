#!/usr/bin/env node
/**
 * TS-7 (SD-LEO-INFRA-STAGE-KEYED-DATA-001): measures eva_ventures mirror divergence at THREE
 * points within a single rolled-back run -- before v1's shift, after v1's shift but BEFORE v2's
 * backfill, and after v2's backfill -- so the artifact directly demonstrates the backfill's
 * effect (a delta this probe itself measures) rather than asserting a fix landed based on a
 * separate, earlier run's narrative. An adversarial TESTING sub-agent review of an earlier
 * version of this probe (which only measured after BOTH v1 and v2 had already applied) correctly
 * found it could not distinguish "the backfill fixed N rows" from "there was never any
 * divergence" -- this version measures the "would-be-broken" state explicitly, in the middle.
 *
 * NOTE on this SD's actual disposition vs. the PRD's original TS-7 framing: TS-7 was authored
 * assuming FR-4 would apply a "trigger fix" to sync_ventures_to_eva_ventures_update(). This SD's
 * EXEC-phase investigation found that function's `IF COALESCE(NEW.is_demo, false) THEN RETURN
 * NEW; END IF;` early-return is a DELIBERATE design decision (SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F,
 * "demo/test fixtures never enter the EVA pipeline"), not an oversight -- the TRIGGER itself is
 * left unchanged. Instead, v2 section 5b adds a one-time, precisely-scoped DATA backfill that
 * corrects exactly the rows THIS migration's own shift would otherwise leave stale, without
 * altering the trigger's forward-looking behavior. This probe verifies that backfill's effect.
 *
 * Fixture, WITHIN a rolled-back transaction: v1's own preflight requires zero real ventures
 * parked in range, matching actual production sequencing (v1 can only ever really apply once any
 * real ventures currently in the way are resolved) -- so is_demo is temporarily flipped for the
 * 2 currently-real ventures and LEFT flipped for this probe's shift simulation, the realistic
 * future scenario: by the time v1 actually applies, only demo ventures remain in range.
 *
 * Re-run: node scripts/eva/stage-keyed-data-ts7-eva-ventures-mirror-sync-probe.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { assertInTransaction } from '../../lib/eva/uat-stage-migration/rollback-probe-harness.mjs';

const ENGINEER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V1_PATH = path.resolve(ENGINEER_ROOT, 'database/chairman-gated/20260825_dedicated_venture_uat_stage_insert_and_renumber.sql');
const V2_PATH = path.resolve(ENGINEER_ROOT, 'database/chairman-gated/20260828_stage_keyed_data_config_widen_v2.sql');
const EVIDENCE_PATH = path.resolve(ENGINEER_ROOT, 'database/evidence/stage-keyed-data-config/TS-7-eva-ventures-mirror-sync.json');

const DIVERGENCE_SQL = `
  SELECT ev.venture_id, ev.current_lifecycle_stage AS eva_mirror, v.current_lifecycle_stage AS ventures_actual, v.is_demo
  FROM public.eva_ventures ev JOIN public.ventures v ON v.id = ev.venture_id
  WHERE ev.current_lifecycle_stage != v.current_lifecycle_stage`;

async function main() {
  const generatedAt = new Date().toISOString();
  const v1 = fs.readFileSync(V1_PATH, 'utf8');
  const v2 = fs.readFileSync(V2_PATH, 'utf8');
  const client = await createDatabaseClient('engineer', { verify: false });
  const evidence = { generatedAt, sd: 'SD-LEO-INFRA-STAGE-KEYED-DATA-001', scenario: 'TS-7' };
  let pass = false;

  try {
    await client.query('BEGIN');
    await assertInTransaction((sql, params) => client.query(sql, params));

    const { rows: beforeAnything } = await client.query(DIVERGENCE_SQL);
    evidence.divergenceBeforeAnyMigration = beforeAnything.length;

    const { rows: realVentures } = await client.query(
      `SELECT id FROM public.ventures WHERE current_lifecycle_stage BETWEEN 23 AND 26 AND is_demo IS NOT TRUE`
    );
    evidence.realVenturesTemporarilyFlippedDemo = realVentures.map((v) => v.id);
    if (realVentures.length > 0) {
      await client.query(`UPDATE public.ventures SET is_demo = true WHERE id = ANY($1::uuid[])`, [realVentures.map((v) => v.id)]);
    }

    // v1 alone: shifts ventures.current_lifecycle_stage (and its own CHECK) but does NOT touch
    // eva_ventures at all -- this is the "would-be-broken" state, measured explicitly rather than
    // inferred from a separate run.
    await client.query(v1);
    const { rows: afterV1OnlyRows } = await client.query(DIVERGENCE_SQL);
    evidence.divergenceAfterV1BeforeV2Backfill = afterV1OnlyRows.length;
    evidence.afterV1BeforeV2DivergentRows = afterV1OnlyRows;

    // v2 (includes section 5b's backfill).
    await client.query(v2);
    const { rows: afterV2Rows } = await client.query(DIVERGENCE_SQL);
    evidence.divergenceAfterV2Backfill = afterV2Rows.length;
    evidence.afterV2DivergentRows = afterV2Rows;

    evidence.backfillCorrectedRowCount = evidence.divergenceAfterV1BeforeV2Backfill - evidence.divergenceAfterV2Backfill;

    if (evidence.divergenceAfterV1BeforeV2Backfill > 0 && evidence.divergenceAfterV2Backfill === 0) {
      evidence.finding = `v1 alone left ${evidence.divergenceAfterV1BeforeV2Backfill} eva_ventures row(s) stale (measured directly, not inferred); v2's section 5b backfill corrected all of them (0 remaining). This directly demonstrates the backfill's effect within a single run.`;
      pass = true;
    } else if (evidence.divergenceAfterV1BeforeV2Backfill === 0 && evidence.divergenceAfterV2Backfill === 0) {
      evidence.finding = 'v1 alone produced zero divergence in this run (no demo venture currently in range has a pre-existing eva_ventures mirror) -- the backfill is a no-op here, correctly, not evidence it is unneeded in general.';
      pass = true;
    } else {
      evidence.finding = `UNEXPECTED: divergence after v1-only=${evidence.divergenceAfterV1BeforeV2Backfill}, after v2=${evidence.divergenceAfterV2Backfill} -- the backfill did not fully correct what v1 alone left stale.`;
      pass = false;
    }
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
  console.log(`Result: ${evidence.result} -- ${evidence.finding ?? evidence.error}`);
  if (!pass) process.exitCode = 1;
}

main();
