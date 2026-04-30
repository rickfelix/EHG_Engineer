/**
 * ColumnExistenceClaimValidator — verifies a brainstorm-cited column exists on a
 * given table. Wraps getTableSchema (schema-validator.js:29) for the 5-min cache.
 *
 * Part of: SD-LEO-INFRA-BRAINSTORM-SOURCE-TRUTH-CHECK-001 (FR-3)
 *
 * Claim shape:
 *   { type: 'column_exists', table: 'brainstorm_sessions', column: 'metadata' }
 *
 * Note: getTableSchema uses supabase.rpc('get_table_schema', ...) which throws on
 * absence in this DB. Falls back to direct probe via .select(column).limit(0).
 */

export const VALIDATOR_ID = 'column-existence-claim-validator';

async function probeColumn(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(0);
  if (!error) return { exists: true };
  if (/column .+? does not exist/i.test(error.message) || /Could not find/i.test(error.message)) {
    return { exists: false, reason: error.message };
  }
  throw error;
}

export async function validate(claim, context = {}) {
  const { table, column } = claim || {};
  if (!table || !column) {
    return {
      passed: false,
      expected: 'claim with table:string and column:string',
      observed: JSON.stringify({ table, column }),
      source_path: null,
      line_number: null,
      severity: 'error',
      remediation_hint: 'Fix claim shape.',
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
      remediation_hint: 'Caller must pass context.supabase.',
      validator_id: VALIDATOR_ID,
    };
  }

  try {
    const { exists, reason } = await probeColumn(context.supabase, table, column);
    return {
      passed: exists,
      expected: `column '${column}' exists on '${table}'`,
      observed: exists ? 'column accessible via .select probe' : `not found: ${reason}`,
      source_path: `information_schema.columns(${table})`,
      line_number: null,
      severity: exists ? 'info' : 'error',
      remediation_hint: exists
        ? null
        : `Brainstorm cites column that does not exist on ${table}. Verify against actual schema or check for renames.`,
      validator_id: VALIDATOR_ID,
    };
  } catch (err) {
    return {
      passed: false,
      expected: `successful column probe on ${table}.${column}`,
      observed: `error: ${err.message}`,
      source_path: `information_schema.columns(${table})`,
      line_number: null,
      severity: 'warning',
      remediation_hint: 'Probe failed for non-schema reason; check Supabase connectivity.',
      validator_id: VALIDATOR_ID,
    };
  }
}

export default { VALIDATOR_ID, validate };
