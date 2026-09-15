/**
 * A2 integrity check (SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001, FR-4): "a venture-context
 * write to a base role is refused". Pins 2 already-live schema facts from
 * SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001 (database/chairman-gated/20260914_org_role_registry_base.sql):
 * org_role_base_versions has NO venture_id column at all (structurally impossible to write a
 * venture-scoped row), and its RLS grants are service_role-only.
 *
 * Ignores the `organization` argument entirely -- this checks the live DATABASE schema, not an
 * organization object. Both DB reads are injectable (PLAN-TO-EXEC TESTING review, testability
 * requirement) so an adversarial simulation test can prove the check is not vacuously true (TS-7).
 *
 * column-existence check uses PostgREST error code 42703 (undefined_column) via the standard
 * supabase-js client -- confirmed live during PLAN-TO-EXEC review that a raw information_schema
 * query 404s over PostgREST (PGRST205), so this is the only working REST-reachable check.
 * grant-restriction check uses a raw pg client (scripts/lib/supabase-connection.js) against
 * information_schema.role_table_grants, following this repo's established *.db.test.js pattern.
 */
import { isTestEnvironment } from './_shared.mjs';

export const id = 'integrity-base-immutable';
export const label = 'base-immutable-from-venture-context';

const TABLE = 'org_role_base_versions';

/**
 * EXEC-TO-PLAN SECURITY review finding: previously collapsed "column exists" and "an unrelated
 * error occurred" (e.g. a network/auth failure, not PostgREST's 42703 undefined_column) into the
 * same `false` return -- the check still failed CLOSED (passed:false) either way, but the reason
 * string wrongly claimed "carries a venture_id column" for what could be a transient connectivity
 * error, misleading whoever reads the finding. Now returns which case occurred so the caller can
 * report an accurate reason in both branches.
 */
async function columnAbsent(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return { absent: false, unexpectedError: null }; // no error -- the column exists
  if (error.code === '42703') return { absent: true, unexpectedError: null };
  return { absent: false, unexpectedError: error };
}

async function grantsAreServiceRoleOnly(dbClient, table) {
  const { rows } = await dbClient.query(
    `SELECT grantee, privilege_type FROM information_schema.role_table_grants
     WHERE table_name = $1 AND grantee NOT IN ('service_role', 'postgres', 'supabase_admin')`,
    [table],
  );
  return { ok: rows.length === 0, offendingGrants: rows };
}

/**
 * @param {object} _organization unused -- this check reads the live database, not the org object
 * @param {object} [deps]
 * @param {object} [deps.supabase] injectable supabase-js client, honored ONLY under a test
 *   runner (see ./_shared.mjs) -- defaults to a fresh service-role client everywhere else
 * @param {Function} [deps.createDatabaseClient] injectable raw-pg client factory, same guard
 */
export async function check(_organization, deps = {}) {
  const trustInjectedDeps = isTestEnvironment();

  let supabase = trustInjectedDeps ? deps.supabase : undefined;
  if (!supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  const { absent: noVentureIdColumn, unexpectedError } = await columnAbsent(supabase, TABLE, 'venture_id');
  if (unexpectedError) {
    return { passed: false, reason: `unexpected error probing ${TABLE}.venture_id: ${unexpectedError.code ?? 'no code'} ${unexpectedError.message}` };
  }
  if (!noVentureIdColumn) {
    return { passed: false, reason: `${TABLE} carries a venture_id column -- a venture-scoped write to the base layer is no longer structurally impossible` };
  }

  let createDatabaseClientFn = trustInjectedDeps ? deps.createDatabaseClient : undefined;
  if (!createDatabaseClientFn) {
    ({ createDatabaseClient: createDatabaseClientFn } = await import('../../../../../scripts/lib/supabase-connection.js'));
  }
  const dbClient = await createDatabaseClientFn('engineer', { verify: true });
  try {
    const { ok, offendingGrants } = await grantsAreServiceRoleOnly(dbClient, TABLE);
    if (!ok) {
      return { passed: false, reason: `${TABLE} grants extend beyond service_role: ${JSON.stringify(offendingGrants)}` };
    }
    return { passed: true };
  } finally {
    await dbClient.end();
  }
}
