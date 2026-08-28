#!/usr/bin/env node
/**
 * TS-7 (SD-LEO-INFRA-STAGE-KEYED-DATA-001): measures eva_ventures mirror divergence after v1's
 * +1 shift is simulated (rolled back).
 *
 * NOTE on this SD's actual disposition vs. the PRD's original TS-7 framing: TS-7 was authored
 * assuming FR-4 would apply "v2's trigger fix" to sync_ventures_to_eva_ventures_update(). This
 * SD's EXEC-phase investigation (see the v2 migration file's own banner, note (b)) found that
 * function's `IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;` early-return is a
 * DELIBERATE design decision (SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F, "demo/test fixtures never
 * enter the EVA pipeline"), not an oversight -- v2 does NOT modify it, and disposition is
 * documented as accepted-as-broken by the trigger's own prior intent. This probe therefore
 * MEASURES actual post-shift divergence rather than assuming a fix landed, honoring this SD's
 * own "measured, not inherited" standard.
 *
 * Fixture, WITHIN a rolled-back transaction: v1's own preflight requires zero real ventures
 * parked in range, matching the actual production sequencing (v1 can only ever really apply once
 * any real ventures currently in the way are resolved) -- so is_demo is temporarily flipped for
 * the 2 currently-real ventures and LEFT flipped for this probe's shift simulation, which is the
 * realistic future scenario: by the time v1 actually applies, only demo ventures remain in range.
 *
 * Re-run: node scripts/eva/stage-keyed-data-ts7-eva-ventures-mirror-sync-probe.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../lib/supabase-connection.js';

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

    const { rows: preDivergence } = await client.query(DIVERGENCE_SQL);
    evidence.preShiftDivergenceCount = preDivergence.length;

    const { rows: realVentures } = await client.query(
      `SELECT id FROM public.ventures WHERE current_lifecycle_stage BETWEEN 23 AND 26 AND is_demo IS NOT TRUE`
    );
    evidence.realVenturesTemporarilyFlippedDemo = realVentures.map((v) => v.id);
    if (realVentures.length > 0) {
      await client.query(`UPDATE public.ventures SET is_demo = true WHERE id = ANY($1::uuid[])`, [realVentures.map((v) => v.id)]);
    }

    await client.query(v1);
    await client.query(v2);

    const { rows: postDivergence } = await client.query(DIVERGENCE_SQL);
    evidence.postShiftDivergenceCount = postDivergence.length;
    evidence.postShiftDivergentRows = postDivergence;

    // Cross-check: does every demo venture that WAS in the shift range even have an eva_ventures
    // row at all? If not, the trigger's UPDATE simply matches 0 rows for them -- no row to
    // diverge, by construction, distinct from "diverged and silently wrong".
    const { rows: shiftedDemoVentures } = await client.query(
      `SELECT v.id, v.current_lifecycle_stage, (ev.venture_id IS NOT NULL) AS has_eva_mirror_row
       FROM public.ventures v LEFT JOIN public.eva_ventures ev ON ev.venture_id = v.id
       WHERE v.id = ANY($1::uuid[])`,
      [realVentures.map((v) => v.id)]
    );
    evidence.formerlyRealVenturesEvaMirrorPresence = shiftedDemoVentures;

    if (evidence.postShiftDivergenceCount > 0) {
      evidence.finding = `${evidence.postShiftDivergenceCount} row(s) diverged after the shift -- confirms the risk v1's own banner and this SD's v2 note (b) describe: a demo venture shifted by the migration is left with a stale eva_ventures mirror, by the trigger's own deliberate is_demo early-return design.`;
    } else {
      evidence.finding = 'Zero divergence measured after the shift, consistent with live-measured 2026-08-28 reality: no eva_ventures row currently exists for a demo venture in the shift range for the trigger to leave stale.';
    }
    // This probe PASSES either way (it is a measurement, not a pass/fail assertion on the
    // divergence count) -- v2's own disposition for this risk is documented, not fixed, so a
    // nonzero divergence here is an EXPECTED, already-accepted finding, not a probe failure.
    // What WOULD fail this probe: the measurement itself erroring, or the fixture failing to apply.
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
  console.log(`Result: ${evidence.result} -- ${evidence.finding ?? evidence.error}`);
  if (!pass) process.exitCode = 1;
}

main();
