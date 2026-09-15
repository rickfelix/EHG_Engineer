/**
 * Continuous external-surface checker — SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001.
 *
 * Executes chairman ratification 030d72e8 ("Yes to both"): a migration-apply-time check that
 * nothing in the public (anon-exposed) schema answers the anonymous Supabase key outside a
 * chairman-owned allowlist. Extends scripts/sentinels/audit-security-linter.mjs's proven
 * direct-pg-connection pattern with the two capabilities that sentinel explicitly lacks:
 *
 *   1. A GENUINE anonymous-role read attempt (via the real anon key through PostgREST/
 *      supabase-js), not grants/RLS-state catalog inference alone. Catalog inference alone
 *      would miss a table with RLS ENABLED but a permissive anon policy (`USING (true)`) --
 *      audit-security-linter.mjs's rls_disabled_in_public check only fires when RLS is fully
 *      OFF, so a permissive-policy table reads as clean to it. This checker complements that
 *      catalog signal with a live read, catching that exact gap.
 *   2. A POSITIVE canary read (public_surface_canary, exactly one permanently-public row) that
 *      must succeed BEFORE any "clean" verdict is trusted -- so a bad anon key, a dead
 *      connection, or a no-op query can never silently render as "nothing exposed."
 *
 * LIVE-READ AMBIGUITY (documented, not hidden): PostgREST returns HTTP 200 + `data: []` for
 * BOTH "table is genuinely empty" and "RLS silently filtered every row" -- there is no error to
 * distinguish them. A live read alone therefore cannot prove exposure on an empty table. This
 * checker closes that gap by cross-checking the catalog signal (has_table_privilege('anon',
 * ..., 'SELECT') AND relrowsecurity = false) for any table whose live read comes back empty:
 * grant-present + RLS-disabled + empty-live-read is still a genuine finding (an unprotected
 * table that merely has zero rows right now), while grant-present + RLS-ENABLED + empty-live-read
 * is treated as checked-clean (the live read is the only reliable evidence once RLS is on, and
 * it found nothing).
 *
 * FR-7 (semantic-shape classifier, never name-matching): classifyApproval() reads the ONE
 * declared verdict field the allowlist schema defines (approved_at, a genuine timestamp) --
 * it never scans for key NAMES like "hold"/"fence"/"lock" to infer meaning, so an unrelated
 * governance record sitting near an allowlist row can never be misread as an approval, and an
 * unconventionally-named field on a genuine approval row never prevents recognizing it.
 */

import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { createClient } from '@supabase/supabase-js';

export const ALLOWLIST_TABLE = 'public_read_allowlist';
export const CANARY_TABLE = 'public_surface_canary';

/**
 * Every public-schema base table/partition, with the two catalog signals used to
 * disambiguate an empty live read (has_table_privilege -- never proacl text matching, see
 * lib/security/pg-net-exposure.js's header for why) and a best-effort per-venture scope tag.
 */
export const ENUMERATE_PUBLIC_TABLES_SQL = `
  SELECT c.relname AS name,
         c.relrowsecurity AS rls_enabled,
         has_table_privilege('anon', c.oid, 'SELECT') AS anon_select_grant,
         EXISTS (
           SELECT 1 FROM information_schema.columns col
           WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'venture_id'
         ) AS has_venture_id
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  ORDER BY 1`;

export const ALLOWLIST_SELECT_SQL =
  `SELECT table_name, reason, approved_by, approved_at, ratification_ref FROM public.${ALLOWLIST_TABLE} ORDER BY 1`;

/**
 * FR-7: is this record a genuine chairman approval? Reads approved_at's SHAPE (a parseable,
 * non-null timestamp) -- the allowlist table's own declared contract (FR-1) -- and nothing
 * else. Deliberately does NOT inspect any other key on the record, by name or otherwise, so a
 * record carrying additional unrelated fields (differently-named, hold/fence-shaped, or not)
 * can never flip this verdict.
 *
 * @param {object} record
 * @returns {{approved: boolean, reason: string, approvedAt?: string}}
 */
export function classifyApproval(record) {
  if (!record || typeof record !== 'object') return { approved: false, reason: 'not_a_record' };
  const approvedAt = record.approved_at;
  if (approvedAt === undefined || approvedAt === null || approvedAt === '') {
    return { approved: false, reason: 'no_approved_at' };
  }
  const parsed = new Date(approvedAt);
  if (Number.isNaN(parsed.getTime())) {
    return { approved: false, reason: 'approved_at_unparseable' };
  }
  return { approved: true, reason: 'approved_at_present', approvedAt: parsed.toISOString() };
}

/**
 * Classifies one live PostgREST/supabase-js read result into a 4-way verdict.
 * EXPOSED   -- no error, >=1 row returned: definitive.
 * EMPTY     -- no error, 0 rows: ambiguous alone (see module header), resolved by the caller
 *              via the catalog cross-check.
 * PROTECTED -- an error shaped like a permission/RLS denial: genuinely checked-clean.
 * UNREACHABLE -- any other error (network, timeout, unexpected shape): coverage gap, not a
 *              clean verdict and not a finding.
 */
function classifyLiveRead({ error, data } = {}) {
  if (!error) {
    return Array.isArray(data) && data.length > 0 ? 'EXPOSED' : 'EMPTY';
  }
  const status = String(error.code ?? error.status ?? '');
  const message = String(error.message || '').toLowerCase();
  const deniedShape = ['42501', 'PGRST301', 'PGRST116'].includes(status)
    || message.includes('permission denied')
    || message.includes('row-level security')
    || message.includes('rls');
  return deniedShape ? 'PROTECTED' : 'UNREACHABLE';
}

/**
 * @param {{connect?: Function|object, anonClient?: Function|object}} [opts]
 *   connect: injectable direct-pg client factory (or an already-open client), overriding the
 *     default createDatabaseClient('engineer') call -- mirrors audit-security-linter.mjs /
 *     pg-net-exposure.js's own `connect` injection point.
 *   anonClient: injectable anon-role supabase-js client (or a factory), overriding the default
 *     createClient(SUPABASE_URL, SUPABASE_ANON_KEY) -- the genuine anon-role read path.
 * @returns {Promise<{verdict: 'PASS'|'FINDINGS'|'ERROR', reason?: string, findings: Array,
 *   coverage: object|null}>}
 */
export async function runContinuousExternalSurfaceCheck({ connect, anonClient } = {}) {
  const openPg = connect || (() => createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
  }));
  const openAnon = anonClient || (() => {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL/SUPABASE_ANON_KEY not configured');
    return createClient(url, key);
  });

  const errorResult = (reason) => ({ verdict: 'ERROR', reason, findings: [], coverage: null });

  let pg;
  try {
    pg = typeof openPg === 'function' ? await openPg() : openPg;
  } catch (e) {
    return errorResult(`catalog connection unavailable: ${e.message}`);
  }
  if (!pg || typeof pg.query !== 'function') {
    return errorResult('catalog connection unavailable: no usable client returned');
  }

  let anon;
  try {
    anon = typeof openAnon === 'function' ? await openAnon() : openAnon;
  } catch (e) {
    if (typeof pg.end === 'function') await pg.end();
    return errorResult(`anon client unavailable: ${e.message}`);
  }
  if (!anon || typeof anon.from !== 'function') {
    if (typeof pg.end === 'function') await pg.end();
    return errorResult('anon client unavailable: no usable client returned');
  }

  try {
    const tablesRes = await pg.query(ENUMERATE_PUBLIC_TABLES_SQL);
    if (!tablesRes || !Array.isArray(tablesRes.rows)) {
      return errorResult('catalog query returned an uninterpretable payload for table enumeration');
    }

    let allowlistRows = [];
    try {
      const allowRes = await pg.query(ALLOWLIST_SELECT_SQL);
      allowlistRows = Array.isArray(allowRes?.rows) ? allowRes.rows : [];
    } catch (e) {
      return errorResult(`allowlist table unreadable: ${e.message}`);
    }
    const allowedNames = new Set(
      allowlistRows.filter((r) => classifyApproval(r).approved).map((r) => r.table_name)
    );

    // FR-3: the positive canary gates trust in everything below. It must read as EXPOSED, or
    // this entire run is VOID -- never a silent "nothing exposed."
    const canaryRead = await anon.from(CANARY_TABLE).select('*').limit(1);
    const canaryVerdict = classifyLiveRead(canaryRead);
    if (canaryVerdict !== 'EXPOSED') {
      return errorResult(`positive canary did not read as exposed (verdict=${canaryVerdict}) -- the check cannot be trusted this run`);
    }

    const findings = [];
    const unreachable = [];
    let checked = 0;
    let allowlisted = 0;

    for (const row of tablesRes.rows) {
      const name = row.name;
      if (name === CANARY_TABLE || name === ALLOWLIST_TABLE) continue;
      if (allowedNames.has(name)) { allowlisted++; continue; }

      checked++;
      const liveRead = await anon.from(name).select('*').limit(1);
      const liveVerdict = classifyLiveRead(liveRead);

      if (liveVerdict === 'EXPOSED') {
        findings.push({ table: name, evidence: 'live_anon_read_returned_rows', has_venture_id: !!row.has_venture_id });
      } else if (liveVerdict === 'EMPTY' && row.anon_select_grant && !row.rls_enabled) {
        findings.push({ table: name, evidence: 'catalog_confirmed_grant_and_rls_disabled_live_read_empty', has_venture_id: !!row.has_venture_id });
      } else if (liveVerdict === 'UNREACHABLE') {
        unreachable.push({ table: name, reason: liveRead?.error?.message || 'unknown' });
      }
      // PROTECTED, and catalog-clean EMPTY (RLS enabled, live read found nothing), are neither
      // findings nor unreachable -- genuinely checked-clean.
    }

    return {
      verdict: findings.length > 0 ? 'FINDINGS' : 'PASS',
      findings,
      coverage: {
        enumerated: tablesRes.rows.length,
        checked,
        allowlisted,
        unreachable,
        scope: 'shared_platform_db_per_venture_id_column_where_applicable',
      },
    };
  } finally {
    if (typeof pg.end === 'function') await pg.end();
  }
}
