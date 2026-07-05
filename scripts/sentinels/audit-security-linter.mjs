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

// Tables intentionally without RLS — system/PostGIS plus the disposable
// quarantine/backup copies left by the 20260609/20260610 SD-MAN purge sweep.
// They hold pre-image copies slated for drop, never carry live reads, and are
// not worth an RLS policy — exempting them keeps the sentinel's signal on REAL
// gaps instead of drowning in ~two dozen false positives.
//
// `_backup`/`_quarantine` are OVERLOADED naming conventions in this repo (real
// dated backup tables also use `<feature>_backup_YYYYMMDD`), so those copies are
// listed EXPLICITLY and by review — never by an open-ended suffix pattern that
// could silently swallow a future real table's RLS gap (the very failure this
// anti-noise change must not introduce).
const EXEMPTED_TABLES = new Set([
  'schema_migrations',
  'spatial_ref_sys',
  // SD-MAN purge/quarantine campaign copies (2026-06-09/10) — non-`_qparity` suffix.
  // management_reviews_quarantine_20260610 is still LIVE in production (SD-LEO-INFRA-RETARGET-
  // RESTORE-REHEARSAL-001 decoupled the DR restore-rehearsal drill from reading it, but did NOT
  // drop it — that remains a separate, chairman-gated migration). Remove this entry in the same
  // PR as that eventual drop.
  'management_reviews_quarantine_20260610',
  'venture_artifacts_storm_quarantine_20260610',
  'sd_baseline_items_purge_backup_20260609',
  'sd_baseline_items_recon_backup',
]);

// `_qparityYYYYMMDD` is a TOOL-GENERATED quarantine-parity suffix unique to the
// purge sweep — no human-authored feature table uses it — so it is safe to
// exempt by pattern. Anchored to the suffix with an 8-digit datestamp so it
// cannot match a live table (e.g. `scope_completion_chain` matches none).
const EXEMPTED_TABLE_PATTERNS = [
  /_qparity\d{8}$/i,
];

/**
 * True if a public table is intentionally exempt from the RLS requirement:
 * either an explicit system table or a disposable quarantine/backup copy.
 * Exported so the exemption set is unit-testable against the live table list.
 */
export function isExemptTable(name) {
  if (EXEMPTED_TABLES.has(name)) return true;
  return EXEMPTED_TABLE_PATTERNS.some((re) => re.test(name));
}

function log(msg = '') { if (!JSON_MODE) console.log(msg); }

async function main() {
  // 'engineer' matches scripts/apply-migration.js (the same consolidated instance the
  // remediation migration targeted). In CI the connectionString comes from DATABASE_URL
  // (SUPABASE_POOLER_URL is not a configured secret in this repo — DATABASE_URL is the
  // canonical fallback, same as scripts/check-migration-readiness.mjs). Locally, with
  // neither set, createDatabaseClient builds the string from SUPABASE_DB_PASSWORD.
  // createDatabaseClient strips any `?sslmode=require` so the committed-CA TLS config
  // governs (else SELF_SIGNED_CERT_IN_CHAIN on the runner) — see stripSslmode in
  // scripts/lib/supabase-connection.js.
  const client = await createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
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

    // (4) function_search_path_mutable — SECURITY DEFINER functions without a pinned
    // search_path. WARN-class in Supabase's linter, but the SECURITY DEFINER subset is a
    // real privilege-escalation surface (CVE-2018-1058 class), so the sentinel enforces it.
    const secdefFns = await client.query(`
      SELECT p.proname AS name
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
        AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) x WHERE x LIKE 'search_path=%')
      ORDER BY 1`);

    // Prevention liveness: is the view event trigger present + enabled? ('D' = disabled)
    const trig = await client.query(
      `SELECT evtenabled FROM pg_event_trigger WHERE evtname = 'leo_enforce_view_security_invoker'`);

    result = {
      securityDefinerViews: views.rows.map(r => r.name),
      rlsDisabled: tables.rows.map(r => r.name).filter(n => !isExemptTable(n)),
      sensitiveExposed: sensitive.rows.map(r => r.name).filter(n => !isExemptTable(n)),
      securityDefinerMutableFns: secdefFns.rows.map(r => r.name),
      triggerEnabled: trig.rows.length === 1 && trig.rows[0].evtenabled !== 'D',
    };
  } finally {
    await client.end();
  }

  const findings = result.securityDefinerViews.length + result.rlsDisabled.length
    + result.sensitiveExposed.length + result.securityDefinerMutableFns.length;
  const clean = findings === 0 && result.triggerEnabled;

  log('');
  log('='.repeat(60));
  log('  SUPABASE SECURITY-LINTER SENTINEL');
  log('='.repeat(60));
  log(`  security_definer_view (views w/o security_invoker): ${result.securityDefinerViews.length}`);
  log(`  rls_disabled_in_public (tables w/o RLS):            ${result.rlsDisabled.length}`);
  log(`  sensitive_columns_exposed (session_id, no RLS):     ${result.sensitiveExposed.length}`);
  log(`  function_search_path_mutable (SECURITY DEFINER fn): ${result.securityDefinerMutableFns.length}`);
  log(`  view-invoker event trigger enabled:                 ${result.triggerEnabled}`);
  log('  ' + '-'.repeat(40));
  if (result.securityDefinerViews.length) log('  Views:  ' + result.securityDefinerViews.join(', '));
  if (result.rlsDisabled.length) log('  Tables: ' + result.rlsDisabled.join(', '));
  if (result.securityDefinerMutableFns.length) log('  Functions: ' + result.securityDefinerMutableFns.join(', '));
  if (!result.triggerEnabled) log('  ⚠ PREVENTION GAP: view-invoker event trigger missing/disabled!');
  log(clean ? '  ✓ CLEAN' : '  ✗ FINDINGS PRESENT');
  log('='.repeat(60));

  if (JSON_MODE) console.log(JSON.stringify({ findings, ...result }, null, 2));

  // A missing/disabled prevention trigger is itself a strict-mode failure.
  if (STRICT && !clean) process.exitCode = 1;
}

// Only run the live audit when invoked directly (node scripts/sentinels/...).
// When imported (e.g. by the exemption unit test) the module just exposes
// isExemptTable without opening a DB connection.
import { pathToFileURL } from 'node:url';
const INVOKED_DIRECTLY = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (INVOKED_DIRECTLY) {
  main().catch(err => {
    console.error('Sentinel error:', err.message);
    process.exitCode = 1;
  });
}
