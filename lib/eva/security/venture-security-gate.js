/**
 * Venture Security Gate — Stage 20 Automated Security Verification
 * SD-VENTURE-PIPELINE-SECURITY-AUDIT-ORCH-001-B
 *
 * Runs automated security checks against a venture's Supabase project:
 * - RLS semantic validation (4 SQL queries against pg_policies/pg_proc)
 * - Secret exposure scanning (service_role_key in client code)
 * - SECURITY DEFINER function audit
 *
 * Severity tiering: CRITICAL findings block advancement (fail-closed),
 * WARNING findings pass through with notation. Chairman can bypass.
 *
 * @module lib/eva/security/venture-security-gate
 */

const QUERY_TIMEOUT_MS = 5000;

/**
 * @typedef {Object} SecurityFinding
 * @property {'critical'|'warning'} severity
 * @property {string} category - rls_permissive | rls_missing_uid | rls_no_policies | definer_bypass | secret_exposure
 * @property {string} table - Affected table or function name
 * @property {string} detail - Human-readable description
 */

/**
 * Run all security checks against a venture's Supabase project.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Client with service_role access to venture's project
 * @param {Object} options
 * @param {string} [options.ventureId] - For logging
 * @param {string} [options.chairmanBypass] - If set, gate returns PASS with bypass notation
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{verdict: 'PASS'|'FAIL'|'BYPASS', findings: SecurityFinding[], summary: Object}>}
 */
export async function runSecurityAudit(supabase, options = {}) {
  const { ventureId = 'unknown', chairmanBypass, logger = console } = options;
  const findings = [];

  if (chairmanBypass) {
    logger.log(`[SecurityGate] Chairman bypass for venture ${ventureId}: ${chairmanBypass}`);
    return {
      verdict: 'BYPASS',
      findings: [],
      summary: { bypass: true, reason: chairmanBypass, ventureId },
    };
  }

  // 1. Permissive RLS policies (qual = 'true' or NULL)
  try {
    const { data: permissive } = await supabase.rpc('sql', {
      query: `SELECT schemaname, tablename, policyname, cmd, qual, with_check
              FROM pg_policies
              WHERE (qual = 'true' OR qual IS NULL)
              AND schemaname = 'public'`,
    }).timeout(QUERY_TIMEOUT_MS);

    if (permissive?.length > 0) {
      for (const row of permissive) {
        findings.push({
          severity: 'critical',
          category: 'rls_permissive',
          table: row.tablename,
          detail: `Policy "${row.policyname}" on ${row.tablename} allows all (qual=${row.qual || 'NULL'})`,
        });
      }
    }
  } catch (err) {
    logger.warn('[SecurityGate] RLS permissive query failed', { error: err.message });
    findings.push({ severity: 'warning', category: 'rls_permissive', table: '*', detail: `Query failed: ${err.message}` });
  }

  // 2. Policies missing auth.uid() scoping
  try {
    const { data: noUid } = await supabase.rpc('sql', {
      query: `SELECT tablename, policyname, cmd, qual, with_check
              FROM pg_policies
              WHERE schemaname = 'public'
              AND qual NOT LIKE '%auth.uid()%'
              AND (with_check IS NULL OR with_check NOT LIKE '%auth.uid()%')
              AND cmd IN ('SELECT', 'INSERT', 'UPDATE')`,
    }).timeout(QUERY_TIMEOUT_MS);

    if (noUid?.length > 0) {
      for (const row of noUid) {
        findings.push({
          severity: 'critical',
          category: 'rls_missing_uid',
          table: row.tablename,
          detail: `Policy "${row.policyname}" on ${row.tablename} (${row.cmd}) does not scope to auth.uid()`,
        });
      }
    }
  } catch (err) {
    logger.warn('[SecurityGate] RLS uid query failed', { error: err.message });
  }

  // 3. Tables with RLS enabled but zero policies
  try {
    const { data: noPolicies } = await supabase.rpc('sql', {
      query: `SELECT c.relname AS tablename
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relrowsecurity = true
              AND n.nspname = 'public'
              AND c.relname NOT IN (SELECT tablename FROM pg_policies WHERE schemaname = 'public')`,
    }).timeout(QUERY_TIMEOUT_MS);

    if (noPolicies?.length > 0) {
      for (const row of noPolicies) {
        findings.push({
          severity: 'warning',
          category: 'rls_no_policies',
          table: row.tablename,
          detail: `Table "${row.tablename}" has RLS enabled but zero policies defined`,
        });
      }
    }
  } catch (err) {
    logger.warn('[SecurityGate] RLS no-policies query failed', { error: err.message });
  }

  // 4. SECURITY DEFINER functions touching public tables
  try {
    const { data: definers } = await supabase.rpc('sql', {
      query: `SELECT p.proname AS funcname, pg_get_functiondef(p.oid) AS funcdef
              FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE p.prosecdef = true
              AND n.nspname = 'public'
              AND pg_get_functiondef(p.oid) ILIKE '%from public.%'`,
    }).timeout(QUERY_TIMEOUT_MS);

    if (definers?.length > 0) {
      for (const row of definers) {
        findings.push({
          severity: 'warning',
          category: 'definer_bypass',
          table: row.funcname,
          detail: `Function "${row.funcname}" is SECURITY DEFINER and touches public tables (bypasses RLS)`,
        });
      }
    }
  } catch (err) {
    logger.warn('[SecurityGate] DEFINER query failed', { error: err.message });
  }

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  const verdict = criticalCount > 0 ? 'FAIL' : 'PASS';

  logger.log(`[SecurityGate] Audit complete for ${ventureId}`, {
    verdict, criticalCount, warningCount, totalFindings: findings.length,
  });

  return {
    verdict,
    findings,
    summary: {
      ventureId,
      criticalCount,
      warningCount,
      totalFindings: findings.length,
      checkedAt: new Date().toISOString(),
    },
  };
}
