// Acceptance script for 20260816_plan_critiques_add_metadata_and_content_hash.sql
// SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001 — TR-3 (staged for ceremony N+1 per
// COORDINATOR RULING 9e51c5ae — auto-mode classifier denied the direct worker apply).
//
// Small catalog-only readback: two ADD COLUMN IF NOT EXISTS statements, nothing to lint (no RLS
// predicate, no policy text) — the only thing worth verifying is that both columns exist with the
// declared types, and that partial application (one column present, the other missing) never goes
// unnoticed. Reads via the pooler (information_schema is not guaranteed exposed over PostgREST for
// this project's config; the direct client is the precedented choice in this directory).
//
// Usage: node database/chairman-gated/20260816_plan_critiques_add_metadata_and_content_hash_acceptance.mjs
// Run BEFORE apply (expect NEITHER column) and AFTER apply (expect BOTH, correctly typed).
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

const TABLE = 'plan_critiques';
const EXPECTED = { metadata: 'jsonb', content_hash: 'text' };

let exitCode = 0;

console.log(`=== Catalog readback: ${TABLE}.{metadata, content_hash} ===`);
const client = await createDatabaseClient('engineer', { verify: false });
try {
  const { rows } = await client.query(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2::text[])`,
    [TABLE, Object.keys(EXPECTED)]
  );
  const found = Object.fromEntries(rows.map((r) => [r.column_name, r.data_type]));
  const presentCount = Object.keys(EXPECTED).filter((c) => found[c]).length;

  if (presentCount === 0) {
    console.log('  → NEITHER column present. Matches the expected PRE-APPLY baseline.');
  } else if (presentCount === Object.keys(EXPECTED).length) {
    console.log('  → BOTH columns present. Checking declared types...');
    for (const [col, expectedType] of Object.entries(EXPECTED)) {
      const actualType = found[col];
      if (actualType === expectedType) {
        console.log(`    ✅ ${col}: ${actualType}`);
      } else {
        console.log(`    ❌ ${col}: expected ${expectedType}, found ${actualType}`);
        exitCode = 1;
      }
    }
    if (exitCode === 0) console.log('  → Matches the expected POST-APPLY state.');
  } else {
    console.log(`  ❌ PARTIAL state: ${presentCount}/${Object.keys(EXPECTED).length} columns present (${JSON.stringify(found)}). The migration is not a single transaction boundary a reader should ever observe half-applied — investigate before proceeding.`);
    exitCode = 1;
  }
} finally {
  await client.end();
}

console.log(`\n=== ${exitCode === 0 ? 'PASS' : 'FAIL'} ===`);
process.exitCode = exitCode;
