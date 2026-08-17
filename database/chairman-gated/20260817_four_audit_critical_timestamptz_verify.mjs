#!/usr/bin/env node
/**
 * SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001 FR-2 — information_schema.columns pre/post verification
 * for 20260817_four_audit_critical_timestamptz.sql.
 *
 * READ-ONLY (SELECT against information_schema.columns only) -- cannot apply the migration.
 * Mirrors scripts/db-validate/schema-validator.js's getColumns() reader and uses the canonical
 * pooler connection helper createDatabaseClient('engineer') -- NOT a hand-rolled pg.Client (a
 * hand-rolled connection to SUPABASE_POOLER_URL is confirmed credential-broken in this
 * environment; PLAN VALIDATION evidence 5dcada29).
 *
 * Modes:
 *   --baseline   Capture live pre-apply state, assert 15 target columns are naive and the 6
 *                sibling negative-control columns are already aware. Writes JSON to
 *                .artifacts/four-audit-critical-timestamptz-baseline.json.
 *   --verify     Re-read live state, compare against the saved baseline: all 15 target columns
 *                must now be aware; all 6 sibling columns must be unchanged from baseline.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = `${__dirname}/../../.artifacts/four-audit-critical-timestamptz-baseline.json`;

const TARGET_COLUMNS = [
  ['quick_fixes', 'completed_at'],
  ['quick_fixes', 'created_at'],
  ['quick_fixes', 'started_at'],
  ['sd_phase_handoffs', 'accepted_at'],
  ['sd_phase_handoffs', 'created_at'],
  ['sd_phase_handoffs', 'rejected_at'],
  ['strategic_directives_v2', 'approval_date'],
  ['strategic_directives_v2', 'archived_at'],
  ['strategic_directives_v2', 'created_at'],
  ['strategic_directives_v2', 'effective_date'],
  ['strategic_directives_v2', 'expiry_date'],
  ['strategic_directives_v2', 'updated_at'],
  ['user_stories', 'completed_at'],
  ['user_stories', 'created_at'],
  ['user_stories', 'updated_at'],
];

// Negative control: already-aware siblings on the same 4 tables. Must remain
// 'timestamp with time zone' at every checkpoint -- a change here signals scope creep.
const SIBLING_COLUMNS = [
  ['sd_phase_handoffs', 'resolved_at'],
  ['strategic_directives_v2', 'completion_date'],
  ['strategic_directives_v2', 'embedding_generated_at'],
  ['strategic_directives_v2', 'quality_checked_at'],
  ['quick_fixes', 'not_before'],
  ['user_stories', 'e2e_test_last_run'],
];

/**
 * Pure function: fetch data_type for a list of [table, column] pairs via a single
 * information_schema.columns query. Exported for unit testing against a fixture client.
 */
export async function readColumnTypes(client, pairs) {
  const result = await client.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const byKey = new Map(result.rows.map(r => [`${r.table_name}.${r.column_name}`, r.data_type]));
  const out = {};
  for (const [table, column] of pairs) {
    out[`${table}.${column}`] = byKey.get(`${table}.${column}`) ?? null;
  }
  return out;
}

/** Pure function: verdict for a captured snapshot against the expected pre/post state. */
export function evaluateSnapshot(snapshot, { targetExpected, siblingExpected }) {
  const issues = [];
  for (const [table, column] of TARGET_COLUMNS) {
    const key = `${table}.${column}`;
    if (snapshot.target[key] !== targetExpected) {
      issues.push(`${key}: expected '${targetExpected}', got '${snapshot.target[key]}'`);
    }
  }
  for (const [table, column] of SIBLING_COLUMNS) {
    const key = `${table}.${column}`;
    if (snapshot.sibling[key] !== siblingExpected) {
      issues.push(`SIBLING ${key} (negative control): expected '${siblingExpected}', got '${snapshot.sibling[key]}'`);
    }
  }
  return { pass: issues.length === 0, issues };
}

async function captureSnapshot(client) {
  const target = await readColumnTypes(client, TARGET_COLUMNS);
  const sibling = await readColumnTypes(client, SIBLING_COLUMNS);
  return { capturedAt: new Date().toISOString(), target, sibling };
}

async function runBaseline() {
  const client = await createDatabaseClient('engineer', { verify: false });
  try {
    const snapshot = await captureSnapshot(client);
    const verdict = evaluateSnapshot(snapshot, {
      targetExpected: 'timestamp without time zone',
      siblingExpected: 'timestamp with time zone',
    });
    mkdirSync(`${__dirname}/../../.artifacts`, { recursive: true });
    writeFileSync(BASELINE_PATH, JSON.stringify(snapshot, null, 2));
    console.log('BASELINE_SNAPSHOT_WRITTEN', BASELINE_PATH);
    console.log(JSON.stringify({ mode: 'baseline', pass: verdict.pass, issues: verdict.issues }, null, 2));
    if (!verdict.pass) process.exit(1);
  } finally {
    await client.end();
  }
}

async function runVerify() {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  const client = await createDatabaseClient('engineer', { verify: false });
  try {
    const snapshot = await captureSnapshot(client);
    const verdict = evaluateSnapshot(snapshot, {
      targetExpected: 'timestamp with time zone',
      siblingExpected: 'timestamp with time zone',
    });
    // Sibling columns must additionally match the baseline exactly (not just "aware") --
    // catches any drift outside the 15-column target set during the transition window.
    const siblingDrift = SIBLING_COLUMNS
      .map(([t, c]) => `${t}.${c}`)
      .filter(key => baseline.sibling[key] !== snapshot.sibling[key]);
    const issues = [...verdict.issues, ...siblingDrift.map(k => `SIBLING DRIFT vs baseline: ${k}`)];
    console.log(JSON.stringify({ mode: 'verify', pass: issues.length === 0, issues }, null, 2));
    if (issues.length > 0) process.exit(1);
  } finally {
    await client.end();
  }
}

if (isMainModule(import.meta.url)) {
  const mode = process.argv.includes('--verify') ? 'verify' : process.argv.includes('--baseline') ? 'baseline' : null;
  if (!mode) {
    console.error('Usage: node 20260817_four_audit_critical_timestamptz_verify.mjs --baseline|--verify');
    process.exit(2);
  }
  if (mode === 'baseline') await runBaseline();
  else await runVerify();
}
