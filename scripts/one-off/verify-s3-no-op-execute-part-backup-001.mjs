// SD-ALTIFYAI-LEO-GEN-EXECUTE-PART-BACKUP-001 (FR-1) -- S3 no-op verification, incident ba330d67
// Part B restore ceremony.
//
// Solomon's binding SET-ARITHMETIC spec: S3 = the 21 in-window creations
// [2026-08-21T06:27:40Z, 2026-08-21T14:06:00Z) UTC. Ids are PINNED IN SCRIPT (never queried live
// for membership -- only their per-id current state is read live), verify-null-against-clobber
// -signature, expected result is a no-op (these rows were created during the incident window but
// were never touched by the decision_by-truncating write, so their decision_by should still read
// null today, exactly as it did when the manifest was built).
//
// READ-ONLY. Every statement this script issues is classified via
// scripts/dr/restore-rehearsal-core.mjs's classifyStatement before execution (verbatim reuse of
// Part A's -- SD-LEO-GEN-STAGE-DECISION-RESTORE-001 -- safety contract); a 'forbidden'
// classification throws before reaching the DB.
//
// Usage: node scripts/one-off/verify-s3-no-op-execute-part-backup-001.mjs
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { classifyStatement, makeAuditedExecutor, scratchSchemaName } from '../dr/restore-rehearsal-core.mjs';

// PINNED, per the coordinator's binding spec -- never re-derived from a live range query.
export const S3_PINNED_IDS = [
  'd402fc21-d34e-4a5f-b6d7-554bfbb8ca55',
  '0be7e5a8-6ced-453c-9e81-01736eb9ae34',
  'c3f021dd-19c0-452a-988a-f24a4aefa937',
  '26ce3491-9c6f-4b2e-83c8-47f72fe5eaef',
  '26163768-52fa-4d8e-bc7c-ea63616fee82',
  'd39e1836-b402-42e2-8095-44dfb9e8cd71',
  '2298ade6-39a8-48bf-8947-cf72283f822e',
  '89b4dee4-492c-422d-bc92-4dec226d000b',
  'c4e8fceb-32bf-4aaf-8e26-c54031a94667',
  '1a68b844-24b4-412f-a6b7-42b794842e3a',
  'c5c101e6-b8aa-488a-9e30-6c207cbe3504',
  'b7fbde18-f9b5-4ace-b038-ddfe0582c968',
  '1127819e-1d48-411f-8f0d-7191a1013312',
  'e7d48740-fdc6-4c3a-adc6-cf3a414b0595',
  '8ba48d41-3483-4d9f-99c4-5c7fa3a3a92a',
  '1119d98d-639e-45b3-b5f8-838a75e68768',
  '08408602-2dad-44ae-a98c-2c0237cb2ff7',
  '42dcfffe-0796-45ee-95b8-9bcc013e265d',
  'f37bbbee-c455-4e02-8e13-5267c03b4da1',
  '18d2ddbc-811b-4761-af1c-88d01d20e6ff',
  '9868ed7a-ad25-45f5-a61c-e7f107944da1',
];

/**
 * Pure: classify the live read-back rows against the expected no-op (decision_by === null).
 * @param {Array<{id: string, decision_by: string|null}>} rows - live read-back, may be a subset if an id is missing
 * @param {string[]} pinnedIds - the full pinned id list (used to detect any id missing from `rows`)
 * @returns {{noOpConfirmed: string[], clobbered: object[], missing: string[]}}
 */
export function classifyS3Result(rows, pinnedIds) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const noOpConfirmed = [];
  const clobbered = [];
  const missing = [];
  for (const id of pinnedIds) {
    const row = byId.get(id);
    if (!row) {
      missing.push(id);
      continue;
    }
    if (row.decision_by === null) {
      noOpConfirmed.push(id);
    } else {
      clobbered.push({ id, decision_by: row.decision_by });
    }
  }
  return { noOpConfirmed, clobbered, missing };
}

async function readS3Rows(client, ids) {
  const scratchSchema = scratchSchemaName();
  const auditLog = [];
  const executor = makeAuditedExecutor(client, scratchSchema, auditLog);
  const sql = `SELECT id, decision_by FROM public.solomon_advice_outcome_ledger WHERE id = ANY($1::uuid[])`;
  const classification = classifyStatement(sql, scratchSchema);
  if (classification !== 'read') {
    throw new Error(`SAFETY: S3 verification query classified as '${classification}', expected 'read' -- refusing to execute`);
  }
  const { rows } = await executor(sql, [ids]);
  return rows;
}

export async function verifyS3({ client = null, ids = S3_PINNED_IDS } = {}) {
  if (!client) return { noOpConfirmed: [], clobbered: [], missing: [...ids], skipped: true };
  const rows = await readS3Rows(client, ids);
  return { ...classifyS3Result(rows, ids), skipped: false };
}

function printReport(result) {
  console.log('=== S3 no-op verification -- incident ba330d67, Part B ===');
  console.log(`Pinned ids: ${S3_PINNED_IDS.length}`);
  console.log(`No-op confirmed (decision_by still null): ${result.noOpConfirmed.length}`);
  if (result.clobbered.length > 0) {
    console.log(`\n*** ANOMALY -- ${result.clobbered.length} id(s) NOT null (genuine incident, not silently absorbed) ***`);
    for (const c of result.clobbered) console.log(`  ${c.id}: decision_by=${JSON.stringify(c.decision_by)}`);
  }
  if (result.missing.length > 0) {
    console.log(`\n*** ${result.missing.length} pinned id(s) not found live (row deleted?) ***`);
    for (const id of result.missing) console.log(`  ${id}`);
  }
  const allGood = result.clobbered.length === 0 && result.missing.length === 0 && result.noOpConfirmed.length === S3_PINNED_IDS.length;
  console.log(`\nResult: ${allGood ? 'PASS -- expected no-op confirmed for all 21 pinned ids' : 'FAIL -- see anomalies above'}`);
  return allGood;
}

async function main() {
  const client = await createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
  });
  try {
    const result = await verifyS3({ client });
    const pass = printReport(result);
    process.exitCode = pass ? 0 : 1;
  } finally {
    await client.end();
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
