/**
 * SD-LEO-INFRA-FIX-CHAIRMAN-HOURLY-001 (FR-1) — once-per-hour send guard for the chairman
 * exec email.
 *
 * GitHub Actions drops/delays scheduled cron runs, so the workflow is over-scheduled (~every
 * 15 min). This guard ensures the chairman gets EXACTLY ONE email per ~hour with no duplicates,
 * by keying on a durable last-send marker in audit_log (event_type='adam_exec_email_sent').
 *
 * Fail-safe policy (per LEAD risk review row 09339424):
 *   - FAIL-CLOSED on a marker READ error: prefer a missed hour over spamming the chairman.
 *   - ANTI-STUCK: a future-dated / unparseable marker is IGNORED (=> send), so a single bad row
 *     can never permanently wedge the channel. Only a real marker within [now-55min, now] skips.
 *   - The marker is written ONLY AFTER a successful send (recordSent), fail-soft.
 *
 * audit_log requires event_type + entity_type + entity_id (all NOT NULL); new_value/metadata are
 * jsonb. We use created_at (timestamptz) as the authoritative send-time and stash the FR-2
 * completion-window boundary in metadata.window_end.
 */

export const SEND_MARKER_EVENT = 'adam_exec_email_sent';
export const SEND_MARKER_ENTITY = 'adam_exec_email';
export const SEND_MARKER_ENTITY_ID = 'hourly';
export const GUARD_WINDOW_MS = 55 * 60 * 1000; // ~once per hour, with margin under the 60-min cadence

/**
 * PURE — decide whether to SKIP the send given the last-send time (ms) and now (ms).
 * @param {{lastSentMs: number|null, nowMs: number, windowMs?: number}} p
 * @returns {boolean} true => skip (too soon); false => send
 */
export function decideSkip({ lastSentMs, nowMs, windowMs = GUARD_WINDOW_MS }) {
  if (lastSentMs == null) return false;             // no prior send => send
  if (!Number.isFinite(lastSentMs)) return false;   // unparseable marker => anti-stuck => send
  if (!Number.isFinite(nowMs)) return false;        // no clock => send (the email run itself sets now)
  if (lastSentMs > nowMs) return false;             // future-dated marker => anti-stuck => send
  return (nowMs - lastSentMs) < windowMs;           // within window => skip
}

/**
 * IO — should we send now? Reads the latest send marker. FAIL-CLOSED on read error (send:false).
 * Also returns the previous window_end (the FR-2 completion-window boundary) when available.
 * @param {object} db - supabase client
 * @param {{nowMs?: number, windowMs?: number}} [opts]
 * @returns {Promise<{send: boolean, reason: string, windowEnd: string|null}>}
 */
export async function shouldSendNow(db, opts = {}) {
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const windowMs = opts.windowMs || GUARD_WINDOW_MS;
  if (!db) return { send: false, reason: 'no_db', windowEnd: null };
  try {
    const { data, error } = await db.from('audit_log')
      .select('created_at, metadata')
      .eq('event_type', SEND_MARKER_EVENT)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return { send: false, reason: 'marker_read_error:' + error.message, windowEnd: null }; // fail-closed
    const row = data && data[0];
    const lastSentMs = row ? Date.parse(row.created_at) : null;
    const windowEnd = row ? ((row.metadata && row.metadata.window_end) || row.created_at) : null;
    const skip = decideSkip({ lastSentMs, nowMs, windowMs });
    return { send: !skip, reason: skip ? 'within_window' : (row ? 'window_elapsed' : 'no_marker'), windowEnd };
  } catch (e) {
    return { send: false, reason: 'marker_read_exception:' + (e && e.message ? e.message : e), windowEnd: null }; // fail-closed
  }
}

/**
 * IO — record a successful send marker (AFTER r.success). Fail-soft: a write error never throws.
 * @param {object} db
 * @param {{sentIso?: string, windowStartIso?: string|null, windowEndIso?: string, sdCount?: number}} [p]
 * @returns {Promise<{ok: boolean, error: string|null}>}
 */
export async function recordSent(db, p = {}) {
  if (!db) return { ok: false, error: 'no_db' };
  const sentIso = p.sentIso || new Date(Date.now()).toISOString();
  try {
    const { error } = await db.from('audit_log').insert({
      event_type: SEND_MARKER_EVENT,
      entity_type: SEND_MARKER_ENTITY,
      entity_id: SEND_MARKER_ENTITY_ID,           // NOT NULL
      severity: 'info',
      created_by: 'adam-exec-email',
      created_at: sentIso,                          // authoritative send-time (guard reads this)
      metadata: { window_start: p.windowStartIso || null, window_end: p.windowEndIso || sentIso, sd_count: p.sdCount ?? null },
    });
    return { ok: !error, error: error ? error.message : null };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}
