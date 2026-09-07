#!/usr/bin/env node
/**
 * Dry-run proof for 20260906_drop_anon_read_strategic_directives_v2.sql -- SD-LEO-FIX-CLOSE-ANON-KEY-001 FR-3.
 *
 * Runs the migration's real body (precondition, DROP POLICY, verify block) against production
 * inside a transaction that always ROLLBACKs, so it is safe to re-run any time before the real
 * ceremony. Also re-measures the anon-visible row count inside the same transaction, confirming
 * the DROP actually changes what anon can see (not just that the catalog row disappears) --
 * mirroring this SD's own FR-2 probe assertion.
 *
 * Usage: node database/chairman-gated/20260906_drop_anon_read_strategic_directives_v2_dry_run.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(__dirname, '20260906_drop_anon_read_strategic_directives_v2.sql');

/** Strip the leading `-- ...` header block so only the executable body remains. */
export function extractExecutableBody(sqlText) {
  const lines = sqlText.split('\n');
  const firstExecutable = lines.findIndex((l) => !l.trim().startsWith('--') && l.trim() !== '');
  return lines.slice(firstExecutable).join('\n');
}

async function main() {
  const raw = readFileSync(SQL_FILE, 'utf8');
  const body = extractExecutableBody(raw);

  const client = await createDatabaseClient('ehg',
    process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {});
  try {
    await client.query('BEGIN');
    const before = await client.query(`
      SELECT count(*)::int AS n FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'strategic_directives_v2'
         AND policyname = 'anon_read_strategic_directives_v2'
    `);
    console.log(`before: anon_read_strategic_directives_v2 present = ${before.rows[0].n === 1}`);

    // The real UP body: precondition DO block, DROP POLICY, verify DO block. Any RAISE EXCEPTION
    // inside these blocks aborts the whole transaction, which the outer ROLLBACK below is
    // redundant with but does not depend on.
    await client.query(body);
    console.log('migration body executed cleanly (precondition + DROP + verify all passed)');

    await client.query('SET LOCAL ROLE anon');
    const { rows: [asAnon] } = await client.query('SELECT count(*)::int AS n FROM strategic_directives_v2');
    await client.query('RESET ROLE');
    console.log(`inside the same transaction, post-DROP, as anon: strategic_directives_v2 row count = ${asAnon.n}`);
    if (asAnon.n !== 0) {
      console.error(`FAIL: expected 0 anon-visible rows after the DROP, got ${asAnon.n}`);
      process.exitCode = 1;
    } else {
      console.log('PASS: the DROP genuinely removes anon visibility, not just the catalog row');
    }
  } catch (err) {
    console.error(`dry-run FAILED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
  }
}

main();
