/**
 * SECURITY DEFINER exposure probe — SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001.
 *
 * THE CLASS: a SECURITY DEFINER function executes as its OWNER. When that owner also carries
 * rolbypassrls, the function bypasses Row Level Security entirely, no matter how complete the
 * table policies are. If such a function is additionally EXECUTE-able by `anon` or
 * `authenticated`, any caller reaches owner-level, RLS-bypassing access through it.
 *
 * WHY THIS LIVES IN ITS OWN MODULE: two instruments need the same question answered — the
 * weekly CI sentinel (scripts/sentinels/audit-security-linter.mjs) and the per-SD SECURITY
 * sub-agent (lib/sub-agents/security.js). Duplicating the query would give the repo two
 * catalog definitions of one security class that could silently drift apart, so both import
 * from here.
 *
 * SCHEMA SCOPE IS `public`, DELIBERATELY AND MEASURABLY — NOT ACCIDENTALLY. This is stated
 * because an unstated scope is indistinguishable from a blind spot, which is the very failure
 * this module exists to correct. Measured at authoring time over the live catalog: 44 members
 * of this class in `public`, plus 15 MORE outside it — 10 in `governance` and 5 in
 * `portfolio` — which this query does NOT report. Those 15 are real and are routed to the
 * harness backlog rather than silently folded in, because the SD's premise, its acceptance
 * criteria and the sentinel's reconciliation figure were all measured against `public`, and
 * widening the predicate mid-implementation would have changed the number the acceptance test
 * checks against. Widening this to the full non-system schema list is a one-line change and is
 * the obvious next step once someone owns the additional 15.
 *
 * WHY THE QUERY DELIBERATELY IGNORES search_path: the sentinel's pre-existing DEFINER check
 * filters to functions WITHOUT a pinned search_path (CVE-2018-1058 class). That axis is
 * orthogonal to this one, and the fleet-wide pinning migration
 * (database/migrations/20260602_pin_search_path_security_definer_functions.sql) pinned almost
 * everything — measured, 42 of the 44 functions in this class are pinned, so the only live
 * catalog instrument could see 2 of 44. public.record_venture_error, which has a proven
 * cross-tenant exploit, is pinned and was therefore invisible. Filtering on pinning here would
 * rebuild exactly that blind spot, so this query must never reference proconfig/search_path.
 */

import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

/**
 * Catalog query for SECURITY DEFINER functions in `public` owned by a BYPASSRLS role and
 * EXECUTE-able by anon or authenticated.
 *
 * The WHERE clause filters the class server-side (cheap, and keeps the row set small);
 * classifyDefinerExposure() re-applies the same predicate in JS because callers may inject
 * rows — the probe must never trust that its input was pre-filtered.
 */
export const DEFINER_EXPOSURE_SQL = `
  SELECT n.nspname                                   AS schema,
         p.proname                                   AS name,
         pg_get_function_identity_arguments(p.oid)   AS args,
         r.rolname                                   AS owner,
         r.rolbypassrls                              AS owner_bypasses_rls,
         p.prosecdef                                 AS security_definer,
         has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_roles     r ON r.oid = p.proowner
  WHERE n.nspname = 'public'
    -- 'p' (procedures) as well as 'f' (functions): a SECURITY DEFINER PROCEDURE owned by a
    -- BYPASSRLS role and CALLable by anon is the identical vulnerability. Measured at
    -- authoring time there are zero such procedures (all 139 SECURITY DEFINER routines in
    -- public are prokind='f'), so this is latent-gap closure, not a behaviour change — which
    -- is exactly when it is cheapest to close.
    AND p.prokind IN ('f', 'p')
    AND p.prosecdef
    AND r.rolbypassrls
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ORDER BY 1, 2`;

/**
 * Apply the exposure predicate to catalog rows.
 * Two-sided by construction: a DEFINER function whose owner lacks rolbypassrls, or which no
 * public role can execute, is NOT at risk and must not be reported.
 *
 * @param {Array<object>} rows raw catalog rows
 * @returns {Array<object>} the subset that is genuinely exposed
 */
export function classifyDefinerExposure(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter(r =>
      r &&
      r.security_definer !== false &&
      r.owner_bypasses_rls === true &&
      (r.anon_execute === true || r.authenticated_execute === true))
    .map(r => ({
      schema: r.schema ?? 'public',
      name: r.name,
      args: r.args ?? '',
      owner: r.owner ?? null,
      anon_execute: r.anon_execute === true,
      authenticated_execute: r.authenticated_execute === true
    }));
}

/**
 * Run the probe against the live catalog.
 *
 * THREE DISTINGUISHABLE OUTCOMES — the whole point of this SD. `functions_at_risk` is null,
 * never 0, when the probe did not run. A 0 there would be indistinguishable from a genuinely
 * clean catalog to any consumer that tests only a count, which is precisely the defect being
 * repaired (lib/sub-agents/security.js:215 gated on `count > 0` and so read an unrun check as
 * a clean one for a year).
 *
 * @param {object}   [opts]
 * @param {Function} [opts.connect] injectable connection factory returning a pg-like client.
 *   Injectable so tests never construct a real client: the unit-tier credential fence does not
 *   neutralise every DB route, so a probe that built its own client could reach production.
 * @returns {Promise<{probe_ran: boolean, reason: string|null, functions_at_risk: number|null, functions: Array<object>}>}
 */
export async function probeDefinerExposure({ connect } = {}) {
  const open = connect || (() => createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL
  }));

  let client;
  try {
    client = await open();
  } catch (error) {
    return { probe_ran: false, reason: `catalog connection unavailable: ${error.message}`, functions_at_risk: null, functions: [] };
  }

  if (!client || typeof client.query !== 'function') {
    return { probe_ran: false, reason: 'catalog connection unavailable: no usable client returned', functions_at_risk: null, functions: [] };
  }

  try {
    const res = await client.query(DEFINER_EXPOSURE_SQL);
    const functions = classifyDefinerExposure(res?.rows);
    return { probe_ran: true, reason: null, functions_at_risk: functions.length, functions };
  } catch (error) {
    return { probe_ran: false, reason: `catalog query failed: ${error.message}`, functions_at_risk: null, functions: [] };
  } finally {
    if (client && typeof client.end === 'function') {
      await client.end().catch(() => {});
    }
  }
}
