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
// SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001: shared with the SECURITY sub-agent
// (lib/sub-agents/security.js) so one catalog definition serves both instruments.
import { DEFINER_EXPOSURE_SQL, classifyDefinerExposure } from '../../lib/security/definer-exposure.js';
// SD-LEO-INFRA-REVOKE-DEFAULT-PUBLIC-001: pg_net (net schema) exposure — report-only,
// see the check (6) comment below and lib/security/pg-net-exposure.js's own header for
// why this is detection-only rather than a fix.
import { probePgNetExposure } from '../../lib/security/pg-net-exposure.js';

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

/**
 * SD-LEO-INFRA-REVOKE-DEFAULT-PUBLIC-001 (FR-2/TS-8): exported, injectable entrypoint so
 * the pg_net check's integration with the sentinel (probe_ran discrimination surviving
 * the call site, TS-9) is unit-testable without a subprocess spawn or touching the live
 * weekly job. `main()` below is a thin wrapper for the CLI path.
 *
 * @param {object}   [opts]
 * @param {Function} [opts.connect] injectable connection factory, overriding the default
 *   createDatabaseClient call. Used by tests to simulate catalog failures.
 */
export async function runSentinel({ connect } = {}) {
  // 'engineer' matches scripts/apply-migration.js (the same consolidated instance the
  // remediation migration targeted). In CI the connectionString comes from DATABASE_URL
  // (SUPABASE_POOLER_URL is not a configured secret in this repo — DATABASE_URL is the
  // canonical fallback, same as scripts/check-migration-readiness.mjs). Locally, with
  // neither set, createDatabaseClient builds the string from SUPABASE_DB_PASSWORD.
  // createDatabaseClient strips any `?sslmode=require` so the committed-CA TLS config
  // governs (else SELF_SIGNED_CERT_IN_CHAIN on the runner) — see stripSslmode in
  // scripts/lib/supabase-connection.js.
  const client = connect
    ? await connect()
    : await createDatabaseClient('engineer', {
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

    // (5) definer_rls_bypass_exposed — SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001.
    // SECURITY DEFINER functions that execute as a BYPASSRLS owner AND are EXECUTE-able by
    // anon/authenticated: the caller reaches owner-level, RLS-bypassing access through them.
    //
    // This is a SEPARATE AXIS from check (4) above, and the distinction is load-bearing. Check
    // (4) filters to functions WITHOUT a pinned search_path. The fleet-wide pinning migration
    // (20260602_pin_search_path_security_definer_functions.sql) pinned nearly everything, so
    // check (4)'s visibility into THIS class collapsed to 2 of 44 — measured. The function with
    // a proven cross-tenant exploit, public.record_venture_error, is pinned and was therefore
    // invisible to the only live-catalog security instrument the repo has. Hence: never filter
    // this query on proconfig/search_path.
    const definerExposed = classifyDefinerExposure((await client.query(DEFINER_EXPOSURE_SQL)).rows);

    // (6) pg_net_exposure — SD-LEO-INFRA-REVOKE-DEFAULT-PUBLIC-001. REPORT-ONLY, same
    // treatment as (5) above and for the identical reason: direct remediation (REVOKE/
    // ALTER DEFAULT PRIVILEGES on the net schema's PUBLIC-exposed functions + tables +
    // sequence) is proven infeasible — `postgres` has zero grant-authority over the
    // `supabase_admin`-owned objects (see lib/security/pg-net-exposure.js's header for
    // the full investigation). Excluded from `findings`/`clean`/`--strict` below.
    //
    // Calls probePgNetExposure() (never raw client.query().rows — that would discard
    // probe_ran, the exact defect class this SD exists to prevent) via a NON-OWNING
    // wrapper exposing only query(): probePgNetExposure's own teardown guard
    // (`typeof client.end === 'function'`) sees no `end` on this wrapper and therefore
    // never closes THIS function's shared client, which the trigger-liveness query
    // right below still needs.
    const pgNet = await probePgNetExposure({ connect: async () => ({ query: (...args) => client.query(...args) }) });

    // Prevention liveness: is the view event trigger present + enabled? ('D' = disabled)
    const trig = await client.query(
      `SELECT evtenabled FROM pg_event_trigger WHERE evtname = 'leo_enforce_view_security_invoker'`);

    result = {
      securityDefinerViews: views.rows.map(r => r.name),
      rlsDisabled: tables.rows.map(r => r.name).filter(n => !isExemptTable(n)),
      sensitiveExposed: sensitive.rows.map(r => r.name).filter(n => !isExemptTable(n)),
      securityDefinerMutableFns: secdefFns.rows.map(r => r.name),
      definerRlsBypassExposed: definerExposed.map(f => `${f.name}(${f.args})`),
      // TS-9 contract: probeRan is ALWAYS present and explicit — a failed probe must
      // render distinguishably, never collapse into an empty/zero-looking report-only
      // section that reads identically to "checked, found nothing."
      pgNetExposure: pgNet.probe_ran
        ? {
            probeRan: true,
            functions: pgNet.functions.map(f => `${f.name}(${f.args})`),
            relations: pgNet.relations.map(r => `${r.name} [${r.kind}]`),
          }
        : { probeRan: false, reason: pgNet.reason },
      triggerEnabled: trig.rows.length === 1 && trig.rows[0].evtenabled !== 'D',
    };
  } finally {
    if (typeof client.end === 'function') await client.end();
  }

  // SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001: definerRlsBypassExposed is REPORTED but is
  // deliberately NOT summed into `findings`, so it cannot flip `clean` or the --strict exit
  // code. Measured at authoring time: 44 functions are in this class, all pre-existing exposure
  // whose remediation DDL is staged in a separate chairman-gated cutover runbook. Adding 44 to
  // the sum would turn the weekly job red on day one for something no PR introduced, and a
  // sentinel that is red for reasons the reader cannot act on gets muted — which would cost the
  // repo the four checks that DO gate. Promote it into the sum once the cutover has burned the
  // backlog down to zero; the burn-down is what makes it enforceable, not this line.
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
  log(`  definer_rls_bypass_exposed (report-only):            ${result.definerRlsBypassExposed.length}`);
  log(`  pg_net_exposure (net schema, report-only):          ${
    result.pgNetExposure.probeRan
      ? `${result.pgNetExposure.functions.length} functions, ${result.pgNetExposure.relations.length} relations`
      : 'PROBE FAILED'
  }`);
  log(`  view-invoker event trigger enabled:                 ${result.triggerEnabled}`);
  log('  ' + '-'.repeat(40));
  if (result.securityDefinerViews.length) log('  Views:  ' + result.securityDefinerViews.join(', '));
  if (result.rlsDisabled.length) log('  Tables: ' + result.rlsDisabled.join(', '));
  if (result.securityDefinerMutableFns.length) log('  Functions: ' + result.securityDefinerMutableFns.join(', '));
  if (result.definerRlsBypassExposed.length) {
    log('  RLS-bypass-exposed DEFINER functions (anon/authenticated EXECUTE, owner has BYPASSRLS):');
    log('    ' + result.definerRlsBypassExposed.join('\n    '));
    log('    ^ report-only: pre-existing exposure, remediated by the cutover runbook, not by this job.');
  }
  if (!result.pgNetExposure.probeRan) {
    // TS-9: a failed probe renders distinguishably here — never a silent 0/clean line.
    log(`  ⚠ pg_net exposure PROBE FAILED — ${result.pgNetExposure.reason} (report-only check could not run; does not affect clean/--strict)`);
  } else if (result.pgNetExposure.functions.length || result.pgNetExposure.relations.length) {
    log('  pg_net-exposed objects (net schema, functions / relations):');
    log('    ' + [...result.pgNetExposure.functions, ...result.pgNetExposure.relations].join('\n    '));
    log('    ^ report-only: pre-existing exposure, direct remediation platform-blocked (see lib/security/pg-net-exposure.js), not fixed by this job.');
  }
  if (!result.triggerEnabled) log('  ⚠ PREVENTION GAP: view-invoker event trigger missing/disabled!');
  log(clean ? '  ✓ CLEAN' : '  ✗ FINDINGS PRESENT');
  log('='.repeat(60));

  if (JSON_MODE) console.log(JSON.stringify({ findings, ...result }, null, 2));

  // A missing/disabled prevention trigger is itself a strict-mode failure.
  if (STRICT && !clean) process.exitCode = 1;

  return result;
}

async function main() {
  return runSentinel();
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
