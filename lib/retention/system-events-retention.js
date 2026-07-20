/**
 * Bespoke system_events retention pass (SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001 FR-4).
 *
 * system_events cannot take a naive age-cutoff RETENTION_POLICIES entry because three live
 * readers do unbounded "latest row" lookups:
 *   - lib/decision-binding/disposition.js: latest DECISION_DISPOSITION row per idempotency_key,
 *     with payload->>status='awaiting_disposition' (non-terminal) rows that must never purge.
 *   - lib/governance/manifesto-mode.js: latest signing event per event_type.
 *   - lib/governance/portfolio-calibrator.js: latest AGENT_OUTCOME row per venture_id.
 *
 * This pass purges rows older than the hot cutoff EXCEPT the single most-recent row per
 * (event_type, group key) and any row whose payload/event_data status is non-terminal.
 * Archive-before-delete, mirroring scripts/retention-enforce.js's invariant.
 */

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — the retention pass ARCHIVES
// then DELETES every eligible past-cutoff system_events row; a read silently capped at the
// PostgREST 1000-row max would leave the tail un-swept and quietly under-report `eligible`.
// system_events is an *_events growing table, so paginate the candidate read.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const NON_TERMINAL_STATUSES = new Set(['awaiting_disposition']);
const DELETE_CHUNK = 200;

function statusOf(row) {
  return row.payload?.status ?? row.event_data?.status ?? null;
}

function isNonTerminal(row) {
  const status = statusOf(row);
  return status != null && NON_TERMINAL_STATUSES.has(status);
}

function groupKeyFor(row) {
  if (row.event_type === 'AGENT_OUTCOME') {
    const ventureId = row.venture_id ?? row.event_data?.venture_id ?? row.payload?.venture_id ?? '';
    return `${row.event_type}:${ventureId}`;
  }
  if (row.event_type === 'DECISION_DISPOSITION') {
    return `${row.event_type}:${row.idempotency_key ?? ''}`;
  }
  return row.event_type;
}

async function findLatestIdForGroup(supabase, row) {
  let query = supabase.from('system_events').select('id, created_at').eq('event_type', row.event_type);
  if (row.event_type === 'AGENT_OUTCOME') {
    const ventureId = row.venture_id ?? row.event_data?.venture_id ?? row.payload?.venture_id;
    if (ventureId) query = query.eq('venture_id', ventureId);
  } else if (row.event_type === 'DECISION_DISPOSITION') {
    if (row.idempotency_key) query = query.eq('idempotency_key', row.idempotency_key);
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`latest-for-group lookup failed: ${error.message}`);
  return data?.id ?? null;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ hotDays?: number, now?: Date, runId?: string }} [opts]
 * @returns {Promise<{ eligible: number, preservedLatest: number, preservedNonTerminal: number, archived: number, deleted: number, error: string|null }>}
 */
export async function enforceSystemEventsRetention(supabase, { hotDays = 90, now = new Date(), runId = null } = {}) {
  const cutoff = new Date(now.getTime() - hotDays * 86_400_000).toISOString();
  const result = { eligible: 0, preservedLatest: 0, preservedNonTerminal: 0, archived: 0, deleted: 0, error: null };

  try {
    const candidates = await fetchAllPaginated(() => supabase
      .from('system_events')
      .select('*')
      .lt('created_at', cutoff)
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
    if (!candidates || candidates.length === 0) return result;
    result.eligible = candidates.length;

    const latestIdCache = new Map();
    const toDelete = [];

    for (const row of candidates) {
      const key = groupKeyFor(row);
      if (!latestIdCache.has(key)) {
        latestIdCache.set(key, await findLatestIdForGroup(supabase, row));
      }
      if (latestIdCache.get(key) === row.id) {
        result.preservedLatest += 1;
        continue;
      }
      if (isNonTerminal(row)) {
        result.preservedNonTerminal += 1;
        continue;
      }
      toDelete.push(row);
    }

    if (toDelete.length === 0) return result;

    const archiveRows = toDelete.map((r) => ({
      source_table: 'system_events',
      source_id: r.id != null ? String(r.id) : null,
      row_data: r,
      row_timestamp: r.created_at || null,
      archived_by: 'system-events-retention',
      run_id: runId,
    }));
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 (adversarial-review finding):
    // the candidate read above lost its implicit ~1000-row PostgREST ceiling once paginated,
    // so a single unchunked insert of full-row (JSONB row_data) archive rows can now hit a
    // request-size limit on a large backlog. Chunk it the same way the delete below already is.
    let archivedCount = 0;
    for (const ch of chunk(archiveRows, DELETE_CHUNK)) {
      const { error: insErr, count: insCount } = await supabase
        .from('retention_archive')
        .insert(ch, { count: 'exact' });
      if (insErr) throw new Error(`archive insert failed after ${archivedCount} row(s) archived (rows NOT deleted; safe to rerun): ${insErr.message}`);
      if ((insCount ?? ch.length) !== ch.length) {
        throw new Error(`archive insert count mismatch (${insCount} != ${ch.length}) — aborting before delete`);
      }
      archivedCount += ch.length;
    }
    result.archived = toDelete.length;

    const ids = toDelete.map((r) => r.id);
    for (const ch of chunk(ids, DELETE_CHUNK)) {
      const { error: delErr } = await supabase.from('system_events').delete().in('id', ch);
      if (delErr) throw new Error(`delete failed after archive (rows ARE archived; rerun converges): ${delErr.message}`);
      result.deleted += ch.length;
    }

    return result;
  } catch (err) {
    result.error = err.message;
    return result;
  }
}
