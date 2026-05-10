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
 * @module lib/governance/resolve-feedback
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOOTER_REGEX = /^[ \t]*Closes\s+(?:feedback|harness\s+backlog)\s+([0-9a-f-]{36})[ \t]*$/gim;

/**
 * Parse "Closes feedback <uuid>" / "Closes harness backlog <uuid>" footers
 * from a multi-line text blob (commit message body, PR body, etc.).
 *
 * Strict UUID v1-5 shape required; malformed UUIDs are silently dropped.
 * Returns deduplicated array of lowercased UUID strings preserving discovery order.
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

export default { parseFeedbackFooters, resolveFeedback };
