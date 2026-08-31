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
import { getRepoRoot } from './repo-paths.js';

/**
 * SD-LEO-INFRA-COMPLETION-GATE-DATA-001-A FR-2: normalize a migration path to a
 * REPO-RELATIVE POSIX comparison key.
 *
 * schema_migrations_applied.migration_path can be recorded as an absolute Windows
 * worktree path (e.g. `C:\Users\...\database\migrations\20260829_x.sql`) while
 * completion-migration-gate.js's evaluateMigrationGate compares repo-relative POSIX
 * paths (e.g. `database/migrations/20260829_x.sql`) — a raw `===` comparison never
 * matches even for a genuinely-applied migration.
 *
 * EXACT MATCHING CONTRACT (basename is explicitly too weak — same-named files under
 * different directories, e.g. database/migrations/ vs database/chairman-gated/, would
 * collide): normalize by (a) stripping a recognized worktree-root prefix, resolved via
 * this codebase's existing repo-root-detection helper (getRepoRoot(), lib/repo-paths.js
 * — never a hardcoded string), and (b) converting all separators to POSIX
 * forward-slashes, WITHOUT collapsing the subdirectory — so the key preserves
 * `migrations/` vs `chairman-gated/` as a collision guard.
 *
 * Pure comparison-key normalization: an input already repo-relative-POSIX passes
 * through unchanged (no behavior change for already-correctly-formatted paths).
 *
 * @param {string} inputPath
 * @returns {string} normalized comparison key (unchanged input when falsy)
 */
export function normalizeMigrationPath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return inputPath;
  let p = inputPath.replace(/\\/g, '/');
  const root = getRepoRoot().replace(/\\/g, '/');
  if (p === root) return '';
  if (p.startsWith(`${root}/`)) {
    p = p.slice(root.length + 1);
  }
  return p;
}

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
 *
 * FR-2: primary comparison normalizes BOTH sides via normalizeMigrationPath() so an
 * absolute-Windows-path-recorded row still matches a repo-relative-POSIX `path` argument
 * (and vice versa), scanning up to 1000 recent successful-apply rows client-side (the
 * RPC's p_path filter is an exact server-side match and cannot itself normalize).
 * ROLLBACK SAFETY (FR-2): if the normalized comparison finds no match, falls back to the
 * ORIGINAL unnormalized exact-match RPC call before concluding not-applied — this fix can
 * only ADD matches, never remove a previously-working one.
 *
 * @param {string} path
 * @returns {Promise<object|null>}
 */
export async function getLatestSuccessForPath(path) {
  if (!path) throw new Error('getLatestSuccessForPath: path required');

  const normalizedTarget = normalizeMigrationPath(path);
  const candidates = await listApplied({ success: true, limit: 1000 });
  const normalizedMatches = candidates.filter(
    (r) => normalizeMigrationPath(r.migration_path) === normalizedTarget
  );
  if (normalizedMatches.length > 0) {
    return normalizedMatches.sort(
      (a, b) => new Date(b.applied_at) - new Date(a.applied_at)
    )[0];
  }

  // Fallback: original unnormalized exact-match comparison (pre-FR-2 behavior).
  const rawRows = await listApplied({ sincePath: path, success: true, limit: 1 });
  return rawRows[0] || null;
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
