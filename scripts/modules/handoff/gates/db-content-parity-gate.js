/**
 * DB Content Parity Verification Gate
 * SD: SD-LEO-INFRA-CODE-CONTENT-PARITY-001 (FR-1, FR-3)
 *
 * Reads `metadata.db_content_assertions` from a Strategic Directive row and
 * verifies each declared expectation against the live registry-table row.
 * Fails closed when any assertion mismatches; skips cleanly when no assertions
 * are declared. Persists one row per run to `sd_verification_results` with
 * verification_type='DB_CONTENT_PARITY'.
 *
 * Assertion shape (operator-declared in PRD-author flow):
 *   {
 *     table: <registry-table name from REGISTRY_TABLES>,
 *     row_filter: { col: value, ... },
 *     expected_columns: { col: <literal> | { regex: '<pattern>' }, ... }
 *   }
 *
 * Anti-ReDoS guard (TR-6): regex pattern length ≤ 500; warns when patterns
 * lack start/end anchors when LEO_PARITY_REGEX_REQUIRE_ANCHORS=true.
 */

import { createSupabaseServiceClient } from '../../../../lib/supabase-client.js';
import { isAllowedRegistryTable } from '../../../../lib/db-content-registry-allowlist.js';

const REGEX_MAX_LENGTH = 500;
const ANCHOR_RX = /^\^.*\$$/;

function shapeError(detail, table = null, row_filter = null) {
  return { table, row_filter, column: '__shape_error__', expected: null, actual: detail };
}

function evaluateExpectation(actualValue, expectation) {
  if (expectation && typeof expectation === 'object' && 'regex' in expectation) {
    const pattern = expectation.regex;
    if (typeof pattern !== 'string') {
      return { ok: false, reason: 'regex must be a string' };
    }
    if (pattern.length > REGEX_MAX_LENGTH) {
      return { ok: false, reason: `regex exceeds ${REGEX_MAX_LENGTH}-char cap` };
    }
    if (process.env.LEO_PARITY_REGEX_REQUIRE_ANCHORS === 'true' && !ANCHOR_RX.test(pattern)) {
      return { ok: false, reason: 'regex must be anchored (^...$)' };
    }
    let rx;
    try {
      rx = new RegExp(pattern);
    } catch (e) {
      return { ok: false, reason: `invalid regex: ${e.message}` };
    }
    return { ok: rx.test(String(actualValue ?? '')) };
  }
  return { ok: actualValue === expectation };
}

async function runAssertion(supabase, assertion) {
  if (!assertion || typeof assertion !== 'object') {
    return [shapeError('assertion is not an object')];
  }
  const { table, row_filter, expected_columns } = assertion;
  if (!isAllowedRegistryTable(table)) {
    return [shapeError(`table not in REGISTRY_TABLES: ${String(table)}`, table, row_filter)];
  }
  if (!row_filter || typeof row_filter !== 'object') {
    return [shapeError('row_filter must be an object', table, row_filter)];
  }
  if (!expected_columns || typeof expected_columns !== 'object') {
    return [shapeError('expected_columns must be an object', table, row_filter)];
  }

  let query = supabase.from(table).select(Object.keys(expected_columns).join(', '));
  for (const [col, val] of Object.entries(row_filter)) {
    query = query.eq(col, val);
  }
  const { data, error } = await query.maybeSingle();
  if (error && error.code !== 'PGRST116') {
    return [shapeError(`query failed: ${error.message}`, table, row_filter)];
  }

  const mismatches = [];
  if (!data) {
    for (const [col, expected] of Object.entries(expected_columns)) {
      mismatches.push({ table, row_filter, column: col, expected, actual: null });
    }
    return mismatches;
  }
  for (const [col, expected] of Object.entries(expected_columns)) {
    const actual = data[col];
    const verdict = evaluateExpectation(actual, expected);
    if (!verdict.ok) {
      mismatches.push({ table, row_filter, column: col, expected, actual: actual ?? null });
    }
  }
  return mismatches;
}

/**
 * Validate code-vs-DB content parity for the given SD.
 * @param {string} sdKey - SD key (e.g., SD-LEO-INFRA-CODE-CONTENT-PARITY-001).
 * @param {object} [supabaseClient] - injectable Supabase client for tests.
 * @returns {Promise<{pass: boolean, score: number, mismatches: Array, skipped: boolean, sd_uuid: string|null}>}
 */
export async function validateDbContentParity(sdKey, supabaseClient) {
  const supabase = supabaseClient ?? createSupabaseServiceClient();

  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', sdKey)
    .maybeSingle();

  if (error || !sd) {
    return { pass: false, score: 0, mismatches: [shapeError(`SD lookup failed: ${error?.message || 'not found'}`)], skipped: false, sd_uuid: null };
  }

  const assertions = Array.isArray(sd.metadata?.db_content_assertions) ? sd.metadata.db_content_assertions : [];
  if (assertions.length === 0) {
    await persistResult(supabase, sd.id, { result: 'skip', score: 100, details: { skipped: true, reason: 'no metadata.db_content_assertions' } });
    return { pass: true, score: 100, mismatches: [], skipped: true, sd_uuid: sd.id };
  }

  const allMismatches = [];
  for (const assertion of assertions) {
    const ms = await runAssertion(supabase, assertion);
    if (ms.length) allMismatches.push(...ms);
  }

  const pass = allMismatches.length === 0;
  const score = pass ? 100 : Math.max(0, Math.round((1 - allMismatches.length / assertions.length) * 100));

  await persistResult(supabase, sd.id, {
    result: pass ? 'pass' : 'fail',
    score,
    details: { mismatches: allMismatches, assertion_count: assertions.length },
  });

  return { pass, score, mismatches: allMismatches, skipped: false, sd_uuid: sd.id };
}

async function persistResult(supabase, sdUuid, { result, score, details }) {
  const { error } = await supabase.from('sd_verification_results').insert({
    sd_id: sdUuid,
    verification_type: 'DB_CONTENT_PARITY',
    result,
    score,
    details,
    verified_by: 'DB_CONTENT_PARITY_GATE',
  });
  if (error) {
    console.warn(`[db-content-parity] sd_verification_results insert failed: ${error.message}`);
  }
}

export function createDbContentParityGate() {
  return {
    name: 'DB_CONTENT_PARITY',
    validator: async (ctx) => {
      const sdKey = ctx.sdKey || ctx.sdId;
      const result = await validateDbContentParity(sdKey);
      const mismatchSummaries = result.mismatches.map(
        (m) => `${m.table || '?'} WHERE ${JSON.stringify(m.row_filter || {})}: column=${m.column} expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`
      );
      return {
        pass: result.pass,
        score: result.score,
        issues: result.pass ? [] : mismatchSummaries,
        warnings: [],
        skipped: result.skipped,
      };
    },
    required: true,
    blocking: true,
    remediation: 'Migrate the named registry-table row(s) to match the code expectations declared in metadata.db_content_assertions, then re-run /leo complete. Bypass with --bypass-validation --bypass-reason "<ticket>" if migration cannot be applied immediately.',
  };
}

export { evaluateExpectation, runAssertion, shapeError };
