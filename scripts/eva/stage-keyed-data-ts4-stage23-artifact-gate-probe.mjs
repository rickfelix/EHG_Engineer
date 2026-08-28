#!/usr/bin/env node
/**
 * TS-4 (SD-LEO-INFRA-STAGE-KEYED-DATA-001): proves the new dedicated-venture-UAT stage (23) is
 * NOT a hard stop via fn_stage_artifact_precondition()'s legacy_fallback path -- the exact PRD
 * scenario, distinct from the v1+v2-apply-idempotency dry-run this SD's earlier work mislabeled
 * "TS-4" (relabeled to database/evidence/stage-keyed-data-config/v1-v2-apply-idempotency-dryrun.json
 * by an adversarial VALIDATION sub-agent review during PLAN_VERIFICATION -- see that file's own
 * header for the correction note).
 *
 * WHY THIS SCENARIO MATTERS: v1's own banner flagged that the new UAT stage's required_artifacts
 * is empty by design (gate-free), but stage_artifact_requirements' STALE stage-23 row (still
 * describing launch_readiness_checklist, the OLD meaning of stage 23) would otherwise turn the
 * deliberately gate-free UAT stage into a hard stop by construction. v2 section 5 shifts that
 * table's rows 23-26 -> 24-27, which should leave stage_number=23 with zero rows and correctly
 * resolve fn_stage_artifact_precondition()'s legacy_fallback to blocked:false.
 *
 * Fixture, WITHIN a rolled-back transaction: a real venture fixture at new-scheme stage 23 must
 * be created (no live venture sits there pre-apply) using stage_write_token to satisfy the
 * canonical-writer choke trigger -- a naive INSERT/UPDATE of current_lifecycle_stage without it
 * would itself trip FR-7 false-pass mode #4 (a generic token-error read as "no violation").
 *
 * Re-run: node scripts/eva/stage-keyed-data-ts4-stage23-artifact-gate-probe.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { assertNotCommitFamily, assertInTransaction, withSavepoint, assertRowCount } from '../../lib/eva/uat-stage-migration/rollback-probe-harness.mjs';

const ENGINEER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V1_PATH = path.resolve(ENGINEER_ROOT, 'database/chairman-gated/20260825_dedicated_venture_uat_stage_insert_and_renumber.sql');
const V2_PATH = path.resolve(ENGINEER_ROOT, 'database/chairman-gated/20260828_stage_keyed_data_config_widen_v2.sql');
const EVIDENCE_PATH = path.resolve(ENGINEER_ROOT, 'database/evidence/stage-keyed-data-config/TS-4-stage23-artifact-gate.json');

async function main() {
  const generatedAt = new Date().toISOString();
  const v1 = fs.readFileSync(V1_PATH, 'utf8');
  const v2 = fs.readFileSync(V2_PATH, 'utf8');
  const client = await createDatabaseClient('engineer', { verify: false });
  const evidence = { generatedAt, sd: 'SD-LEO-INFRA-STAGE-KEYED-DATA-001', scenario: 'TS-4' };
  let pass = false;

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

    // Sanity check first: confirm v2's own shift actually vacated stage_number=23 in
    // stage_artifact_requirements -- this IS the mechanism the scenario depends on.
    const { rows: sar23 } = await client.query(
      `SELECT count(*)::int AS n FROM public.stage_artifact_requirements WHERE stage_number = 23`
    );
    evidence.stageArtifactRequirementsAtStage23Count = sar23[0].n;

    // auto_populate_venture_company_id() (unrelated to this SD) raises 42501 if company_id is
    // NULL and the connecting role isn't literally 'service_role' -- supplying any existing
    // company_id short-circuits that trigger's own auth.uid() lookup entirely (its own first
    // check: `IF NEW.company_id IS NOT NULL THEN RETURN NEW; END IF;`).
    const { rows: anyCompany } = await q(`SELECT id FROM public.companies LIMIT 1`);
    const companyId = anyCompany[0]?.id ?? null;
    evidence.companyIdUsedForFixture = companyId;

    // trg_enforce_stage0_origin (unrelated to this SD) blocks a direct INSERT that doesn't go
    // through the Stage 0 queue API, unless this session-local provisioner flag is set -- exactly
    // the documented escape hatch for fixture/test provisioning, scoped to this transaction only.
    await q(`SET LOCAL leo.stage0_bypass = 'true'`);

    // Create the venture fixture WITHIN the same rolled-back transaction, at the new UAT stage
    // (23), is_demo=true, satisfying the canonical writer choke via stage_write_token.
    const insertResult = await withSavepoint(q, 'venture_fixture', () => q(
      `INSERT INTO public.ventures (name, problem_statement, current_lifecycle_stage, is_demo, stage_write_token, company_id)
       VALUES ('TS-4 probe fixture', 'probe fixture, never committed', 23, true, 'dedicated-venture-uat-stage', $1)
       RETURNING id`,
      [companyId]
    ));
    if (!insertResult.landed) {
      throw new Error(`TS-4 FAILED: could not create the venture fixture at stage 23 (${insertResult.error?.message})`);
    }
    assertRowCount(insertResult.result, 1);
    const ventureId = insertResult.result.rows[0].id;
    evidence.ventureFixtureCreated = true;
    evidence.ventureFixtureId = ventureId;

    const { rows: precondRows } = await q(
      `SELECT public.fn_stage_artifact_precondition($1, 23) AS verdict`,
      [ventureId]
    );
    const verdict = precondRows[0].verdict;
    evidence.verdict = verdict;

    if (verdict.blocked !== false) {
      throw new Error(`TS-4 FAILED: fn_stage_artifact_precondition returned blocked=${verdict.blocked} (source=${verdict.source}, missing=${JSON.stringify(verdict.missing_artifacts)}) -- the new UAT stage should NOT be a hard stop.`);
    }
    if (verdict.source !== 'legacy_fallback') {
      throw new Error(`TS-4 FAILED: expected source='legacy_fallback' (the PRD's own named path), got '${verdict.source}'.`);
    }
    evidence.blockedFalseViaLegacyFallback = true;
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
