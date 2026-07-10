#!/usr/bin/env node
/**
 * Literal-email RLS policy sweep — SD-LEO-INFRA-CHAIRMAN-GAUGE-RLS-REPAIR-001 (FR-3).
 *
 * Enumerates every pg_policies row whose USING (qual) or WITH CHECK expression embeds a
 * literal email address — the auth-debt class behind gauge-trust finding B2 (chairman OKR
 * gauge permanently 0% because the policy was keyed to an address that isn't his login).
 * Also prints the full policy set on the seven gauge tables for the PR artifact.
 *
 * Exit codes: 1 when any literal-email policy exists (CI regression tripwire post-apply),
 * 0 when clean, 2 on connection/query failure. Run from the EHG_Engineer shared root
 * (needs .env DB credentials): node scripts/rls/literal-email-policy-sweep.mjs
 */
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

// Matches a literal email embedded anywhere in a policy expression. Deliberately broad:
// quoted or not, any TLD length >= 2. Policy expressions comparing to auth.jwt()->>'email'
// only trip this when the OTHER side is a hardcoded address — which is exactly the defect.
export const LITERAL_EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export const GAUGE_TABLES = [
  'stage_executions',
  'objectives',
  'key_results',
  'kr_progress_snapshots',
  'monthly_ceo_reports',
  'sd_key_result_alignment',
  'strategic_vision',
];

/** Pure classifier: which of these pg_policies-shaped rows embed a literal email? */
export function findLiteralEmailPolicies(rows) {
  return (rows || []).filter(
    (r) => LITERAL_EMAIL_RE.test(r.qual || '') || LITERAL_EMAIL_RE.test(r.with_check || ''),
  );
}

async function main() {
  let client;
  try {
    client = await createDatabaseClient('engineer');
  } catch (err) {
    console.error(`SWEEP_ERROR: could not connect: ${err.message}`);
    process.exit(2);
  }
  try {
    const { rows: all } = await client.query(
      `SELECT schemaname, tablename, policyname, cmd, roles::text AS roles, qual, with_check
       FROM pg_policies ORDER BY tablename, policyname`,
    );
    const offenders = findLiteralEmailPolicies(all);

    console.log('=== LITERAL-EMAIL POLICY SWEEP (pg_policies, DB-wide) ===');
    if (offenders.length === 0) {
      console.log('CLEAN: no policy embeds a literal email address.');
    } else {
      for (const p of offenders) {
        console.log(`FOUND ${p.schemaname}.${p.tablename} :: "${p.policyname}" [${p.cmd} ${p.roles}]`);
        if (p.qual) console.log(`  USING      ${p.qual}`);
        if (p.with_check) console.log(`  WITH CHECK ${p.with_check}`);
      }
      console.log(`TOTAL: ${offenders.length} literal-email polic${offenders.length === 1 ? 'y' : 'ies'}.`);
    }

    console.log('\n=== GAUGE-TABLE POLICY SETS ===');
    for (const t of GAUGE_TABLES) {
      const pols = all.filter((r) => r.tablename === t);
      console.log(`${t}: ${pols.length === 0 ? '(no policies)' : ''}`);
      for (const p of pols) console.log(`  "${p.policyname}" [${p.cmd} ${p.roles}] USING ${p.qual}`);
    }

    process.exit(offenders.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`SWEEP_ERROR: query failed: ${err.message}`);
    process.exit(2);
  } finally {
    await client.end().catch(() => {});
  }
}

// Import-safe: only run when invoked directly (lets tests import the pure parts).
if (isMainModule(import.meta.url)) {
  main();
}
