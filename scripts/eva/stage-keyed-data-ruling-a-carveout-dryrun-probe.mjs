/**
 * FR-6 ruling-A carve-out dry-run (ceremony/20260828-uat-cutover amendment verification).
 *
 * The general v1+v2 dry-run probe (stage-keyed-data-v2-dryrun-probe.mjs) temporarily flips the
 * two real parked ventures to is_demo=true, which validates v2's SQL in isolation but BYPASSES
 * the exact path the 2026-08-28 ruling-A amendment adds: v1 applying OVER the two real ventures
 * via the id+stage+status-pinned carve-out, stamping metadata.renumber_map_applied, and v2's
 * preflight accepting exactly that stamp. This probe runs that path against LIVE data with NO
 * fixture flip, inside a single transaction that is ALWAYS rolled back — never committed.
 *
 * Steps (all in one BEGIN..ROLLBACK):
 *   NC-1 (negative control, v1 side): revive MarketLens (status='active') under a SAVEPOINT —
 *         v1's preflight MUST raise "beyond the FR-6 ruling-A carve-out" (the status pin has
 *         teeth); roll back to the savepoint.
 *   HAPPY: apply v1 — assert MarketLens 24->25 and DataDistill 26->27 AND both carry the
 *         renumber_map_applied stamp with ruling id 9e5aac51; apply v2; re-apply v1 (idempotent
 *         — the FR-6 check is first-run-gated); re-apply v2 (idempotent — stamp persists).
 *   NC-2 (negative control, v2 side): corrupt DataDistill's stamp ruling_id under a SAVEPOINT —
 *         v2's preflight MUST raise "beyond the FR-6 ruling-A carve-out"; roll back to the
 *         savepoint.
 *
 * A probe with no negative control cannot distinguish a working guard from a vacuous one.
 *
 * Re-run: node scripts/eva/stage-keyed-data-ruling-a-carveout-dryrun-probe.mjs  (from the
 * checkout whose database/chairman-gated files carry the ruling-A amendment)
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
const EVIDENCE_PATH = path.resolve(ENGINEER_ROOT, 'database/evidence/stage-keyed-data-config/v1-v2-ruling-a-carveout-dryrun.json');

const MARKETLENS = 'ecbba50e-3c98-4493-9e77-1719cf6b6f00';
const DATADISTILL = '510177ba-435f-4dd7-bfa5-6154cc8cf54b';
const RULING_ID = '9e5aac51-ff7e-424d-9003-77ce7d3c723f';
const CARVEOUT_MARKER = 'beyond the FR-6 ruling-A carve-out';

async function main() {
  const generatedAt = new Date().toISOString();
  const v1 = fs.readFileSync(V1_PATH, 'utf8');
  const v2 = fs.readFileSync(V2_PATH, 'utf8');

  const client = await createDatabaseClient('engineer', { verify: false });
  const evidence = {
    generatedAt,
    sd: 'SD-LEO-INFRA-STAGE-KEYED-DATA-001 (ruling-A amendment, ceremony/20260828-uat-cutover)',
    scenario: 'v1-v2-ruling-a-carveout-dryrun (no fixture flip; carve-out + stamp + idempotency + 2 negative controls)',
    steps: [],
  };
  let pass = false;
  try {
    await client.query('BEGIN');
    await assertInTransaction((sql, params) => client.query(sql, params));
    evidence.steps.push({ step: 'BEGIN', ok: true });

    const { rows: baseline } = await client.query(
      `SELECT id, name, current_lifecycle_stage, is_demo, status FROM public.ventures WHERE id = ANY($1::uuid[]) ORDER BY current_lifecycle_stage`,
      [[MARKETLENS, DATADISTILL]]
    );
    evidence.baseline = baseline;
    if (baseline.length !== 2 || baseline.some((r) => r.is_demo !== false || r.status !== 'cancelled')) {
      throw new Error(`baseline drift: expected the 2 ruled ventures cancelled+real, got ${JSON.stringify(baseline)}`);
    }

    // NC-1: revived venture must re-block v1 (status pin has teeth).
    await client.query('SAVEPOINT nc1');
    await client.query(`UPDATE public.ventures SET status = 'active' WHERE id = $1::uuid`, [MARKETLENS]);
    let nc1Raised = false;
    try {
      await client.query(v1);
    } catch (err) {
      nc1Raised = err.message.includes(CARVEOUT_MARKER);
      evidence.steps.push({ step: 'NC-1 v1-must-raise-on-revived-venture', ok: nc1Raised, error: err.message.slice(0, 200) });
    }
    await client.query('ROLLBACK TO SAVEPOINT nc1');
    if (!nc1Raised) throw new Error('NC-1 FAILED: v1 did not raise the carve-out preflight on a revived (status=active) ruled venture');

    // HAPPY PATH: v1 over the real ventures via the carve-out.
    await client.query(v1);
    evidence.steps.push({ step: 'apply v1 (carve-out path, no fixture flip)', ok: true });

    const { rows: shifted } = await client.query(
      `SELECT id, current_lifecycle_stage,
              metadata->'renumber_map_applied'->>'ruling_id' AS stamp_ruling,
              metadata->'renumber_map_applied'->'map' AS stamp_map
       FROM public.ventures WHERE id = ANY($1::uuid[]) ORDER BY current_lifecycle_stage`,
      [[MARKETLENS, DATADISTILL]]
    );
    evidence.postV1 = shifted;
    const ml = shifted.find((r) => r.id === MARKETLENS);
    const dd = shifted.find((r) => r.id === DATADISTILL);
    if (!ml || ml.current_lifecycle_stage !== 25 || ml.stamp_ruling !== RULING_ID) {
      throw new Error(`MarketLens post-v1 wrong: ${JSON.stringify(ml)}`);
    }
    if (!dd || dd.current_lifecycle_stage !== 27 || dd.stamp_ruling !== RULING_ID) {
      throw new Error(`DataDistill post-v1 wrong: ${JSON.stringify(dd)}`);
    }
    evidence.steps.push({ step: 'assert 24->25 / 26->27 + provenance stamp', ok: true });

    await client.query(v2);
    evidence.steps.push({ step: 'apply v2 (stamp-aware preflight accepts the 2 ruled rows)', ok: true });

    await client.query(v1);
    evidence.steps.push({ step: 'reapply v1 (idempotency; FR-6 check first-run-gated)', ok: true });

    await client.query(v2);
    evidence.steps.push({ step: 'reapply v2 (idempotency; stamp persists)', ok: true });

    // NC-2: a wrong-ruling stamp must re-block v2 (the stamp check has teeth).
    await client.query('SAVEPOINT nc2');
    await client.query(
      `UPDATE public.ventures
       SET metadata = jsonb_set(metadata, '{renumber_map_applied,ruling_id}', '"00000000-0000-0000-0000-000000000000"')
       WHERE id = $1::uuid`,
      [DATADISTILL]
    );
    let nc2Raised = false;
    try {
      await client.query(v2);
    } catch (err) {
      nc2Raised = err.message.includes(CARVEOUT_MARKER);
      evidence.steps.push({ step: 'NC-2 v2-must-raise-on-corrupted-stamp', ok: nc2Raised, error: err.message.slice(0, 200) });
    }
    await client.query('ROLLBACK TO SAVEPOINT nc2');
    if (!nc2Raised) throw new Error('NC-2 FAILED: v2 did not raise the carve-out preflight on a wrong-ruling stamp');

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
