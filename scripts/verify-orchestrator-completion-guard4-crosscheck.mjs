#!/usr/bin/env node
/**
 * FR-3 guard-4 cross-check verifier — SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-LANES-001.
 *
 * Pins lib/fleet/orchestrator-completion.cjs's TERMINAL_CHILD_STATUSES against the LIVE
 * complete_orchestrator_sd() function's guard-4 status set, read directly via pg_get_functiondef().
 *
 * WHY A STANDALONE SCRIPT, NOT A vitest .db.test.js: complete_orchestrator_sd() exists only in the
 * one production database (dedlbzhpgkmetvhbkyzq) — there is no non-production replica with the same
 * schema to point a gated db-tier test at. tests/helpers/db-tier-gate.js deliberately refuses ALL
 * raw-pg network connections in the vitest db project unless VITEST_DB_ALLOW_REF names a designated
 * NON-production ref ("Never name production" — by design, see vitest.config.js). Forcing this check
 * into that project would make it either permanently blocked (useless) or require weakening a
 * safety fence that exists for good reason. This mirrors the existing precedent
 * (scripts/verify-migration-apply-state.mjs) for read-only, manually-invoked production-catalog
 * verification that lives outside the vitest safety fence entirely.
 *
 * READ-ONLY. Never writes, never applies anything.
 *
 * WHY THIS MATTERS (TR-1 of this SD): a prior LEAD pass on this SD misread guard 4's status set
 * from a STALE MIGRATION FILE instead of the live deployed function, and produced a wrong
 * root-cause conclusion as a direct result. The JS mirror in orchestrator-completion.cjs is
 * deliberately a duplicated literal, not a shared call into the SQL (Postgres functions cannot be
 * invoked as a JS predicate) — this script is what catches that duplication silently drifting.
 *
 * Usage:
 *   node scripts/verify-orchestrator-completion-guard4-crosscheck.mjs             # human report
 *   node scripts/verify-orchestrator-completion-guard4-crosscheck.mjs --json      # machine-readable
 *
 * Exit codes: 0 = match (or --json always exits 0, inspect .outcome); 1 = mismatch or DB error.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from './lib/supabase-connection.js';
import { extractGuard4StatusSet } from '../lib/fleet/orchestrator-completion-guard4-extract.cjs';
import { TERMINAL_CHILD_STATUSES } from '../lib/fleet/orchestrator-completion.cjs';

export const OUTCOME = {
  MATCH: 'GUARD4_CROSSCHECK_MATCH',
  MISMATCH: 'GUARD4_CROSSCHECK_MISMATCH',
  DB_ERROR: 'GUARD4_CROSSCHECK_DB_ERROR',
  FUNCTION_NOT_FOUND: 'GUARD4_CROSSCHECK_FUNCTION_NOT_FOUND',
  EXTRACTION_FAILED: 'GUARD4_CROSSCHECK_EXTRACTION_FAILED',
};

export async function runCrosscheck() {
  let client;
  try {
    client = await createDatabaseClient();
  } catch (e) {
    return { outcome: OUTCOME.DB_ERROR, message: `Could not connect to the database: ${e.message}` };
  }
  try {
    const r = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1 AND p.proname = $2
        LIMIT 1`,
      ['public', 'complete_orchestrator_sd']
    );
    if (!r.rows.length) {
      return { outcome: OUTCOME.FUNCTION_NOT_FOUND, message: 'complete_orchestrator_sd not found in public schema' };
    }
    const functionDef = r.rows[0].def;
    let live;
    try {
      live = extractGuard4StatusSet(functionDef);
    } catch (e) {
      return { outcome: OUTCOME.EXTRACTION_FAILED, message: e.message, functionDef };
    }
    const mirrored = [...TERMINAL_CHILD_STATUSES].sort();
    const matches = JSON.stringify(live) === JSON.stringify(mirrored);
    return {
      outcome: matches ? OUTCOME.MATCH : OUTCOME.MISMATCH,
      live,
      mirrored,
      message: matches
        ? 'lib/fleet/orchestrator-completion.cjs TERMINAL_CHILD_STATUSES matches the live guard-4 status set'
        : `MISMATCH: live guard 4 = [${live.join(', ')}] but the JS mirror = [${mirrored.join(', ')}] — update TERMINAL_CHILD_STATUSES in lib/fleet/orchestrator-completion.cjs`,
    };
  } catch (e) {
    return { outcome: OUTCOME.DB_ERROR, message: `Query failed: ${e.message}` };
  } finally {
    if (client) await client.end();
  }
}

async function main() {
  const asJson = process.argv.includes('--json');
  const result = await runCrosscheck();
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[${result.outcome}] ${result.message}`);
  }
  process.exit(result.outcome === OUTCOME.MATCH ? 0 : 1);
}

// Windows-safe main-module check: import.meta.url is a percent-encoded file:// URL with forward
// slashes; process.argv[1] is a raw platform path (backslashes on Windows). A direct string
// comparison between them silently never matches on Windows, so main() never runs and the process
// exits 0 with no output -- a false-success trap. Resolve both to platform paths first.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
