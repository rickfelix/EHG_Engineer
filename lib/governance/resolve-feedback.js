/**
 * Idempotent feedback-row resolver — closes 15th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
 *
 * SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 FR-1.
 *
 * Two callers (initial scope):
 *   - scripts/modules/complete-quick-fix/orchestrator.js post-merge step
 *   - scripts/handoff.js LEAD-FINAL-APPROVAL post-merge step (future, out of v1 scope)
 *
 * Why a shared helper:
 *   The auto-resolve UPDATE shape and idempotency guard need to match across
 *   call sites; consolidating prevents future drift between QF-completion and
 *   SD-completion paths.
 *
 * QF-20260511-556 extends the parser to accept 8-char short-UUID prefixes
 * (the form `/leo inbox` actually displays); short IDs are expanded via DB
 * lookup with ambiguity guard. Closes harness backlog 769b4aa7.
 *
 * @module lib/governance/resolve-feedback
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_ID_REGEX = /^[0-9a-f]{8}$/i;
const FOOTER_REGEX = /^[ \t]*Closes\s+(?:feedback|harness\s+backlog)\s+([0-9a-f-]{36})[ \t]*$/gim;
const FOOTER_REGEX_LOOSE = /^[ \t]*Closes\s+(?:feedback|harness\s+backlog)\s+([0-9a-f][0-9a-f-]{7,35})[ \t]*$/gim;

/**
 * Parse "Closes feedback <uuid>" / "Closes harness backlog <uuid>" footers
 * from a multi-line text blob (commit message body, PR body, etc.).
 *
 * Strict UUID v1-5 shape required; malformed UUIDs are silently dropped.
 * Returns deduplicated array of lowercased UUID strings preserving discovery order.
 *
 * Preserved for backward compatibility. Prefer `parseAndExpandFeedbackFooters`
 * for new call sites — it also handles 8-char short IDs (as displayed in
 * `/leo inbox`).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function parseFeedbackFooters(text) {
  if (!text || typeof text !== 'string') return [];
  const seen = new Set();
  const out = [];
  for (const match of text.matchAll(FOOTER_REGEX)) {
    const uuid = (match[1] || '').toLowerCase();
    if (!UUID_REGEX.test(uuid)) continue;
    if (seen.has(uuid)) continue;
    seen.add(uuid);
    out.push(uuid);
  }
  return out;
}

/**
 * Parse footers (lenient) and expand 8-char short UUID prefixes via DB lookup.
 *
 * Accepts both full 36-char UUIDs and 8-char hex prefixes — the latter being
 * the form actually displayed by `/leo inbox`, which previously caused silent
 * misses (harness backlog 769b4aa7). Short prefixes are expanded by querying
 * the `feedback` table over a UUID range; only exact-1 matches are accepted.
 * Zero matches and ambiguous (>1) prefixes are warn-skipped.
 *
 * Fail-soft: DB errors on a single prefix produce a warning, not an exception;
 * other footers in the same corpus still process.
 *
 * @param {Object} args
 * @param {string} args.text
 * @param {Object} args.supabase
 * @returns {Promise<{ uuids: string[], warnings: string[] }>}
 */
export async function parseAndExpandFeedbackFooters({ text, supabase } = {}) {
  if (!text || typeof text !== 'string') return { uuids: [], warnings: [] };
  const seenUuids = new Set();
  const seenShort = new Set();
  const fullUuids = [];
  const shortIds = [];
  const warnings = [];

  for (const match of text.matchAll(FOOTER_REGEX_LOOSE)) {
    const token = (match[1] || '').toLowerCase();
    if (UUID_REGEX.test(token)) {
      if (!seenUuids.has(token)) {
        seenUuids.add(token);
        fullUuids.push(token);
      }
    } else if (SHORT_ID_REGEX.test(token)) {
      if (!seenShort.has(token)) {
        seenShort.add(token);
        shortIds.push(token);
      }
    }
  }

  if (shortIds.length > 0 && !supabase) {
    warnings.push(`Short UUID prefixes in footer but no supabase client: skipped ${shortIds.join(', ')}`);
    return { uuids: fullUuids, warnings };
  }

  for (const prefix of shortIds) {
    const lo = `${prefix}-0000-0000-0000-000000000000`;
    const hi = `${prefix}-ffff-ffff-ffff-ffffffffffff`;
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('id')
        .gte('id', lo)
        .lte('id', hi)
        .limit(2);
      if (error) {
        warnings.push(`feedback ${prefix}: lookup error: ${error.message}`);
        continue;
      }
      if (!data || data.length === 0) {
        warnings.push(`feedback ${prefix}: no match (use full 36-char UUID)`);
        continue;
      }
      if (data.length > 1) {
        warnings.push(`feedback ${prefix}: ambiguous (>=2 matches; use full 36-char UUID)`);
        continue;
      }
      const fullId = String(data[0].id).toLowerCase();
      if (!seenUuids.has(fullId)) {
        seenUuids.add(fullId);
        fullUuids.push(fullId);
      }
    } catch (err) {
      warnings.push(`feedback ${prefix}: lookup threw: ${err?.message || String(err)}`);
    }
  }

  return { uuids: fullUuids, warnings };
}

/**
 * Resolve a single feedback row — idempotent UPDATE.
 *
 * Sets status='resolved', resolved_at=NOW(), and optionally feedback.quick_fix_id /
 * feedback.resolution_sd_id (both are real columns; risk-agent confirmed for
 * SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 81ac5e04). Idempotency guard is
 * `WHERE status != 'resolved'`; re-runs UPDATE zero rows and return
 * `{ updated: false, reason: 'already_resolved' }`.
 *
 * Fail-soft: callers (orchestrator.js post-merge) wrap this in try/catch.
 * This function does NOT throw on DB errors — it returns
 * `{ updated: false, error: <msg> }` so callers can warn-not-fail.
 *
 * @param {Object} args
 * @param {Object} args.supabase
 * @param {string} args.feedbackId
 * @param {string} [args.quickFixId]
 * @param {string} [args.sdId]
 * @param {string} [args.notes]
 * @returns {Promise<{ updated: boolean, id?: string, reason?: string, error?: string }>}
 */
export async function resolveFeedback({ supabase, feedbackId, quickFixId, sdId, notes } = {}) {
  if (!supabase) return { updated: false, error: 'no_supabase' };
  if (!feedbackId || typeof feedbackId !== 'string') return { updated: false, error: 'no_feedback_id' };
  if (!UUID_REGEX.test(feedbackId)) return { updated: false, error: 'invalid_feedback_id' };

  const update = {
    status: 'resolved',
    resolved_at: new Date().toISOString(),
  };
  if (quickFixId) update.quick_fix_id = quickFixId;
  if (sdId) update.resolution_sd_id = sdId;
  if (notes) update.resolution_notes = notes;

  try {
    const { data, error } = await supabase
      .from('feedback')
      .update(update)
      .eq('id', feedbackId)
      .neq('status', 'resolved')
      .select('id');

    if (error) {
      return { updated: false, error: error.message };
    }
    if (!data || data.length === 0) {
      return { updated: false, id: feedbackId, reason: 'no_row_or_already_resolved' };
    }
    return { updated: true, id: feedbackId };
  } catch (err) {
    return { updated: false, error: err?.message || String(err) };
  }
}

export default { parseFeedbackFooters, parseAndExpandFeedbackFooters, resolveFeedback };
