#!/usr/bin/env node
/**
 * Dry-run proof for 20260912_venture_channel_publish_ledger_outbound_gate_trigger.sql
 * (SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-5).
 *
 * Runs the real UP file's body, then exercises the trigger against 2 disposable synthetic
 * ventures (positive control, negative control) plus one unresolvable venture id, proves a
 * chairman_decisions row can never bypass this trigger (SECURITY finding SEC-H2 -- the trigger
 * has no override arm of its own, deliberately), then runs the real DOWN file's body -- all
 * inside ONE transaction that ALWAYS ROLLBACKs, so nothing is ever persisted. Safe to re-run
 * against production any time before the real ceremony.
 *
 * `ventures` carries a dozen+ unrelated business-rule triggers (company-access auto-populate,
 * the stage-write-token canonical-writer choke, the launch-mode-audit-ticket flip guard, etc.)
 * that have nothing to do with the trigger THIS proof exercises (on venture_channel_publish_
 * ledger, a different table entirely). Building the synthetic fixture ventures under
 * session_replication_role='replica' bypasses all of them for fixture setup only -- the trigger
 * under test is re-armed (session_replication_role='origin') before any of the real
 * insert-attempt assertions run, so it is exercised at full strength.
 *
 * Usage: node database/chairman-gated/20260912_venture_channel_publish_ledger_outbound_gate_trigger_dry_run.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UP_FILE = join(__dirname, '20260912_venture_channel_publish_ledger_outbound_gate_trigger.sql');
const DOWN_FILE = join(__dirname, '20260912_venture_channel_publish_ledger_outbound_gate_trigger_DOWN.sql');

let savepointCounter = 0;

// SAVEPOINT-guarded: an expected-rejection INSERT otherwise poisons the whole outer
// transaction (any error, even one caught here, aborts every subsequent statement).
async function attemptInsert(client, { ventureId, channelType, contentRef }) {
  const sp = `sp_${++savepointCounter}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await client.query(
      `INSERT INTO venture_channel_publish_ledger (venture_id, channel_type, content_ref, correlation_id, decision, outcome)
       VALUES ($1, $2, $3, $4, 'pending', 'unknown')`,
      [ventureId, channelType, contentRef, `${ventureId}:${contentRef}:${channelType}:dryrun`]
    );
    return { rejected: false };
  } catch (err) {
    return { rejected: true, message: err.message };
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
  }
}

async function insertFixtureVenture(client, { id, stage, launchMode, status, isDemo = false }) {
  await client.query(
    `INSERT INTO ventures (id, name, problem_statement, is_demo, status, current_lifecycle_stage, launch_mode)
     VALUES ($1, $2, 'dry-run fixture, rolled back', $3, $4, $5, $6)`,
    [id, `dry-run-fixture-${id}`, isDemo, status, stage, launchMode]
  );
}

export async function runDryRun(client) {
  const upSql = readFileSync(UP_FILE, 'utf8');
  const downSql = readFileSync(DOWN_FILE, 'utf8');
  const log = [];
  const channelType = 'x';

  const authorizedVentureId = randomUUID();
  const belowGoLiveVentureId = randomUUID();

  await client.query('BEGIN');
  try {
    await client.query(upSql);
    log.push('UP applied without error (function + trigger + its own DO $verify$ existence proofs)');

    // Build synthetic fixture ventures with the dozen+ unrelated ventures-table governance
    // triggers bypassed (this proof is not exercising those) -- re-armed immediately after.
    await client.query(`SET LOCAL session_replication_role = 'replica'`);
    await insertFixtureVenture(client, { id: authorizedVentureId, stage: 25, launchMode: 'live', status: 'active' });
    await insertFixtureVenture(client, { id: belowGoLiveVentureId, stage: 5, launchMode: 'simulated', status: 'active' });
    await client.query(`SET LOCAL session_replication_role = 'origin'`);
    log.push('2 disposable synthetic fixture ventures inserted; the trigger under test is re-armed (origin mode)');

    // Positive control: fully-authorized venture -> insert succeeds.
    const posResult = await attemptInsert(client, { ventureId: authorizedVentureId, channelType, contentRef: 'content-a' });
    log.push(`Positive control (authorized venture) insert succeeds: ${!posResult.rejected}`);

    // Negative control: below-go-live venture -> insert rejected via the intended exception.
    const negResult = await attemptInsert(client, { ventureId: belowGoLiveVentureId, channelType, contentRef: 'content-b' });
    const negIsIntendedRejection = negResult.rejected && /OUTBOUND_GATE_REJECTED/.test(negResult.message);
    log.push(`Negative control (below-go-live venture) insert rejected via the intended OUTBOUND_GATE_REJECTED exception: ${negIsIntendedRejection} (${negResult.message.split('\n')[0]})`);

    // SECURITY finding SEC-H2 regression control: even with a chairman_decisions row present
    // (any shape, any consumed_at/undo_deadline value) for this exact venture/channel/content,
    // the below-go-live insert must STILL be rejected -- this trigger has no override arm at
    // all, by design, so a chairman_decisions row can never license a bypass here regardless
    // of its own schema/semantics. (override_key does not exist in the live schema yet, so this
    // uses only columns that already exist -- consumed_at/undo_deadline/lifecycle_stage.)
    await client.query(
      `INSERT INTO chairman_decisions (venture_id, decision_type, consumed_at, undo_deadline, decision, lifecycle_stage)
       VALUES ($1, 'stage_gate_override', now(), now() + interval '1 hour', 'override', 5)`,
      [belowGoLiveVentureId]
    );
    const noBypassResult = await attemptInsert(client, { ventureId: belowGoLiveVentureId, channelType, contentRef: 'content-c' });
    const noBypassConfirmed = noBypassResult.rejected && /OUTBOUND_GATE_REJECTED/.test(noBypassResult.message);
    log.push(`SEC-H2 regression control (a chairman_decisions row present for this venture does NOT bypass the trigger): ${noBypassConfirmed}`);

    // Unresolvable venture -> insert rejected.
    const ghostResult = await attemptInsert(client, { ventureId: randomUUID(), channelType, contentRef: 'content-d' });
    const ghostIsIntendedRejection = ghostResult.rejected && /does not resolve/.test(ghostResult.message);
    log.push(`Unresolvable-venture control insert rejected via the intended exception: ${ghostIsIntendedRejection}`);

    await client.query(downSql);
    log.push('DOWN applied without error');

    const fnAfterDown = await client.query(
      `SELECT 1 FROM pg_proc WHERE proname = 'check_venture_channel_publish_ledger_outbound_gate'`
    );
    const triggerAfterDown = await client.query(
      `SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venture_channel_publish_ledger_outbound_gate'`
    );
    const bothGone = fnAfterDown.rows.length === 0 && triggerAfterDown.rows.length === 0;
    log.push(`Function + trigger both gone after DOWN: ${bothGone}`);

    const allPass = !posResult.rejected && negIsIntendedRejection && noBypassConfirmed && ghostIsIntendedRejection && bothGone;
    return { pass: allPass, log };
  } finally {
    await client.query('ROLLBACK');
  }
}

async function main() {
  const client = await createDatabaseClient('engineer');
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
