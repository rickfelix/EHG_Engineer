/**
 * CAS-guarded additive JSONB merge onto quick_fixes.metadata.
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E (Child E).
 *
 * quick_fixes has NO metadata JSONB column in production today — the additive migration
 * (database/chairman-gated/<date>_add_quick_fixes_metadata_column.sql) ships alongside this
 * change but is chairman-gated and unapplied. Every write here MUST degrade fail-soft on
 * Postgres 42703 (undefined_column), and that reason must be DISTINGUISHABLE from a lost
 * compare-and-swap race and from a genuine unexpected error — a blanket catch{return null}
 * (the pattern this module deliberately avoids) makes a "column not there yet" indistinguishable
 * from a real bug, which is unverifiable by construction (testing-agent finding, evidence
 * e21a99e7, TR-3/TR-6).
 *
 * No generic "merge JSONB into quick_fixes" helper exists elsewhere in the repo (Explore
 * evidence 0696b09c) — lib/coordinator/safe-metadata-merge.mjs is strategic_directives_v2-only
 * by design (see its own docblock). This module is quick_fixes' narrow equivalent: it appends
 * ONE claim_history-shaped entry via a single atomic `jsonb_set(... || ...)` UPDATE, guarded by
 * a claiming_session_id compare-and-swap so a claim that has since moved to a different session
 * never has its metadata clobbered by a stale writer.
 *
 * No FIFO cap is enforced here (unlike claim-stamp.cjs's CLAIM_HISTORY_CAP=20 for
 * strategic_directives_v2) — the column does not exist in production yet, so there is no
 * observed uncapped-growth risk to guard against today. Follow-up if/when the migration lands
 * and real volume accrues.
 */
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

/**
 * @param {string} qfId - quick_fixes.id
 * @param {string} sessionId - must match quick_fixes.claiming_session_id (CAS guard)
 * @param {object} entry - the claim_history-shaped entry to append (e.g.
 *   {session_id, claimed_at, identity_source, pick_reason})
 * @returns {Promise<{merged: boolean, reason?: 'column_absent'|'cas_lost'|'connect_failed'|'error', error?: string}>}
 */
export async function mergeQfMetadataKeys(qfId, sessionId, entry) {
  if (!qfId || !sessionId || !entry || typeof entry !== 'object') {
    return { merged: false, reason: 'error', error: 'qfId, sessionId and entry are all required' };
  }
  let client;
  try {
    client = await createDatabaseClient('engineer', { verify: false });
  } catch (connErr) {
    return { merged: false, reason: 'connect_failed', error: connErr.message };
  }
  try {
    // Single atomic statement: read-and-append happens server-side via jsonb_set + `||`, so
    // there is no client-side read-then-write TOCTOU window. The claiming_session_id predicate
    // is the compare-and-swap: zero rows match once the claim has moved to another session.
    const result = await client.query(
      `UPDATE quick_fixes
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{claim_history}',
         COALESCE(metadata->'claim_history', '[]'::jsonb) || $3::jsonb
       )
       WHERE id = $1 AND claiming_session_id = $2`,
      [qfId, sessionId, JSON.stringify([entry])]
    );
    if (result.rowCount === 0) {
      return { merged: false, reason: 'cas_lost' };
    }
    return { merged: true };
  } catch (err) {
    if (err && err.code === '42703') {
      return { merged: false, reason: 'column_absent' };
    }
    return { merged: false, reason: 'error', error: err && err.message };
  } finally {
    try { await client.end(); } catch { /* best-effort close */ }
  }
}
