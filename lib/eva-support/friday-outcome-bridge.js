/**
 * lib/eva-support/friday-outcome-bridge.js
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / FR-3, FR-6, TR-5, US-006
 *
 * Bridges Friday meeting outcomes to EVA Support pushback context.
 *
 * Two operations:
 *   - surfacePending(): read unconsumed eva_friday_outcomes (CAS UPDATE consumed_at)
 *     for the next /eva-support invocation to surface in pushback context.
 *   - writeOutcome(): record a Friday meeting decision row (consumed_at NULL).
 *
 * Fail-soft posture (per unlock_gate_override constraint #1): all errors return
 * empty / falsy results so Phase 2 wiring never blocks Phase 1 flows.
 */

import { createClient } from '@supabase/supabase-js';

const TABLE = 'eva_friday_outcomes';

function defaultClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('friday-outcome-bridge: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  return createClient(url, key);
}

function isSchemaCacheMiss(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = error.message || '';
  return code === 'PGRST205' || code === '42P01' || /schema cache/i.test(msg) || /relation .* does not exist/i.test(msg);
}

const ALLOWED_OUTCOMES = new Set(['accepted', 'deferred', 'rejected', 'noted']);

/**
 * Read unconsumed Friday outcomes and CAS-update consumed_at=now() in one atomic step.
 * Returns the surfaced rows (array). Empty array on no work / fail-soft errors.
 */
export async function surfacePending({ client, limit = 10 } = {}) {
  let c;
  try {
    c = client ?? defaultClient();
  } catch {
    return [];
  }

  // Step 1: read unconsumed rows (ORDER BY meeting_date DESC).
  const { data: rows, error: readErr } = await c
    .from(TABLE)
    .select('outcome_id, agenda_item_ref, outcome, chairman_feedback, meeting_date, created_at')
    .is('consumed_at', null)
    .order('meeting_date', { ascending: false })
    .limit(limit);

  if (readErr) {
    if (isSchemaCacheMiss(readErr)) return [];
    return [];
  }
  if (!rows || rows.length === 0) return [];

  // Step 2: CAS UPDATE consumed_at — only update rows that are STILL NULL (parallel-safe).
  const ids = rows.map((r) => r.outcome_id);
  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await c
    .from(TABLE)
    .update({ consumed_at: nowIso })
    .in('outcome_id', ids)
    .is('consumed_at', null)
    .select('outcome_id');

  if (updErr) {
    // Fail-soft: surfacing without consuming would replay on next invocation; cheap to retry.
    return [];
  }

  // Filter: only return rows that the CAS update actually claimed (parallel-safety).
  const claimedIds = new Set((updated || []).map((u) => u.outcome_id));
  return rows.filter((r) => claimedIds.has(r.outcome_id));
}

/**
 * Render an array of surfaced Friday outcomes as markdown for the EVA Support
 * pushback context. Empty input returns empty string (silent skip per FR-3).
 */
export function renderPushbackMarkdown(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const lines = ['## Friday meeting outcomes (since last /eva-support invocation)', ''];
  for (const r of rows) {
    const date = r.meeting_date ? `(${r.meeting_date})` : '';
    const feedback = r.chairman_feedback ? ` — ${r.chairman_feedback}` : '';
    lines.push(`- **${r.outcome.toUpperCase()}** ${date}: ${r.agenda_item_ref}${feedback}`);
  }
  return lines.join('\n');
}

/**
 * Write a new Friday outcome row (consumed_at NULL).
 *
 * @param {object} params
 * @param {string} params.agendaItemRef - free-form agenda item reference
 * @param {string} params.outcome - one of accepted | deferred | rejected | noted
 * @param {string} [params.chairmanFeedback] - free-text feedback (nullable)
 * @param {string} [params.meetingDate] - YYYY-MM-DD; defaults to today (UTC)
 * @param {object} [params.client] - supabase client
 * @returns {Promise<{written: boolean, outcome_id?: string, error?: object}>}
 */
export async function writeOutcome({ agendaItemRef, outcome, chairmanFeedback = null, meetingDate, client } = {}) {
  if (!agendaItemRef || typeof agendaItemRef !== 'string') return { written: false, error: { code: 'BAD_INPUT', message: 'agendaItemRef (string) required' } };
  if (!ALLOWED_OUTCOMES.has(outcome)) return { written: false, error: { code: 'BAD_OUTCOME', message: `outcome must be one of ${[...ALLOWED_OUTCOMES].join(', ')}` } };
  const date = meetingDate || new Date().toISOString().slice(0, 10);

  let c;
  try {
    c = client ?? defaultClient();
  } catch {
    return { written: false };
  }

  const { data, error } = await c
    .from(TABLE)
    .insert({
      agenda_item_ref: agendaItemRef,
      outcome,
      chairman_feedback: chairmanFeedback,
      meeting_date: date,
    })
    .select('outcome_id')
    .maybeSingle();

  if (error) {
    if (isSchemaCacheMiss(error)) return { written: false, error };
    return { written: false, error };
  }
  return { written: true, outcome_id: data?.outcome_id };
}

export default { surfacePending, writeOutcome, renderPushbackMarkdown };
