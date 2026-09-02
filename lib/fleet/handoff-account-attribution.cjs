// SD-FDBK-INFRA-SESSION-NAMED-ACCOUNT-001 FR-4: attribute completed handoffs to a named account.
//
// leo_handoff_executions.created_by IS the executing session's CLAUDE_SESSION_ID (confirmed live
// on this SD's own handoff rows during LEAD). claude_sessions.metadata carries the account
// identity FR-1/FR-2/FR-3 now stamp reliably (account_uuid8, account_org_name, account_email,
// account_auth_method, launch_profile_expected). This module is the read-only join between them.
//
// Postgrest/Supabase has no cross-table JOIN in a single call from this client, so the join is
// done in application code: fetch the handoffs, collect their distinct session ids, fetch those
// sessions' metadata, then merge. Read-only throughout -- never writes to either table (TR-2).

'use strict';

/**
 * @param {object} supabase a Supabase client
 * @param {object} [opts]
 * @param {string} [opts.sdId] restrict to one SD's handoffs
 * @param {string} [opts.status='accepted'] handoff status to count as "completed"
 * @param {string} [opts.since] ISO timestamp lower bound on created_at
 * @returns {Promise<{rows: Array<{handoff_id:string, sd_id:string, handoff_type:string, session_id:string, account_uuid8:string|null, account_org_name:string|null, account_email:string|null, source:'measured'|'host_default'|'unattributed'}>, error: string|null}>}
 *   Never throws. On any failure, returns { rows: [], error: <message> } rather than a partial
 *   or fabricated result.
 */
async function computeHandoffsByAccount(supabase, opts = {}) {
  try {
    const status = opts.status || 'accepted';
    let query = supabase
      .from('leo_handoff_executions')
      .select('id, sd_id, handoff_type, created_by, created_at')
      .eq('status', status);
    if (opts.sdId) query = query.eq('sd_id', opts.sdId);
    if (opts.since) query = query.gte('created_at', opts.since);

    const { data: handoffs, error: handoffErr } = await query;
    if (handoffErr) return { rows: [], error: handoffErr.message || String(handoffErr) };
    if (!handoffs || handoffs.length === 0) return { rows: [], error: null };

    const sessionIds = [...new Set(handoffs.map((h) => h.created_by).filter(Boolean))];
    if (sessionIds.length === 0) return { rows: [], error: null };

    const { data: sessions, error: sessionErr } = await supabase
      .from('claude_sessions')
      .select('session_id, metadata')
      .in('session_id', sessionIds);
    if (sessionErr) return { rows: [], error: sessionErr.message || String(sessionErr) };

    const bySession = new Map((sessions || []).map((s) => [s.session_id, s.metadata || {}]));

    const rows = handoffs.map((h) => {
      const meta = bySession.get(h.created_by) || {};
      // FR-1/coordinator ruling 1cbade73: a host-default-sourced identity must never be presented
      // as a measured per-profile attribution without this label traveling with it.
      let source = 'unattributed';
      if (meta.account_uuid8) {
        source = meta.account_auth_method === 'host_default' ? 'host_default' : 'measured';
      }
      return {
        handoff_id: h.id,
        sd_id: h.sd_id,
        handoff_type: h.handoff_type,
        session_id: h.created_by,
        account_uuid8: meta.account_uuid8 || null,
        account_org_name: meta.account_org_name || null,
        account_email: meta.account_email || null,
        source,
      };
    });

    return { rows, error: null };
  } catch (err) {
    return { rows: [], error: (err && err.message) || String(err) };
  }
}

/**
 * Group computeHandoffsByAccount()'s rows into a per-account handoff count. Rows with
 * source='unattributed' are counted separately under the null key rather than silently dropped
 * or merged into a real account.
 * @param {Array} rows from computeHandoffsByAccount
 * @returns {Array<{account_uuid8: string|null, account_org_name: string|null, source: string|null, completed_handoffs: number}>}
 */
function summarizeByAccount(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.account_uuid8 || ''}::${r.source}`;
    if (!groups.has(key)) {
      groups.set(key, {
        account_uuid8: r.account_uuid8,
        account_org_name: r.account_org_name,
        source: r.source,
        completed_handoffs: 0,
      });
    }
    groups.get(key).completed_handoffs += 1;
  }
  return [...groups.values()];
}

module.exports = { computeHandoffsByAccount, summarizeByAccount };
