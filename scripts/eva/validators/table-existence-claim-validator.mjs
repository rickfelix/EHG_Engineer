/**
 * TableExistenceClaimValidator — verifies a brainstorm-cited table exists in the live
 * Supabase database. Wraps verifyTablesExist (database-fidelity.js:237) — does not
 * reimplement.
 *
 * Part of: SD-LEO-INFRA-BRAINSTORM-SOURCE-TRUTH-CHECK-001 (FR-3)
 *
 * Claim shape:
 *   { type: 'table_exists', table: 'brainstorm_sessions' }
 *
 * Note: verifyTablesExist calls supabase.rpc('execute_sql', ...) first; this RPC is
 * NOT defined on the EHG_Engineer DB, so it falls through to a direct
 * .from(table).select('*').limit(0) probe — fallback works on every call. Documented
 * in module header so future maintainers don't 'fix' the rpc path.
 */

import { verifyTablesExist } from '../../modules/implementation-fidelity/sections/database-fidelity.js';

export const VALIDATOR_ID = 'table-existence-claim-validator';

export async function validate(claim, context = {}) {
  const table = claim?.table;
  if (!table || typeof table !== 'string') {
    return {
      passed: false,
      expected: 'claim with table:string',
      observed: typeof table,
      source_path: null,
      line_number: null,
      severity: 'error',
      remediation_hint: 'Fix claim shape; brainstorm should cite the exact table name.',
      validator_id: VALIDATOR_ID,
    };
  }
  if (!context?.supabase) {
    return {
      passed: false,
      expected: 'supabase client in context.supabase',
      observed: 'missing',
      source_path: null,
      line_number: null,
      severity: 'error',
      remediation_hint: 'Caller must pass context.supabase (createSupabaseServiceClient).',
      validator_id: VALIDATOR_ID,
    };
  }

  try {
    const { found, missing } = await verifyTablesExist([table.toLowerCase()], context.supabase);
    const passed = found.includes(table.toLowerCase());
    return {
      passed,
      expected: `table '${table}' exists in public schema`,
      observed: passed
        ? `found in information_schema (or fallback probe succeeded)`
        : `not found (missing list: ${missing.join(', ') || '[]'})`,
      source_path: 'information_schema.tables',
      line_number: null,
      severity: passed ? 'info' : 'error',
      remediation_hint: passed
        ? null
        : `Brainstorm cites table that does not exist. Either (a) brainstorm is wrong, or (b) migration adding this table has not run. Check database/migrations/.`,
      validator_id: VALIDATOR_ID,
    };
  } catch (err) {
    return {
      passed: false,
      expected: `successful introspection for '${table}'`,
      observed: `error: ${err.message}`,
      source_path: 'information_schema.tables',
      line_number: null,
      severity: 'warning',
      remediation_hint: 'Introspection failed; not a brainstorm error. Check Supabase connectivity.',
      validator_id: VALIDATOR_ID,
    };
  }
}

export default { VALIDATOR_ID, validate };
