/**
 * SD-LEO-INFRA-FIX-CHAIRMAN-HOURLY-001 (FR-2 / FR-3) — the plain-language "Done in the last
 * hour" section that REPLACES the stale "Distance-to-quit" roadmap prose.
 *
 * Built from SDs completed since the previous email (the FR-1 marker's window_end, half-open
 * [windowStart, now)), rendered for a NON-TECHNICAL chairman: each item uses a chairman-facing
 * one-liner (metadata.chairman_summary) when present, else a cleaned-up title. Honest empty-state
 * ("nothing shipped this hour"). Every IO path is fail-soft so the email is NEVER blocked.
 */

const COLD_START_MS = 60 * 60 * 1000; // first run / no marker => look back 1h (don't dump the backlog)

/**
 * PURE — turn a technical SD title into a plain phrase: drop a leading "SD-..." key, strip a
 * trailing parenthetical of jargon, collapse whitespace, cap length. Never throws.
 * @param {string} title
 * @returns {string}
 */
export function cleanTitle(title) {
  let t = String(title || '').trim();
  if (!t) return 'an internal change';
  t = t.replace(/^SD-[A-Z0-9-]+[:\s-]+/i, '');         // strip a leading SD key
  t = t.replace(/\s*\([^)]*\)\s*$/, '');                // strip a trailing (parenthetical)
  t = t.replace(/\s+/g, ' ').trim();
  if (t.length > 140) t = t.slice(0, 137).trimEnd() + '…';
  if (!t) return 'an internal change';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * PURE — the per-item plain line: chairman_summary if present, else the cleaned title.
 * @param {object} sd - { title, sd_key, metadata }
 * @returns {string}
 */
export function itemLine(sd) {
  const cs = sd && sd.metadata && sd.metadata.chairman_summary;
  if (typeof cs === 'string' && cs.trim()) return cs.trim();
  return cleanTitle((sd && (sd.title || sd.sd_key)) || '');
}

/**
 * PURE — the half-open completion window [startIso, nowIso). startIso = prior window_end, or
 * cold-start (now - 1h). Guards against a future/garbage boundary.
 * @param {{windowEndIso: string|null, nowMs: number}} p
 * @returns {{startIso: string, nowIso: string}}
 */
export function resolveWindow({ windowEndIso, nowMs }) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  let startMs = now - COLD_START_MS;
  const parsed = windowEndIso ? Date.parse(windowEndIso) : NaN;
  if (Number.isFinite(parsed) && parsed <= now && parsed > now - 24 * 60 * 60 * 1000) {
    startMs = parsed; // contiguous with the prior email; ignore future/>24h-stale boundaries
  }
  return { startIso: new Date(startMs).toISOString(), nowIso: new Date(now).toISOString() };
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * PURE — render the section (text + html) from the resolved completed/in-progress lists. Never throws.
 * @param {{completed: object[], inProgress: object[]}} p
 * @returns {{text: string, html: string}}
 */
export function renderRecentWork({ completed = [], inProgress = [] } = {}) {
  const items = Array.isArray(completed) ? completed : [];
  const wip = (Array.isArray(inProgress) ? inProgress : []).slice(0, 3).map((s) => cleanTitle(s.title || s.sd_key));
  const n = items.length;

  const headText = n === 0
    ? 'Done in the last hour: nothing shipped this hour.'
    : `Done in the last hour: ${n} ${n === 1 ? 'item' : 'items'} shipped.`;
  const itemTexts = items.map((s) => '• ' + itemLine(s));
  const wipText = wip.length ? `In progress now: ${wip.join('; ')}.` : '';
  const text = [headText, ...itemTexts, wipText].filter(Boolean).join('\n');

  const headHtml = `<p style="font-size:15px;font-weight:600;margin:8px 0 2px">${escHtml(headText)}</p>`;
  const itemsHtml = n
    ? '<ul style="font-size:14px;margin:0 0 4px;padding-left:18px">' + items.map((s) => `<li style="margin:0 0 3px">${escHtml(itemLine(s))}</li>`).join('') + '</ul>'
    : '';
  const wipHtml = wip.length ? `<p style="font-size:13px;color:#555;margin:2px 0 0">In progress now: ${escHtml(wip.join('; '))}.</p>` : '';
  const html = headHtml + itemsHtml + wipHtml;
  return { text, html };
}

/**
 * IO — load completed-in-window + in-progress SDs. Fail-soft: returns empty lists on any error so
 * the renderer degrades to the honest empty-state and the email is never blocked.
 * @param {object} db
 * @param {{startIso: string, nowIso: string}} window
 * @returns {Promise<{completed: object[], inProgress: object[], degraded: boolean}>}
 */
export async function loadRecentWork(db, { startIso, nowIso } = {}) {
  if (!db) return { completed: [], inProgress: [], degraded: true };
  try {
    const startMs = Date.parse(startIso);
    const nowMs = Date.parse(nowIso);
    // Order by completion_date (NOT updated_at): a busy fleet churns updated_at on old completed SDs
    // (e.g. metadata writes), which under an updated_at order could truncate a genuinely in-window
    // completion past the limit. Ordering by completion_date keeps recent completions at the top.
    const { data: done, error: e1 } = await db.from('strategic_directives_v2')
      .select('sd_key, title, status, completion_date, updated_at, metadata')
      .eq('status', 'completed')
      .order('completion_date', { ascending: false, nullsFirst: false })
      .limit(50);
    if (e1) return { completed: [], inProgress: [], degraded: true };
    const completed = (done || []).filter((r) => {
      const t = Date.parse(r.completion_date || r.updated_at);
      return Number.isFinite(t) && t >= startMs && t < nowMs;
    });
    const { data: wip } = await db.from('strategic_directives_v2')
      .select('sd_key, title, status')
      .in('status', ['in_progress', 'pending_approval'])
      .order('updated_at', { ascending: false })
      .limit(5);
    return { completed, inProgress: wip || [], degraded: false };
  } catch {
    return { completed: [], inProgress: [], degraded: true };
  }
}
