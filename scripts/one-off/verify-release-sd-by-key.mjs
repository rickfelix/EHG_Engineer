#!/usr/bin/env node
/**
 * Verify release_sd_by_key / retarget_sd_claim are LIVE in the deployed database.
 * SD-LEO-INFRA-RELEASE-KEY-SESSION-001 (TR-5 / INV-003-migration-authored-is-not-applied).
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT A TEST. tests/unit/db/release-sd-by-key-sql.test.js
 * asserts the migration FILE is correct. It passes just as happily on a migration that was
 * written and never applied. The db vitest project skips at runtime without a designated
 * non-prod target, so a vitest "live" check would report green having executed nothing.
 * Modeled on scripts/one-off/verify-release-sd-qf-branch.mjs.
 *
 * Usage:  node scripts/one-off/verify-release-sd-by-key.mjs
 * Reads SUPABASE_POOLER_URL (or DATABASE_URL) from .env. Read-only: catalog reads + one
 * harmless RPC call against a session/key pair chosen to always refuse cleanly.
 */
import 'dotenv/config';
import pg from 'pg';

async function main() {
  const conn = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL;
  if (!conn) {
    console.error('FAIL: SUPABASE_POOLER_URL or DATABASE_URL required to read the live definition.');
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: conn });
  await client.connect();
  let failures = 0;
  try {
    for (const name of ['release_sd_by_key', 'retarget_sd_claim']) {
      const { rows } = await client.query(
        "SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1",
        [name],
      );
      if (!rows.length) {
        console.error(`FAIL: public.${name} not found in the live database.`);
        failures++;
        continue;
      }
      const def = rows[0].def;
      if (!/SECURITY DEFINER/.test(def)) {
        console.error(`FAIL: public.${name} is not SECURITY DEFINER.`);
        failures++;
      }
      console.log(`OK: public.${name} is live (${def.length} chars).`);
    }

    // Harmless RPC probe: a session_id that (almost certainly) has no live claude_sessions row
    // gets a clean phantom_session refusal from BOTH functions -- proves they are CALLABLE with
    // the documented (text,text,text[,text]) signature, not just present in the catalog.
    const probeSession = `verify-probe-${Date.now()}`;
    const rel = await client.query('SELECT release_sd_by_key($1, $2, $3) AS result', [probeSession, 'SD-DOES-NOT-EXIST-000', 'verify-probe']);
    const relResult = rel.rows[0].result;
    if (relResult?.success !== false || !['phantom_session', 'sd_not_found'].includes(relResult?.error)) {
      console.error(`FAIL: release_sd_by_key probe returned unexpected shape: ${JSON.stringify(relResult)}`);
      failures++;
    } else {
      console.log(`OK: release_sd_by_key is callable (probe returned {success:false, error:'${relResult.error}'}).`);
    }

    const retarget = await client.query('SELECT retarget_sd_claim($1, $2, $3, $4) AS result', [probeSession, 'SD-DOES-NOT-EXIST-000', 'SD-DOES-NOT-EXIST-000', 'verify-probe']);
    const retargetResult = retarget.rows[0].result;
    if (retargetResult?.success !== false || retargetResult?.error !== 'sd_same_key') {
      console.error(`FAIL: retarget_sd_claim probe returned unexpected shape: ${JSON.stringify(retargetResult)}`);
      failures++;
    } else {
      console.log(`OK: retarget_sd_claim is callable (probe returned {success:false, error:'sd_same_key'}).`);
    }
  } finally {
    await client.end();
  }

  if (failures > 0) {
    console.error(`\nFAIL: ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nPASS: release_sd_by_key and retarget_sd_claim are live and callable.');
}

main().catch((e) => {
  console.error('FAIL:', e?.message || e);
  process.exit(1);
});
