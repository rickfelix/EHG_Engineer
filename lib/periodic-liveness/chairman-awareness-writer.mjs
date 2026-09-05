/**
 * SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001 / FR-2.
 *
 * Writes a NON-BLOCKING, venture-less chairman_decisions awareness row for a laddered process
 * whose owner is dead/unresolvable or is the chairman himself -- replacing emitLadderDigest's
 * previous blocking:true insert (ladder-escalation.mjs:267), which unconditionally fired a
 * standout chairman email on every mint via shouldAutoEscalate().
 *
 * NOT a call into lib/eva/chairman-decision-watcher.js's createAdvisoryNotification: that
 * function hard-guards on `!ventureId || stageNumber === undefined` and returns null for
 * venture_id=null, which every live periodic-liveness ladder row has -- calling it directly
 * would convert the email flood into total silence.
 *
 * The summary prefix is DELIBERATELY DISTINCT from ladder-escalation.mjs's DIGEST_PREFIX
 * ("Periodic-liveness ladder:") -- findRecentlyDismissedSignatures (ladder-escalation.mjs:164-199)
 * treats ANY non-pending row under that prefix with a fresh updated_at as a standing dismissal;
 * a same-prefixed, daily-refreshed, status=approved awareness row would be read as one and
 * permanently suppress re-escalation of every process it names (security-agent finding).
 *
 * KNOWN LIMITATION: the one-row-per-day throttle is calendar-day granularity (UTC), not a
 * rolling 24h window -- a process that ladders at 23:59 and again at 00:01 the next day gets
 * two rows. This mirrors emitLadderDigest's own per-tick (not per-episode) granularity choice
 * and is accepted as a data-shape decision, not a defect: undercounting distinct incidents is
 * preferable to re-introducing per-mint chairman emails.
 */
export const AWARENESS_SUMMARY_PREFIX = 'Periodic-liveness awareness:';
export const RECORDED_VIA = 'ladder-escalation-advisory';

/**
 * Pure: build the full chairman_decisions insert/update row shape. All 6 fields are
 * required by the live NOT NULL/CHECK constraints on chairman_decisions (lifecycle_stage and
 * decision_type have no default -- an earlier draft omitting them would 23502 on insert, and
 * the surrounding fail-soft catch would swallow that error, reproducing exactly the
 * total-silence failure this FR exists to prevent).
 * @param {{escalatingKeys:string[], reason:'dead_owner'|'chairman_owned'}} args
 * @returns {object}
 */
export function buildAwarenessRow({ escalatingKeys, reason }) {
  const title = escalatingKeys.length === 1
    ? `${AWARENESS_SUMMARY_PREFIX} ${escalatingKeys[0]}`
    : `${AWARENESS_SUMMARY_PREFIX} ${escalatingKeys.length} processes`;
  return {
    venture_id: null,
    lifecycle_stage: 0,
    decision: 'advisory',
    decision_type: 'advisory',
    status: 'approved',
    blocking: false,
    summary: title,
    brief_data: {
      title,
      recorded_via: RECORDED_VIA,
      reason,
      process_keys: escalatingKeys,
      minted_context: { process_keys: escalatingKeys, minted_at: new Date().toISOString() },
    },
  };
}

/** UTC calendar-day key, e.g. "2026-09-05". */
function todayKeyUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Find today's (UTC) still-open awareness row, if one exists. Read-only; fail-soft to null.
 * @param {object} supabase
 * @returns {Promise<object|null>}
 */
export async function findTodaysAwarenessRow(supabase, now = new Date()) {
  try {
    const dayStart = `${todayKeyUtc(now)}T00:00:00.000Z`;
    const { data, error } = await supabase
      .from('chairman_decisions')
      .select('id, brief_data, created_at')
      .like('summary', `${AWARENESS_SUMMARY_PREFIX}%`)
      .gte('created_at', dayStart)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch (e) {
    console.error(`[chairman-awareness-writer] findTodaysAwarenessRow threw: ${e.message}`);
    return null;
  }
}

/**
 * Write or refresh today's non-blocking awareness row (one per UTC calendar day, regardless of
 * how many distinct dead-owner/chairman-owned processes ladder that day). Refresh MERGES the new
 * process key into the existing row's process_keys rather than overwriting, so the mint-time
 * minted_context of earlier-named processes is preserved (the same forensic-preservation
 * principle FR-3 applies to ladder digests).
 *
 * @param {object} supabase
 * @param {{processKey:string, reason:'dead_owner'|'chairman_owned'}} args
 * @param {{findExisting?: Function}} [deps] - injectable for tests
 * @returns {Promise<{written:boolean, id?:string, refreshed?:boolean, error?:string}>}
 */
export async function writeChairmanAwareness(supabase, { processKey, reason }, deps = {}) {
  const { findExisting = findTodaysAwarenessRow } = deps;
  try {
    const existing = await findExisting(supabase);
    if (existing) {
      const priorKeys = existing.brief_data?.process_keys || [];
      const mergedKeys = priorKeys.includes(processKey) ? priorKeys : [...priorKeys, processKey];
      const refreshedRow = buildAwarenessRow({ escalatingKeys: mergedKeys, reason });
      // Preserve original mint-time context; only append the new key to the live summary/context.
      refreshedRow.brief_data.minted_context = existing.brief_data?.minted_context || refreshedRow.brief_data.minted_context;
      const { error } = await supabase
        .from('chairman_decisions')
        .update({ summary: refreshedRow.summary, brief_data: refreshedRow.brief_data, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) {
        console.error(`[chairman-awareness-writer] refresh failed for ${processKey}: ${error.message}`);
        return { written: false, error: error.message };
      }
      return { written: true, id: existing.id, refreshed: true };
    }

    const row = buildAwarenessRow({ escalatingKeys: [processKey], reason });
    const { data, error } = await supabase.from('chairman_decisions').insert(row).select('id').single();
    if (error) {
      console.error(`[chairman-awareness-writer] insert failed for ${processKey}: ${error.message}`);
      return { written: false, error: error.message };
    }
    return { written: true, id: data.id, refreshed: false };
  } catch (e) {
    console.error(`[chairman-awareness-writer] writeChairmanAwareness threw for ${processKey}: ${e.message}`);
    return { written: false, error: e.message };
  }
}

/**
 * Find the most recent awareness row (any day) that names processKey and has not yet resolved
 * it -- unlike findTodaysAwarenessRow (which scopes to the current UTC day for the write/throttle
 * path), resolution must find a row from a PRIOR day if the process recovered after midnight.
 * Read-only; fail-soft to null.
 * @param {object} supabase
 * @param {string} processKey
 * @returns {Promise<object|null>}
 */
export async function findUnresolvedAwarenessRowForProcess(supabase, processKey) {
  try {
    const { data, error } = await supabase
      .from('chairman_decisions')
      .select('id, brief_data')
      .like('summary', `${AWARENESS_SUMMARY_PREFIX}%`)
      .contains('brief_data', { process_keys: [processKey] })
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return null;
    return (data || []).find((row) => !(row.brief_data?.resolved_at_by_key || {})[processKey]) || null;
  } catch (e) {
    console.error(`[chairman-awareness-writer] findUnresolvedAwarenessRowForProcess threw for ${processKey}: ${e.message}`);
    return null;
  }
}

/**
 * FR-3: mark a SPECIFIC process_key resolved within an awareness row (a row can name multiple
 * process_keys merged across a day, so resolution is per-key, not per-row) -- stamps
 * brief_data.resolved_at_by_key[processKey], never mutates status (already approved-at-mint and
 * non-actionable by design).
 * @param {object} supabase
 * @param {string} processKey
 * @param {{findRow?: Function}} [deps] - injectable for tests
 * @returns {Promise<{resolved:boolean, id?:string, error?:string}>}
 */
export async function resolveChairmanAwareness(supabase, processKey, deps = {}) {
  const { findRow = findUnresolvedAwarenessRowForProcess } = deps;
  try {
    const row = await findRow(supabase, processKey);
    if (!row) return { resolved: false, error: 'no unresolved awareness row found for process' };
    const resolvedAtByKey = { ...(row.brief_data?.resolved_at_by_key || {}), [processKey]: new Date().toISOString() };
    const mergedBriefData = { ...(row.brief_data || {}), resolved_at_by_key: resolvedAtByKey };
    const { error } = await supabase.from('chairman_decisions').update({ brief_data: mergedBriefData }).eq('id', row.id);
    if (error) return { resolved: false, error: error.message };
    return { resolved: true, id: row.id };
  } catch (e) {
    console.error(`[chairman-awareness-writer] resolveChairmanAwareness threw for ${processKey}: ${e.message}`);
    return { resolved: false, error: e.message };
  }
}
