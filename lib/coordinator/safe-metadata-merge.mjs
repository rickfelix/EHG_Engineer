/**
 * lib/coordinator/safe-metadata-merge.mjs — QF-20260720-597.
 *
 * Shared ATOMIC JSONB partial-merge helper for strategic_directives_v2.metadata writes.
 * Exists so future metadata stampers (Adam's ad-hoc passes, dispatch.cjs's audit-trail
 * writes, any future tooling) cannot reintroduce the read-spread-write anti-pattern that
 * silently RESURRECTS a concurrently-cleared coordinator hold flag (needs_coordinator_review,
 * requires_human_action) from a stale snapshot — the flag reads false at write time but the
 * write still lands with a full-blob overwrite of an OLDER metadata copy. Live near-miss:
 * an Adam LEO name-stamp pass (RCA a4587e48, Solomon advisory a91b0569); verified NO
 * resurrection occurred that time, but the pattern is unsafe by construction. Exemplar fix:
 * lib/coordinator/clear-coordinator-review.js (documents a prior REAL "RE-FENCE #3").
 *
 * mergeMetadataKeys(sdKey, patch) writes ONLY the keys present in `patch` via a Postgres
 * JSONB `||` merge — every OTHER key (including any hold flag a concurrent process just
 * cleared) is left completely untouched by this write, eliminating the read-then-write
 * TOCTOU race a `.update({ metadata: { ...spread, ...patch } })` full-blob write has by
 * construction. supabase-js's `.update()` cannot express a JSONB `||` merge directly, so
 * this goes through the raw pg connection (same seam clear-coordinator-review.js uses).
 */
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

/**
 * @param {string} sdKey
 * @param {object} patch - plain, JSON-serializable object of ONLY the keys to set/overwrite.
 *   A nested object REPLACES (not deep-merges) the corresponding top-level key — the same
 *   semantics as Postgres jsonb `||`.
 * @param {object} [opts]
 * @param {Function} [opts.createClientFn] test-injection seam (defaults to createDatabaseClient)
 * @returns {Promise<{merged: boolean, sdKey: string, error?: string}>}
 */
export async function mergeMetadataKeys(sdKey, patch, opts = {}) {
  if (!sdKey || typeof sdKey !== 'string') {
    throw new Error('mergeMetadataKeys: sdKey is required');
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('mergeMetadataKeys: patch must be a plain object');
  }
  const { createClientFn = createDatabaseClient } = opts;

  let client;
  try {
    client = await createClientFn('engineer', { verify: false });
  } catch (connErr) {
    return { merged: false, sdKey, error: `db_connect_failed: ${connErr.message}` };
  }

  try {
    // COALESCE guards a SQL-NULL metadata column (NULL::jsonb || x evaluates to NULL in
    // Postgres — see clear-coordinator-review.js's identical guard) from silently wiping
    // the whole blob on a row whose metadata has never been set.
    const result = await client.query(
      `UPDATE strategic_directives_v2
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE sd_key = $1`,
      [sdKey, JSON.stringify(patch)]
    );
    return { merged: result.rowCount > 0, sdKey };
  } catch (queryErr) {
    return { merged: false, sdKey, error: queryErr.message };
  } finally {
    try { await client.end(); } catch { /* best-effort close */ }
  }
}
