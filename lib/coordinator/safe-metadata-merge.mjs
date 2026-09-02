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
 *
 * QF-20260902-928 (Solomon CAPA 9d8d34b3 CA-11): opt-in {writer, reason} provenance. When
 * BOTH opts.writer and opts.reason are supplied, the merge additionally stamps
 * metadata.last_metadata_write {writer, reason, at, keys} and inserts one audit_log row.
 * Deliberately opt-in, not a hard refuse without them: mergeMetadataKeys has 9 live
 * production call sites today, none of which pass writer/reason yet (measured at fix time)
 * — hard-refusing an unlabeled call would break drift-guard bookkeeping, hold/unfence
 * flows, and dispatch's own audit trail immediately. Migrating every existing caller to a
 * genuine, per-call writer/reason (not a placeholder, which would recreate the exact
 * blindness this fix exists to close) is a separate, larger follow-up.
 */
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import {
  checkDeciderPairing, isHumanActionRequested, namedDecider,
} from '../governance/human-action-decider.mjs';

/**
 * @param {string} sdKey
 * @param {object} patch - plain, JSON-serializable object of ONLY the keys to set/overwrite.
 *   A nested object REPLACES (not deep-merges) the corresponding top-level key — the same
 *   semantics as Postgres jsonb `||`.
 * @param {object} [opts]
 * @param {Function} [opts.createClientFn] test-injection seam (defaults to createDatabaseClient)
 * @param {string} [opts.writer] identity of the calling module/script (e.g. 'hold-writer').
 *   Providing writer WITHOUT reason (or vice versa) is refused — partial provenance is worse
 *   than none, since it reads as audited without actually being reconstructable.
 * @param {string} [opts.reason] human-readable reason for this specific write.
 * @returns {Promise<{merged: boolean, sdKey: string, error?: string}>}
 */
export async function mergeMetadataKeys(sdKey, patch, opts = {}) {
  if (!sdKey || typeof sdKey !== 'string') {
    throw new Error('mergeMetadataKeys: sdKey is required');
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('mergeMetadataKeys: patch must be a plain object');
  }
  const { createClientFn = createDatabaseClient, writer, reason } = opts;
  const hasWriter = typeof writer === 'string' && writer.length > 0;
  const hasReason = typeof reason === 'string' && reason.length > 0;
  if (hasWriter !== hasReason) {
    return { merged: false, sdKey, error: 'writer_and_reason_must_both_be_present_or_both_absent' };
  }
  const provenance = hasWriter ? { writer, reason } : null;

  let client;
  try {
    client = await createClientFn('engineer', { verify: false });
  } catch (connErr) {
    return { merged: false, sdKey, error: `db_connect_failed: ${connErr.message}` };
  }

  try {
    // QF-20260727-858: requires_human_action=true must name a decider. This helper is the
    // canonical chokepoint for hold-flag writes (see docblock above — it exists precisely to stop
    // future stampers reintroducing an unsafe hold-flag write), so the pairing rule belongs here
    // rather than in each caller. Only a patch that TURNS THE FLAG ON is constrained; the row's
    // existing decider satisfies it, so re-stamping an already-routed row is unaffected.
    if (isHumanActionRequested(patch.requires_human_action) && !namedDecider(patch)) {
      const { rows } = await client.query(
        'SELECT metadata FROM strategic_directives_v2 WHERE sd_key = $1',
        [sdKey],
      );
      const verdict = checkDeciderPairing(patch, rows?.[0]?.metadata || null);
      if (!verdict.ok) return { merged: false, sdKey, error: verdict.reason };
    }

    const now = new Date().toISOString();
    const writePatch = provenance
      ? { ...patch, last_metadata_write: { writer: provenance.writer, reason: provenance.reason, at: now, keys: Object.keys(patch) } }
      : patch;

    // COALESCE guards a SQL-NULL metadata column (NULL::jsonb || x evaluates to NULL in
    // Postgres — see clear-coordinator-review.js's identical guard) from silently wiping
    // the whole blob on a row whose metadata has never been set.
    const result = await client.query(
      `UPDATE strategic_directives_v2
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE sd_key = $1`,
      [sdKey, JSON.stringify(writePatch)]
    );
    const merged = result.rowCount > 0;
    if (merged && provenance) {
      // Fail-open: the metadata write already landed; an audit-table hiccup must never undo
      // or fail the caller's write.
      try {
        await client.query(
          `INSERT INTO audit_log (event_type, entity_type, entity_id, new_value, metadata, severity, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            'sd_metadata_merge', 'strategic_directive', sdKey,
            JSON.stringify(patch),
            JSON.stringify({ writer: provenance.writer, reason: provenance.reason, keys: Object.keys(patch) }),
            'info', provenance.writer,
          ]
        );
      } catch { /* best-effort — the merge itself already succeeded */ }
    }
    return { merged, sdKey };
  } catch (queryErr) {
    return { merged: false, sdKey, error: queryErr.message };
  } finally {
    try { await client.end(); } catch { /* best-effort close */ }
  }
}
