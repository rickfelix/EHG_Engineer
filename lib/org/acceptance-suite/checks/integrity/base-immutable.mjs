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
export const id = 'integrity-base-immutable';
export const label = 'base-immutable-from-venture-context';

const TABLE = 'org_role_base_versions';

async function columnAbsent(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return false; // no error -- the column exists (select succeeded)
  return error.code === '42703';
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
 * @param {object} [deps.supabase] injectable supabase-js client (defaults to a fresh service-role client)
 * @param {Function} [deps.createDatabaseClient] injectable raw-pg client factory
 */
export async function check(_organization, deps = {}) {
  let supabase = deps.supabase;
  if (!supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  const noVentureIdColumn = await columnAbsent(supabase, TABLE, 'venture_id');
  if (!noVentureIdColumn) {
    return { passed: false, reason: `${TABLE} carries a venture_id column -- a venture-scoped write to the base layer is no longer structurally impossible` };
  }

  let createDatabaseClientFn = deps.createDatabaseClient;
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
