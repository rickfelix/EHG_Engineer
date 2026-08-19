/**
 * pg_net exposure probe — SD-LEO-INFRA-REVOKE-DEFAULT-PUBLIC-001.
 *
 * THE CLASS: pg_net's net.* functions/tables ship with Postgres's hard-wired default
 * privileges — PUBLIC EXECUTE on functions, and no RLS on the two internal queue
 * relations. Direct remediation (REVOKE/ALTER DEFAULT PRIVILEGES) was proven infeasible:
 * `postgres` (the only DB role available to this project) has zero grant-authority over
 * `supabase_admin`-owned net.* objects. REVOKE silently no-ops (a server WARNING, not an
 * error — "no privileges could be revoked"; PUBLIC's grant survives), and ALTER DEFAULT
 * PRIVILEGES hard-errors 42501 ("permission denied to change default privileges").
 * Escalating the role itself is blocked too: `GRANT supabase_admin TO postgres` fails with
 * a Supabase-specific guard ("role memberships are reserved, only superusers can grant
 * them") — confirming this is a platform reservation, not a permissions gap this codebase
 * can close. A postgres-owned SECURITY DEFINER event-trigger workaround was also built and
 * tested this session and fails for the identical reason (SECURITY DEFINER confers the
 * owner's — postgres's — authority, which is equally absent).
 *
 * RECOMMENDED FOLLOW-UP (a chairman decision — NOT executed by this module): pursue
 * Supabase platform support. Primary ask — DROP EXTENSION pg_net entirely, since it has
 * zero live consumers in this database (measured: no DB function/trigger/cron references
 * net.http_*; the chairman SMS relay uses the Twilio SDK directly from Node,
 * lib/chairman/sms-outbound-worker.js; pg_cron is not installed). Be aware this would
 * permanently dead-end the committed-but-never-applied
 * database/migrations/20260410_friday_notification_cron.sql, which needs pg_cron (absent)
 * before it could ever run. Fallback ask: request a supabase_admin-executed REVOKE on the
 * exposed objects. Full investigation trail: strategic_directives_v2.metadata.
 * lead_feasibility_finding on this SD.
 *
 * SCOPE: the WHOLE net schema, by relkind/prokind — not a hardcoded object list. Measured
 * 2026-08-19: 10 functions (prokind IN ('f','p')) and 3 relations (2 tables + 1 sequence,
 * relkind IN ('r','p','S')) are exposed. That count is deliberately NOT asserted by any
 * test (see tests/unit/security/pg-net-exposure.test.js) — this module exists to detect
 * DRIFT, and a test pinned to today's count would go red the moment someone remediates one
 * object (a GOOD outcome), training readers to bump the constant instead of investigating.
 * Scoping by kind rather than name also means a future pg_net-added relation (e.g. a new
 * queue table on extension upgrade) is caught by construction, not by a follow-up SD.
 *
 * WHY THIS LIVES IN ITS OWN MODULE: mirrors lib/security/definer-exposure.js's precedent —
 * one catalog-query module, wired into scripts/sentinels/audit-security-linter.mjs as a
 * report-only check (visible, never summed into `findings`, never affects `clean` or
 * `--strict` — see that file's own definerRlsBypassExposed treatment of a different
 * pre-existing, remediation-blocked exposure class for the identical pattern).
 *
 * WHY NEVER proacl/relacl TEXT MATCHING: PUBLIC's grant renders as an EMPTY-grantee
 * aclitem (e.g. `=X/supabase_admin`), never the literal string 'PUBLIC' — confirmed live
 * this session, and independently documented by the pre-existing
 * scripts/audit-rpc-execute-grants.mjs header comment for a sibling check. Only
 * has_function_privilege()/has_table_privilege() answer "can this role actually do this."
 */

import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

/**
 * Function-exposure query: every net.* function/procedure, with anon/authenticated
 * EXECUTE computed via has_function_privilege (never proacl text matching).
 */
export const PG_NET_FUNCTION_EXPOSURE_SQL = `
  SELECT p.proname                                              AS name,
         pg_get_function_identity_arguments(p.oid)              AS args,
         r.rolname                                              AS owner,
         has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_roles     r ON r.oid = p.proowner
  WHERE n.nspname = 'net'
    AND p.prokind IN ('f', 'p')
  ORDER BY 1`;

/**
 * Relation-exposure query: every net.* table/partition/sequence, with anon/authenticated
 * privileges computed via has_table_privilege (SELECT/INSERT/UPDATE/DELETE/USAGE — USAGE
 * is the meaningful axis for sequences, e.g. nextval() abuse via a PUBLIC-usable sequence),
 * plus RLS state (NULL for sequences, which have no RLS concept).
 */
export const PG_NET_RELATION_EXPOSURE_SQL = `
  SELECT c.relname                                                     AS name,
         CASE c.relkind WHEN 'S' THEN 'sequence' ELSE 'table' END      AS kind,
         has_table_privilege('anon', c.oid, 'SELECT')                  AS anon_select,
         has_table_privilege('anon', c.oid, 'INSERT')                  AS anon_insert,
         has_table_privilege('anon', c.oid, 'UPDATE')                  AS anon_update,
         has_table_privilege('anon', c.oid, 'DELETE')                  AS anon_delete,
         -- USAGE is a SEQUENCE-only privilege, checked via the dedicated
         -- has_sequence_privilege() — NOT has_table_privilege(...,'USAGE'), which throws
         -- "unrecognized privilege type" unconditionally (confirmed live: it rejects
         -- 'USAGE' even when called against an actual sequence row, since USAGE is
         -- outside has_table_privilege's own recognized set of SELECT/INSERT/UPDATE/
         -- DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN). The CASE guard additionally
         -- skips the call entirely for relkind <> 'S' (Postgres CASE never evaluates an
         -- untaken branch), so has_sequence_privilege is never called against a table oid.
         CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('anon', c.oid, 'USAGE') END AS anon_usage,
         has_table_privilege('authenticated', c.oid, 'SELECT')         AS authenticated_select,
         has_table_privilege('authenticated', c.oid, 'INSERT')         AS authenticated_insert,
         has_table_privilege('authenticated', c.oid, 'UPDATE')         AS authenticated_update,
         has_table_privilege('authenticated', c.oid, 'DELETE')         AS authenticated_delete,
         CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('authenticated', c.oid, 'USAGE') END AS authenticated_usage,
         CASE WHEN c.relkind = 'S' THEN NULL ELSE c.relrowsecurity END AS rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'net'
    AND c.relkind IN ('r', 'p', 'S')
  ORDER BY 1`;

const ANON_RELATION_FLAGS = ['anon_select', 'anon_insert', 'anon_update', 'anon_delete', 'anon_usage'];
const AUTHENTICATED_RELATION_FLAGS = [
  'authenticated_select', 'authenticated_insert', 'authenticated_update', 'authenticated_delete', 'authenticated_usage',
];

/**
 * Apply the function-exposure predicate to catalog rows.
 * A function is exposed if PUBLIC-reachable via anon OR authenticated (never AND).
 *
 * @param {Array<object>} rows raw catalog rows
 * @returns {Array<object>} the subset that is genuinely exposed
 */
export function classifyPgNetFunctionExposure(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && (r.anon_execute === true || r.authenticated_execute === true))
    .map((r) => ({
      name: r.name,
      args: r.args ?? '',
      owner: r.owner ?? null,
      anon_execute: r.anon_execute === true,
      authenticated_execute: r.authenticated_execute === true,
    }));
}

/**
 * Apply the relation-exposure predicate to catalog rows.
 * A relation is exposed if anon OR authenticated holds ANY checked privilege.
 * Two-sided by construction: a relation with RLS enabled and no anon/authenticated grant
 * at all is NOT flagged — mirrors definer-exposure.js's own two-sided contract.
 *
 * @param {Array<object>} rows raw catalog rows
 * @returns {Array<object>} the subset that is genuinely exposed
 */
export function classifyPgNetRelationExposure(rows = []) {
  const anyTrue = (row, flags) => flags.some((f) => row[f] === true);
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && (anyTrue(r, ANON_RELATION_FLAGS) || anyTrue(r, AUTHENTICATED_RELATION_FLAGS)))
    .map((r) => ({
      name: r.name,
      kind: r.kind,
      anon_access: anyTrue(r, ANON_RELATION_FLAGS),
      authenticated_access: anyTrue(r, AUTHENTICATED_RELATION_FLAGS),
      rls_enabled: r.rls_enabled === true ? true : r.rls_enabled === false ? false : null,
    }));
}

/**
 * Run both probes (functions + relations) against the live catalog.
 *
 * THREE DISTINGUISHABLE OUTCOMES, mirroring probeDefinerExposure exactly: functions_at_risk
 * and relations_at_risk are BOTH null, never 0, when the probe did not run — a connection
 * failure, a query throw, or a non-array rows payload from EITHER query all resolve to
 * probe_ran:false with both counts null, never a fabricated clean 0 on one axis while the
 * other reports real data.
 *
 * CONNECTION OWNERSHIP: if the injected `connect` factory returns a client WITHOUT an
 * `end` method, this function does NOT attempt to close it — mirrors probeDefinerExposure's
 * own guard (`typeof client.end === 'function'`). A caller that wants its own client closed
 * must expose `.end` on it; a caller sharing a connection it still needs afterward (e.g.
 * scripts/sentinels/audit-security-linter.mjs, which queries the event trigger AFTER this
 * probe runs) must inject a non-owning wrapper without `.end`.
 *
 * @param {object}   [opts]
 * @param {Function} [opts.connect] injectable connection factory returning a pg-like client.
 * @returns {Promise<{probe_ran: boolean, reason: string|null, functions_at_risk: number|null, relations_at_risk: number|null, functions: Array<object>, relations: Array<object>}>}
 */
export async function probePgNetExposure({ connect } = {}) {
  const open = connect || (() => createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
  }));

  const failure = (reason) => ({
    probe_ran: false, reason, functions_at_risk: null, relations_at_risk: null, functions: [], relations: [],
  });

  let client;
  try {
    client = await open();
  } catch (error) {
    return failure(`catalog connection unavailable: ${error.message}`);
  }

  if (!client || typeof client.query !== 'function') {
    return failure('catalog connection unavailable: no usable client returned');
  }

  try {
    const fnRes = await client.query(PG_NET_FUNCTION_EXPOSURE_SQL);
    const relRes = await client.query(PG_NET_RELATION_EXPOSURE_SQL);

    // Uninterpretable payload on EITHER axis must not render as a clean result on the
    // other — matches the definer-exposure.js precedent's own "the fix for this fix" note.
    if (!fnRes || !Array.isArray(fnRes.rows)) {
      return failure(`catalog query returned an uninterpretable payload (expected rows[] from the function query, got ${fnRes ? typeof fnRes.rows : 'no result'})`);
    }
    if (!relRes || !Array.isArray(relRes.rows)) {
      return failure(`catalog query returned an uninterpretable payload (expected rows[] from the relation query, got ${relRes ? typeof relRes.rows : 'no result'})`);
    }

    const functions = classifyPgNetFunctionExposure(fnRes.rows);
    const relations = classifyPgNetRelationExposure(relRes.rows);
    return {
      probe_ran: true, reason: null,
      functions_at_risk: functions.length, relations_at_risk: relations.length,
      functions, relations,
    };
  } catch (error) {
    return failure(`catalog query failed: ${error.message}`);
  } finally {
    if (client && typeof client.end === 'function') {
      await client.end().catch(() => {});
    }
  }
}
