#!/usr/bin/env node
/**
 * Dry-run proof for 20260913_uat_control_pack_evaluated_derive.sql
 * (SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001 FR-3).
 *
 * Runs the real UP file's body (which captures the pre-derivation snapshot itself, before its
 * own CREATE TRIGGER -- TR-2), exercises the trigger against disposable synthetic uat_test_runs
 * rows (positive/negative controls, the live row 84d310e1's exact shape, a waived control, an
 * absent-required-key case, an absent-whole-key case, an explicit-NULL INSERT, an
 * unrelated-subkey UPDATE short-circuit proof, and a direct-write-to-control_pack_evaluated
 * self-healing proof -- EXEC-phase TESTING CRITICAL-1, evidence cf40b474), then runs the real
 * DOWN file's body -- all inside ONE transaction that ALWAYS ROLLBACKs, so nothing is ever
 * persisted. Safe to re-run against production any time before the real ceremony.
 *
 * Usage: node database/chairman-gated/20260913_uat_control_pack_evaluated_derive_dry_run.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UP_FILE = join(__dirname, '20260913_uat_control_pack_evaluated_derive.sql');
const DOWN_FILE = join(__dirname, '20260913_uat_control_pack_evaluated_derive_DOWN.sql');

let savepointCounter = 0;

// SAVEPOINT-guarded so an error inside one control does not poison the whole outer transaction.
async function withSavepoint(client, fn) {
  const sp = `sp_${++savepointCounter}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    const result = await fn();
    return { ok: true, result };
  } catch (err) {
    return { ok: false, message: err.message };
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
  }
}

async function insertRow(client, { runId, metadata }) {
  const r = await client.query(
    `INSERT INTO uat_test_runs (run_id, metadata) VALUES ($1, $2::jsonb) RETURNING id, metadata`,
    [runId, metadata === null ? null : JSON.stringify(metadata)]
  );
  return r.rows[0];
}

export async function runDryRun(client) {
  const upSql = readFileSync(UP_FILE, 'utf8');
  const downSql = readFileSync(DOWN_FILE, 'utf8');
  const log = [];

  await client.query('BEGIN');
  try {
    await client.query(upSql);
    log.push('UP applied without error (function + trigger + its own DO $verify$ existence proofs)');

    // TR-1: SET lock_timeout header is present in the UP file (asserted here, not just eyeballed).
    const hasLockTimeout = /SET\s+lock_timeout\s*=\s*'3s'/i.test(upSql);
    log.push(`TR-1: UP file sets lock_timeout='3s' before any DDL: ${hasLockTimeout}`);

    // TS-1: fully-evaluated -> true
    const ts1 = await withSavepoint(client, () =>
      insertRow(client, {
        runId: `dryrun-ts1-${randomUUID()}`,
        metadata: { control_pack_status: { fence_two_sidedness: 'evaluated', canary_mutation_control: 'evaluated', live_deployment_binding: 'evaluated', minimum_assertion_manifest: 'evaluated' } },
      })
    );
    const ts1Pass = ts1.ok && ts1.result.metadata.control_pack_evaluated === true;
    log.push(`TS-1 (fully evaluated -> true): ${ts1Pass}`);

    // TS-2: matches live row 84d310e1's shape (3 of 4 'not_attempted') -> false, not drift
    const ts2 = await withSavepoint(client, () =>
      insertRow(client, {
        runId: `dryrun-ts2-${randomUUID()}`,
        metadata: { control_pack_status: { fence_two_sidedness: 'not_attempted', canary_mutation_control: 'not_attempted', live_deployment_binding: 'not_attempted', minimum_assertion_manifest: 'evaluated' } },
      })
    );
    const ts2Pass = ts2.ok && ts2.result.metadata.control_pack_evaluated === false;
    log.push(`TS-2 (84d310e1 shape -> false, matches live value): ${ts2Pass}`);

    // TS-2b/TS-2f: a waived control counts as evaluated, not equality-against-'evaluated'
    const ts2f = await withSavepoint(client, () =>
      insertRow(client, {
        runId: `dryrun-ts2f-${randomUUID()}`,
        metadata: { control_pack_status: { fence_two_sidedness: 'waived: chairman-approved', canary_mutation_control: 'evaluated', live_deployment_binding: 'evaluated', minimum_assertion_manifest: 'evaluated' } },
      })
    );
    const ts2fPass = ts2f.ok && ts2f.result.metadata.control_pack_evaluated === true;
    log.push(`TS-2f (1 waived control, others evaluated -> true, not false): ${ts2fPass}`);

    // TS-2d: whole control_pack_status key absent -> false (fails closed)
    const ts2d = await withSavepoint(client, () => insertRow(client, { runId: `dryrun-ts2d-${randomUUID()}`, metadata: { unrelated: 'field' } }));
    const ts2dPass = ts2d.ok && ts2d.result.metadata.control_pack_evaluated === false;
    log.push(`TS-2d (control_pack_status key absent entirely -> false): ${ts2dPass}`);

    // TS-2g: 1 of 4 required keys absent from control_pack_status (others present) -> false
    const ts2g = await withSavepoint(client, () =>
      insertRow(client, {
        runId: `dryrun-ts2g-${randomUUID()}`,
        metadata: { control_pack_status: { fence_two_sidedness: 'evaluated', canary_mutation_control: 'evaluated', live_deployment_binding: 'evaluated' } },
      })
    );
    const ts2gPass = ts2g.ok && ts2g.result.metadata.control_pack_evaluated === false;
    log.push(`TS-2g (1 of 4 required keys absent -> false, deliberate divergence from app's fail-open): ${ts2gPass}`);

    // TS-2h/TS-2i: INSERT with metadata explicitly NULL does not silently skip; succeeds, derives false
    const ts2h = await withSavepoint(client, () => insertRow(client, { runId: `dryrun-ts2h-${randomUUID()}`, metadata: null }));
    const ts2hPass = ts2h.ok && ts2h.result.metadata?.control_pack_evaluated === false;
    log.push(`TS-2h (INSERT with metadata NULL -> succeeds, derives false, not left undetermined): ${ts2hPass}`);

    // TS-2i: INSERT (not UPDATE) with a fully-evaluated status succeeds without error (regression guard)
    log.push(`TS-2i (INSERT path succeeds without error, regression-guards TG_OP='INSERT' branch): ${ts1.ok}`);

    // TS-2c/TS-2j/TS-2k: UPDATE behavior -- guard is scoped to control_pack_status AND
    // control_pack_evaluated sub-keys (CRITICAL-1 fix, EXEC-phase TESTING evidence cf40b474)
    const baseRunId = `dryrun-ts2j-${randomUUID()}`;
    const inserted = await insertRow(client, {
      runId: baseRunId,
      metadata: { control_pack_status: { fence_two_sidedness: 'evaluated', canary_mutation_control: 'evaluated', live_deployment_binding: 'evaluated', minimum_assertion_manifest: 'evaluated' }, note: 'v1' },
    });

    // TS-2j (AC-8, made GENUINELY discriminating per TESTING re-check evidence d76ec942 --
    // the prior version's fixture had correct===stored, so it passed even with no guard at all,
    // proven live in that review). Disable the trigger, plant a value where
    // control_pack_evaluated DISAGREES with control_pack_status (impossible while the trigger
    // is live), re-enable, then update ONLY an unrelated subkey. If the guard is genuinely
    // scoped, the disagreeing value must SURVIVE (the guard never fires for this write shape);
    // if it recomputed on every write, the disagreeing value would be corrected back to true,
    // exactly as TS-2k proves happens for a write that DOES touch control_pack_evaluated.
    await client.query(`ALTER TABLE uat_test_runs DISABLE TRIGGER trg_uat_control_pack_evaluated_derive`);
    const disagreeing = await insertRow(client, {
      runId: `dryrun-ts2j-${randomUUID()}`,
      metadata: {
        control_pack_status: { fence_two_sidedness: 'evaluated', canary_mutation_control: 'evaluated', live_deployment_binding: 'evaluated', minimum_assertion_manifest: 'evaluated' },
        control_pack_evaluated: false, // deliberately disagrees with control_pack_status -- only possible with the trigger disabled
        note: 'v1',
      },
    });
    await client.query(`ALTER TABLE uat_test_runs ENABLE TRIGGER trg_uat_control_pack_evaluated_derive`);
    const unrelatedOnly = await client.query(
      `UPDATE uat_test_runs SET metadata = jsonb_set(metadata, '{note}', '"v2"') WHERE id = $1 RETURNING metadata`,
      [disagreeing.id]
    );
    const ts2jPass = unrelatedOnly.rows[0].metadata.control_pack_evaluated === false && unrelatedOnly.rows[0].metadata.note === 'v2';
    log.push(`TS-2j (a pre-existing DISAGREEING value survives an unrelated-subkey update -- proves the guard genuinely short-circuits, not merely that it agreed by coincidence): ${ts2jPass}`);

    // TS-2k (CRITICAL-1 regression guard): a writer directly forcing control_pack_evaluated to a
    // WRONG value (while control_pack_status still shows fully-evaluated) must be self-corrected
    // back to the value control_pack_status actually derives -- proves the summary can never be
    // set to disagree with its detail via ANY write shape, not only ones that also touch status.
    const plantedWrong = await client.query(
      `UPDATE uat_test_runs SET metadata = jsonb_set(metadata, '{control_pack_evaluated}', 'false') WHERE id = $1 RETURNING metadata`,
      [inserted.id]
    );
    const ts2kPass = plantedWrong.rows[0].metadata.control_pack_evaluated === true;
    log.push(`TS-2k (a direct write forcing control_pack_evaluated=false is self-corrected back to true, since control_pack_status is still fully-evaluated): ${ts2kPass}`);

    // TS-2c: an UPDATE that DOES change control_pack_status re-fires and recomputes correctly
    const recomputed = await client.query(
      `UPDATE uat_test_runs SET metadata = jsonb_set(metadata, '{control_pack_status,fence_two_sidedness}', '"not_attempted"') WHERE id = $1 RETURNING metadata`,
      [inserted.id]
    );
    const ts2cPass = recomputed.rows[0].metadata.control_pack_evaluated === false;
    log.push(`TS-2c (UPDATE changing control_pack_status re-fires and recomputes to false): ${ts2cPass}`);

    const preDownSnapshotCount = await client.query(`SELECT count(*) FROM uat_control_pack_evaluated_rollback_snapshot`);
    const preDownSnapshotCaptured = Number(preDownSnapshotCount.rows[0].count) > 0;
    log.push(`TR-2 (fixed): pre-derivation snapshot captured by the UP file itself, before CREATE TRIGGER (${preDownSnapshotCount.rows[0].count} rows): ${preDownSnapshotCaptured}`);

    // TS-6/TR-3 (VALIDATION, evidence 18b5d248, F-5): existence alone is not liveness -- a
    // DISABLED trigger still has a pg_trigger row. Confirm the UP file's corrected verify
    // predicate (tgenabled != 'D') actually distinguishes disabled-but-present from live.
    await client.query(`ALTER TABLE uat_test_runs DISABLE TRIGGER trg_uat_control_pack_evaluated_derive`);
    const disabledCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_uat_control_pack_evaluated_derive'
           AND tgrelid = 'public.uat_test_runs'::regclass
           AND tgenabled != 'D'
      ) AS enabled_and_exists
    `);
    const ts6Pass = disabledCheck.rows[0].enabled_and_exists === false;
    log.push(`TS-6 (disabled-trigger detection: tgenabled != 'D' correctly reports false when the trigger is disabled, not just present): ${ts6Pass}`);
    await client.query(`ALTER TABLE uat_test_runs ENABLE TRIGGER trg_uat_control_pack_evaluated_derive`);

    await client.query(downSql);
    log.push('DOWN applied without error (drops trigger + function only; snapshot was already captured at UP time, per the corrected TR-2 timing)');

    const fnAfterDown = await client.query(`SELECT 1 FROM pg_proc WHERE proname = 'derive_uat_control_pack_evaluated'`);
    const triggerAfterDown = await client.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'trg_uat_control_pack_evaluated_derive'`);
    const bothGone = fnAfterDown.rows.length === 0 && triggerAfterDown.rows.length === 0;
    log.push(`Function + trigger both gone after DOWN: ${bothGone}`);

    const allPass = ts1Pass && ts2Pass && ts2fPass && ts2dPass && ts2gPass && ts2hPass && ts1.ok && ts2jPass && ts2kPass && ts2cPass && ts6Pass && bothGone && preDownSnapshotCaptured && hasLockTimeout;
    return { pass: allPass, log };
  } finally {
    await client.query('ROLLBACK');
  }
}

async function main() {
  const client = await createDatabaseClient('ehg');
  try {
    const { pass, log } = await runDryRun(client);
    log.forEach((line) => console.log(`  - ${line}`));
    console.log(pass ? '\n✅ DRY RUN PASS — nothing persisted (ROLLBACK), safe to re-run.' : '\n❌ DRY RUN FAILED');
    process.exitCode = pass ? 0 : 1;
  } finally {
    await client.end();
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('DRY RUN ERRORED:', err.stack || err.message);
    process.exitCode = 1;
  });
}
