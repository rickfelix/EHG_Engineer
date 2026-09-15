/**
 * A2 integrity check (SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001, FR-4): "norms unwritable
 * by agents". Pins an already-live schema fact from SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001
 * (database/chairman-gated/20260914_org_role_registry_overlay_pin.sql): org_role_venture_overlays
 * has NO norms column at all, so no venture-scoped write path can reach it regardless of code
 * path.
 *
 * Ignores the `organization` argument entirely -- this checks the live DATABASE schema. Uses the
 * PostgREST error code 42703 (undefined_column) pattern confirmed live during PLAN-TO-EXEC review
 * (a raw information_schema query 404s over PostgREST).
 */
import { isTestEnvironment } from './_shared.mjs';

export const id = 'integrity-norms-unwritable';
export const label = 'norms-unwritable-by-agents';

const TABLE = 'org_role_venture_overlays';

/**
 * @param {object} _organization unused -- this check reads the live database, not the org object
 * @param {object} [deps]
 * @param {object} [deps.supabase] injectable supabase-js client, honored ONLY under a test
 *   runner (see ./_shared.mjs) -- defaults to a fresh service-role client everywhere else
 */
export async function check(_organization, deps = {}) {
  let supabase = isTestEnvironment() ? deps.supabase : undefined;
  if (!supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  const { error } = await supabase.from(TABLE).select('norms').limit(1);
  if (!error) {
    return { passed: false, reason: `${TABLE} carries a norms column -- a venture-scoped write path can now reach norms` };
  }
  if (error.code !== '42703') {
    return { passed: false, reason: `unexpected error probing ${TABLE}.norms: ${error.code} ${error.message}` };
  }
  return { passed: true };
}
