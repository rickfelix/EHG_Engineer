#!/usr/bin/env node
/**
 * Security-Linter Sentinel
 *
 * Detection backstop for the Supabase database-linter SECURITY rules remediated in
 * database/migrations/20260602_fix_security_definer_views_and_rls_recurrence.sql:
 *   - security_definer_view      : public views lacking `security_invoker=on`
 *   - rls_disabled_in_public     : public tables/partitions with RLS disabled
 *   - sensitive_columns_exposed  : the session_id subset of the above
 *
 * The recurrence is PREVENTED in real time by the event trigger
 * `leo_enforce_view_security_invoker` (views) and the hardened
 * `security_audit_events_create_partition()` (partitions). This sentinel is the
 * defense-in-depth DETECTOR: if the trigger is dropped/disabled, or a new public
 * table is created without RLS, a scheduled run goes red.
 *
 * Uses the pg direct connection (createDatabaseClient) because the checks read
 * pg_catalog (reloptions / relrowsecurity / pg_event_trigger), which PostgREST
 * does not expose. In CI, pass connectionString via the SUPABASE_POOLER_URL
 * secret (see .github/workflows/security-linter-sentinel.yml); locally it falls
 * back to SUPABASE_DB_PASSWORD.
 *
 * Usage:
 *   node scripts/sentinels/audit-security-linter.mjs            # human-readable report
 *   node scripts/sentinels/audit-security-linter.mjs --json     # JSON report (artifact)
 *   node scripts/sentinels/audit-security-linter.mjs --strict   # exit 1 if any findings
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

const JSON_MODE = process.argv.includes('--json');
const STRICT = process.argv.includes('--strict');

// Tables intentionally without RLS (system / PostGIS). Matches the exemption
// set in scripts/audit-rls-policies.js.
const EXEMPTED_TABLES = new Set(['schema_migrations', 'spatial_ref_sys']);

function log(msg = '') { if (!JSON_MODE) console.log(msg); }

async function main() {
  // 'engineer' matches scripts/apply-migration.js (the same consolidated instance the
  // remediation migration targeted). connectionString (SUPABASE_POOLER_URL) wins in CI;
  // locally it falls back to building from SUPABASE_DB_PASSWORD.
  const client = await createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL,
  });

  let result;
  try {
    // (1) security_definer_view — views lacking security_invoker=on
    const views = await client.query(`
      SELECT c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'v'
        AND NOT (COALESCE(c.reloptions, '{}') @> ARRAY['security_invoker=on'])
      ORDER BY 1`);

    // (2) rls_disabled_in_public — ordinary tables ('r') + partitioned parents ('p') with RLS off
    const tables = await client.query(`
      SELECT c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity = false
      ORDER BY 1`);

    // (3) sensitive_columns_exposed — session_id on a table/partition lacking RLS
    const sensitive = await client.query(`
      SELECT DISTINCT c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'session_id'
        AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity = false
      ORDER BY 1`);

    // Prevention liveness: is the view event trigger present + enabled? ('D' = disabled)
    const trig = await client.query(
      `SELECT evtenabled FROM pg_event_trigger WHERE evtname = 'leo_enforce_view_security_invoker'`);

    result = {
      securityDefinerViews: views.rows.map(r => r.name),
      rlsDisabled: tables.rows.map(r => r.name).filter(n => !EXEMPTED_TABLES.has(n)),
      sensitiveExposed: sensitive.rows.map(r => r.name).filter(n => !EXEMPTED_TABLES.has(n)),
      triggerEnabled: trig.rows.length === 1 && trig.rows[0].evtenabled !== 'D',
    };
  } finally {
    await client.end();
  }

  const findings = result.securityDefinerViews.length + result.rlsDisabled.length + result.sensitiveExposed.length;
  const clean = findings === 0 && result.triggerEnabled;

  log('');
  log('='.repeat(60));
  log('  SUPABASE SECURITY-LINTER SENTINEL');
  log('='.repeat(60));
  log(`  security_definer_view (views w/o security_invoker): ${result.securityDefinerViews.length}`);
  log(`  rls_disabled_in_public (tables w/o RLS):            ${result.rlsDisabled.length}`);
  log(`  sensitive_columns_exposed (session_id, no RLS):     ${result.sensitiveExposed.length}`);
  log(`  view-invoker event trigger enabled:                 ${result.triggerEnabled}`);
  log('  ' + '-'.repeat(40));
  if (result.securityDefinerViews.length) log('  Views:  ' + result.securityDefinerViews.join(', '));
  if (result.rlsDisabled.length) log('  Tables: ' + result.rlsDisabled.join(', '));
  if (!result.triggerEnabled) log('  ⚠ PREVENTION GAP: view-invoker event trigger missing/disabled!');
  log(clean ? '  ✓ CLEAN' : '  ✗ FINDINGS PRESENT');
  log('='.repeat(60));

  if (JSON_MODE) console.log(JSON.stringify({ findings, ...result }, null, 2));

  // A missing/disabled prevention trigger is itself a strict-mode failure.
  if (STRICT && !clean) process.exitCode = 1;
}

main().catch(err => {
  console.error('Sentinel error:', err.message);
  process.exitCode = 1;
});
