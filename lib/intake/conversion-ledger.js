/**
 * Conversion Ledger — service-role intake ledger.
 * SD-LEO-INFRA-UNIFY-INTAKE-POOLS-001 (FR-2)
 *
 * One ledger normalizing the 3 intake pools. registerItem is idempotent on
 * (source_pool, source_id); setDisposition moves an item to a terminal state;
 * backlogDepth is a single query (disposition IS NULL). Source rows in the
 * origin pools are NEVER deleted — the drain only status-updates them.
 *
 * The supabase client is injectable so the unit tests run with a mock.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

let _defaultClient = null;
function defaultClient() {
  if (!_defaultClient) _defaultClient = createSupabaseServiceClient();
  return _defaultClient;
}

// FR-3 (SD-LEO-INFRA-VISION-LADDER-V1-001): the 4 new idea-source pools join the original 3.
const VALID_POOLS = new Set([
  'eva_consultant_rec', 'sd_proposal', 'prd_payload_file',
  'todoist_todo', 'youtube_playlist', 'ehg_folder', 'estate_corpus',
]);
const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
// FR-2: the honest disposition vocabulary. The 5 TERMINAL values exit the backlog;
// 'converted' is retained as a NON-terminal in-flight marker (an SD created but not yet LIVE
// is NOT 'built'). The legacy values (dismissed/merged_duplicate/deferred) are no longer
// EMITTED by this code (the DB CHECK still allows them for safety; the gauge never credits them).
const TERMINAL_DISPOSITIONS = new Set(['built', 'already_covered', 'duplicate', 'declined', 'deferred_to_rung']);
const VALID_DISPOSITIONS = new Set([...TERMINAL_DISPOSITIONS, 'converted']);
const VALID_TARGET_RUNGS = new Set(['v2', 'v3']);

/**
 * Idempotently register a normalized intake item. Re-registering the same
 * (source_pool, source_id) does NOT overwrite an existing disposition — it
 * returns the existing row. Returns the ledger row.
 *
 * @param {Object} item - {source_pool, source_id, source_external_id?, title, description?, normalized_priority?}
 * @param {Object} [opts] - {client}
 */
export async function registerItem(item, opts = {}) {
  const db = opts.client || defaultClient();
  if (!item || !VALID_POOLS.has(item.source_pool)) {
    throw new Error(`registerItem: invalid source_pool: ${item && item.source_pool}`);
  }
  if (item.source_id == null || String(item.source_id).length === 0) {
    throw new Error('registerItem: source_id is required');
  }
  if (!item.title) throw new Error('registerItem: title is required');
  if (item.normalized_priority != null && !VALID_PRIORITIES.has(item.normalized_priority)) {
    throw new Error(`registerItem: invalid normalized_priority: ${item.normalized_priority}`);
  }

  const row = {
    source_pool: item.source_pool,
    source_id: String(item.source_id),
    source_external_id: item.source_external_id ?? null,
    title: item.title,
    description: item.description ?? null,
    normalized_priority: item.normalized_priority ?? null,
    intake_status: 'registered',
  };

  // Idempotent: insert; on (source_pool, source_id) conflict do nothing.
  const ins = await db.from('conversion_ledger')
    .upsert(row, { onConflict: 'source_pool,source_id', ignoreDuplicates: true })
    .select('*');
  if (ins.error) throw new Error(`registerItem upsert failed: ${ins.error.message}`);

  if (Array.isArray(ins.data) && ins.data.length > 0) return ins.data[0]; // freshly inserted

  // Already existed — return the existing row (disposition preserved).
  const sel = await db.from('conversion_ledger')
    .select('*')
    .eq('source_pool', item.source_pool)
    .eq('source_id', String(item.source_id))
    .maybeSingle();
  if (sel.error) throw new Error(`registerItem reselect failed: ${sel.error.message}`);
  if (!sel.data) throw new Error(`registerItem: upsert inserted no row AND reselect found none for ${item.source_pool}:${item.source_id} (unexpected)`);
  return sel.data;
}

/**
 * Move a ledger item to a terminal disposition (idempotent re-apply is safe).
 * @param {string} id - conversion_ledger.id
 * @param {Object} verdict - {disposition, triage_verdict?, dedup_match_sd_key?, dedup_score?, dismiss_reason?, linked_sd_key?, promoted_proposal_path?}
 * @param {Object} [opts] - {client}
 */
export async function setDisposition(id, verdict, opts = {}) {
  const db = opts.client || defaultClient();
  if (!id) throw new Error('setDisposition: id is required');
  if (!verdict || !VALID_DISPOSITIONS.has(verdict.disposition)) {
    throw new Error(`setDisposition: invalid disposition: ${verdict && verdict.disposition}`);
  }
  // FR-2: deferred_to_rung MUST name the rung (a closed enum) so the disposition is
  // machine-probeable; target_rung is meaningless for any other disposition.
  if (verdict.disposition === 'deferred_to_rung') {
    if (!VALID_TARGET_RUNGS.has(verdict.target_rung)) {
      throw new Error(`setDisposition: deferred_to_rung requires target_rung in {v2,v3}, got: ${verdict.target_rung}`);
    }
  } else if (verdict.target_rung != null) {
    throw new Error(`setDisposition: target_rung is only valid for deferred_to_rung (got disposition=${verdict.disposition})`);
  }
  const patch = {
    disposition: verdict.disposition,
    triage_verdict: verdict.triage_verdict ?? null,
    dedup_match_sd_key: verdict.dedup_match_sd_key ?? null,
    dedup_score: verdict.dedup_score ?? null,
    dismiss_reason: verdict.dismiss_reason ?? null,
    linked_sd_key: verdict.linked_sd_key ?? null,
    promoted_proposal_path: verdict.promoted_proposal_path ?? null,
    target_rung: verdict.target_rung ?? null,
    intake_status: 'triaged',
    triaged_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from('conversion_ledger').update(patch).eq('id', id).select('*').maybeSingle();
  if (error) throw new Error(`setDisposition failed: ${error.message}`);
  return data;
}

/**
 * Backlog depth — items with no terminal disposition yet.
 * @param {Object} [opts] - {client}
 * @returns {Promise<number>}
 */
export async function backlogDepth(opts = {}) {
  const db = opts.client || defaultClient();
  // HONEST-GAUGE (FR-2): an item exits the backlog ONLY when it carries one of the 5
  // machine-verifiable TERMINAL dispositions. Everything else — NULL (untriaged), a parking
  // 'deferred', or an in-flight 'converted' (an SD created but not yet LIVE) — counts as
  // UN-dispositioned, so criterion-8 can never lie-high (presence != realized). Computed as
  // total - terminal because a `NOT IN (...)` filter silently drops NULL rows (NULL NOT IN = NULL).
  const total = await db.from('conversion_ledger').select('id', { count: 'exact', head: true });
  if (total.error) throw new Error(`backlogDepth failed: ${total.error.message}`);
  const terminal = await db.from('conversion_ledger')
    .select('id', { count: 'exact', head: true })
    .in('disposition', [...TERMINAL_DISPOSITIONS]);
  if (terminal.error) throw new Error(`backlogDepth failed: ${terminal.error.message}`);
  return (total.count || 0) - (terminal.count || 0);
}

export const _internals = { VALID_POOLS, VALID_PRIORITIES, VALID_DISPOSITIONS, TERMINAL_DISPOSITIONS, VALID_TARGET_RUNGS };
