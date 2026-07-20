/**
 * lib/fleet/attention-flag-writer.js — SD-LEO-INFRA-FLEET-VIEW-BADGES-001 (FR-3).
 *
 * DB-only "attention" flag on claude_sessions.metadata: a session that needs an operator's
 * eyes gets an atomic-merge stamp here, and printAttentionStrip() (scripts/fleet-dashboard.cjs)
 * renders it read-only. Zero notification/SMS/email call in this module by design — the
 * existing Adam advisory inbox lane is the sole consumer that acts on a flagged session.
 *
 * Uses an ATOMIC JSONB partial merge (metadata || '{...}'::jsonb) via the raw pg client,
 * the SAME seam lib/coordinator/clear-coordinator-review.js / lib/coordinator/safe-metadata-merge.mjs
 * use — NOT a fresh-read-then-full-blob-write (that pattern was found to still race under a
 * concurrent writer; see QF-20260720-597 / the harness-bug filed against
 * lib/fleet/exec-boundary-hold-writer.js during this SD's build). Keyed on claude_sessions.session_id
 * rather than strategic_directives_v2.sd_key since "attention" is a session-level condition,
 * distinct from the existing SD-level hold flags (needs_coordinator_review, exec_boundary_hold).
 */
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

/**
 * Set metadata.attention=true + reason on a session, via atomic merge.
 * @param {string} sessionId
 * @param {{reason: string}} stamp
 * @param {{createClientFn?: Function}} [opts]
 * @returns {Promise<{flagged: boolean, sessionId: string, error?: string}>}
 */
export async function setSessionAttention(sessionId, { reason } = {}, opts = {}) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('setSessionAttention: sessionId is required');
  }
  if (!reason || typeof reason !== 'string') {
    throw new Error('setSessionAttention: reason is required');
  }
  const { createClientFn = createDatabaseClient } = opts;

  let client;
  try {
    client = await createClientFn('engineer', { verify: false });
  } catch (connErr) {
    return { flagged: false, sessionId, error: `db_connect_failed: ${connErr.message}` };
  }

  try {
    const patch = { attention: true, attention_reason: reason, attention_set_at: new Date().toISOString() };
    const result = await client.query(
      `UPDATE claude_sessions
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE session_id = $1`,
      [sessionId, JSON.stringify(patch)]
    );
    return { flagged: result.rowCount > 0, sessionId };
  } catch (queryErr) {
    return { flagged: false, sessionId, error: queryErr.message };
  } finally {
    try { await client.end(); } catch { /* best-effort close */ }
  }
}

/**
 * Clear metadata.attention for a session, via atomic merge.
 * @param {string} sessionId
 * @param {{clearedBy: string}} opts0
 * @param {{createClientFn?: Function}} [opts]
 * @returns {Promise<{cleared: boolean, sessionId: string, error?: string}>}
 */
export async function clearSessionAttention(sessionId, { clearedBy } = {}, opts = {}) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('clearSessionAttention: sessionId is required');
  }
  if (!clearedBy || typeof clearedBy !== 'string') {
    throw new Error('clearSessionAttention: clearedBy is required');
  }
  const { createClientFn = createDatabaseClient } = opts;

  let client;
  try {
    client = await createClientFn('engineer', { verify: false });
  } catch (connErr) {
    return { cleared: false, sessionId, error: `db_connect_failed: ${connErr.message}` };
  }

  try {
    const patch = { attention: false, attention_cleared_at: new Date().toISOString(), attention_cleared_by: clearedBy };
    const result = await client.query(
      `UPDATE claude_sessions
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE session_id = $1`,
      [sessionId, JSON.stringify(patch)]
    );
    return { cleared: result.rowCount > 0, sessionId };
  } catch (queryErr) {
    return { cleared: false, sessionId, error: queryErr.message };
  } finally {
    try { await client.end(); } catch { /* best-effort close */ }
  }
}

/**
 * Read-only: sessions currently flagged for attention. Never mutates.
 * @param {{supabase: import('@supabase/supabase-js').SupabaseClient}} opts
 * @returns {Promise<Array<{session_id: string, reason: string, set_at: string}>>}
 */
export async function getAttentionFlaggedSessions({ supabase }) {
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('session_id, metadata')
    .eq('metadata->>attention', 'true');
  if (error || !data) return [];
  return data.map((row) => ({
    session_id: row.session_id,
    reason: row.metadata?.attention_reason || null,
    set_at: row.metadata?.attention_set_at || null,
  }));
}
