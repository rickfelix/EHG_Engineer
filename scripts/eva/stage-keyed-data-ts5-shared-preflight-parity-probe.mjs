#!/usr/bin/env node
/**
 * TS-5 (SD-LEO-INFRA-STAGE-KEYED-DATA-001): proves fn_parked_venture_preflight() (FR-5) produces
 * the IDENTICAL verdict whether invoked directly via SQL or indirectly through the Node
 * preconditions script's runParkedVentureClassification() wrapper -- there is one implementation
 * of the logic, not two hand-maintained copies that can drift out of sync (the asymmetry
 * TESTING sub-agent found in v1's own inline DO-block preflight, which is inseparable from the
 * migration body and cannot be evaluated standalone).
 *
 * Fixture, WITHIN a rolled-back transaction: v1's own preflight refuses to apply while the 2
 * known real (is_demo=false) parked ventures (MarketLens, DataDistill) remain in range --
 * temporarily flip is_demo=true to let v1+v2 apply, THEN flip it back to false before running the
 * comparison, so the actual target scenario (2 real ventures correctly flagged) is what gets
 * tested, not a fixture-neutralized absence of them.
 *
 * Re-run: node scripts/eva/stage-keyed-data-ts5-shared-preflight-parity-probe.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { runParkedVentureClassification } from '../../lib/eva/uat-stage-migration/parked-venture-classifier.mjs';
import { assertInTransaction } from '../../lib/eva/uat-stage-migration/rollback-probe-harness.mjs';

const ENGINEER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V1_PATH = path.resolve(ENGINEER_ROOT, 'database/chairman-gated/20260825_dedicated_venture_uat_stage_insert_and_renumber.sql');
const V2_PATH = path.resolve(ENGINEER_ROOT, 'database/chairman-gated/20260828_stage_keyed_data_config_widen_v2.sql');
const EVIDENCE_PATH = path.resolve(ENGINEER_ROOT, 'database/evidence/stage-keyed-data-config/TS-5-shared-preflight-parity.json');

async function main() {
  const generatedAt = new Date().toISOString();
  const v1 = fs.readFileSync(V1_PATH, 'utf8');
  const v2 = fs.readFileSync(V2_PATH, 'utf8');
  const client = await createDatabaseClient('engineer', { verify: false });
  const evidence = { generatedAt, sd: 'SD-LEO-INFRA-STAGE-KEYED-DATA-001', scenario: 'TS-5' };
  let pass = false;

  try {
    await client.query('BEGIN');
    await assertInTransaction((sql, params) => client.query(sql, params));

    const { rows: realVentures } = await client.query(
      `SELECT id FROM public.ventures WHERE current_lifecycle_stage BETWEEN 23 AND 26 AND is_demo IS NOT TRUE`
    );
    evidence.realVenturesFound = realVentures.map((v) => v.id);
    if (realVentures.length === 0) {
      throw new Error('TS-5 INCONCLUSIVE: no real parked ventures found -- the fixture this scenario depends on (v1\'s own documented blocker) has apparently already been resolved; this probe needs updating rather than passing vacuously.');
    }
    const realIds = realVentures.map((v) => v.id);

    // Unblock v1's own preflight (fixture setup only).
    await client.query(`UPDATE public.ventures SET is_demo = true WHERE id = ANY($1::uuid[])`, [realIds]);
    await client.query(v1);
    await client.query(v2);

    // Restore the REAL condition this scenario is actually about, before comparing verdicts.
    await client.query(`UPDATE public.ventures SET is_demo = false WHERE id = ANY($1::uuid[])`, [realIds]);

    const { rows: fnOid } = await client.query(`SELECT to_regprocedure('public.fn_parked_venture_preflight(integer, integer, boolean)') AS oid`);
    if (!fnOid[0]?.oid) throw new Error('TS-5 FAILED: fn_parked_venture_preflight does not exist after applying v2 -- FR-5 function is missing.');

    const { rows: directRows } = await client.query(`SELECT public.fn_parked_venture_preflight(23, 26, false) AS verdict`);
    const direct = directRows[0].verdict;
    evidence.directInvocation = direct;

    const viaWrapper = await runParkedVentureClassification(client, {});
    evidence.wrapperInvocation = viaWrapper;

    const directRealIds = [...(direct.real_venture_ids || [])].sort();
    const wrapperRealIds = (viaWrapper.real || []).map((v) => v.id).sort();

    if (direct.blocked !== viaWrapper.blocked) throw new Error(`TS-5 FAILED: blocked mismatch -- direct=${direct.blocked}, wrapper=${viaWrapper.blocked}`);
    if (direct.real_count !== viaWrapper.realCount) throw new Error(`TS-5 FAILED: realCount mismatch -- direct=${direct.real_count}, wrapper=${viaWrapper.realCount}`);
    if (JSON.stringify(directRealIds) !== JSON.stringify(wrapperRealIds)) throw new Error(`TS-5 FAILED: real venture id sets differ -- direct=${JSON.stringify(directRealIds)}, wrapper=${JSON.stringify(wrapperRealIds)}`);
    // NOT asserting real_count === realIds.length (2): v1's own renumber already ran inside this
    // same transaction before this comparison, and DataDistill's pre-shift stage (26) legitimately
    // shifts to 27 -- OUTSIDE the 23-26 range this probe checks -- while MarketLens's pre-shift
    // stage (24) shifts to 25, which stays inside it. That is v1 working as intended, not a defect
    // in this probe; only MarketLens is still expected in-range at this point. TS-5's actual claim
    // is PARITY between the two invocation paths, which the equality checks above already prove.
    if (direct.blocked !== true || direct.real_count < 1) throw new Error(`TS-5 FAILED: expected both paths to report blocked=true with at least 1 real venture still in range, got direct.blocked=${direct.blocked} real_count=${direct.real_count}`);

    evidence.identicalVerdict = true;
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
