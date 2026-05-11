/**
 * migration-audit-reader — public read API for schema_migrations_applied.
 *
 * PRD FR-6 / SEC-W4: callers MUST use this module instead of raw table SELECT
 * so that anon/authenticated roles work via the SECURITY DEFINER
 * `public.migration_audit_public_read` function. Service-role callers also use
 * this module for the consumer-contract guarantee (downstream SDs import this
 * helper — see SD-FDBK-INFRA-FIX-PENDING-MIGRATIONS-001).
 *
 * Exported (named):
 *   - listApplied({ since, sincePath, success, limit })
 *   - getLatestSuccessForPath(path)
 *   - hasBeenApplied(path, sha)
 *
 * SD: SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001
 */

import { createClient } from '@supabase/supabase-js';

let _sb = null;
function client() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('migration-audit-reader: SUPABASE_URL + SUPABASE_*_KEY required');
  _sb = createClient(url, key);
  return _sb;
}

/**
 * @param {{since?:string|Date,sincePath?:string,success?:boolean,limit?:number}} opts
 * @returns {Promise<Array<{id:string,migration_path:string,migration_sha256:string,applied_at:string,prod_deploy:boolean,dry_run:boolean,statement_count:number|null,success:boolean,error_truncated:string|null}>>}
 */
export async function listApplied(opts = {}) {
  const { since = null, sincePath = null, success = null, limit = 200 } = opts;
  const sinceParam = since instanceof Date ? since.toISOString() : since;
  const { data, error } = await client().rpc('migration_audit_public_read', {
    p_since: sinceParam,
    p_path: sincePath,
    p_success: success,
    p_limit: Math.min(Math.max(limit | 0, 1), 1000),
  });
  if (error) throw new Error(`migration-audit-reader.listApplied: ${error.message}`);
  return data || [];
}

/**
 * Returns the most-recent successful apply row for the given migration path, or null.
 * @param {string} path
 * @returns {Promise<object|null>}
 */
export async function getLatestSuccessForPath(path) {
  if (!path) throw new Error('getLatestSuccessForPath: path required');
  const rows = await listApplied({ sincePath: path, success: true, limit: 1 });
  return rows[0] || null;
}

/**
 * Returns true iff a successful apply row exists for (path, sha).
 * Used by idempotence check (FR-4): same path + same sha => ALREADY_APPLIED.
 * @param {string} path
 * @param {string} sha
 * @returns {Promise<boolean>}
 */
export async function hasBeenApplied(path, sha) {
  if (!path || !sha) return false;
  const latest = await getLatestSuccessForPath(path);
  return !!latest && latest.migration_sha256 === sha;
}
