/**
 * Shared insert-a-correction-row helpers for public.feedback (append-only as of
 * database/chairman-gated/20260907_feedback_immutability_trigger.sql -- SD-LEO-ORCH-CAPA-
 * DURABILITY-AUDIT-001-E). UPDATE/DELETE/TRUNCATE are unconditionally rejected; a correction
 * is recorded as a NEW row that carries the prior row forward, per the trigger's own
 * prescribed pattern. Precedent: QF-20260911-515's scripts/gauge-runner.mjs fix.
 *
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A.
 *
 * @module lib/governance/feedback-correction
 */

/**
 * Root identity for a feedback row across a correction chain. ALWAYS the original row's id
 * -- never the immediately-prior row's id -- so a single lookup (fetchLatestFeedback) finds
 * the current state with no multi-hop chain-walking, regardless of how many corrections deep
 * a given feedback item is.
 *
 * @param {object} row
 * @returns {string|null}
 */
export function rootIdOf(row) {
  return row?.metadata?.corrects_feedback_id || row?.id || null;
}

/**
 * Build an INSERT payload recording a correction to `existingRow`. Never call .update() on
 * feedback -- the append-only trigger rejects it unconditionally.
 *
 * - Drops `id`/`created_at` (DB defaults apply: a fresh id and created_at = now(), i.e. "when
 *   this correction was recorded" -- the ORIGINAL report time is preserved separately via
 *   metadata.original_created_at).
 * - ALWAYS nulls `error_hash` and strips `metadata.dedup_hash` from the copied metadata.
 *   public.feedback carries three live partial UNIQUE indexes keyed on these fields
 *   (idx_feedback_venture_error_hash, idx_feedback_error_capture_hash,
 *   idx_feedback_telemetry_dedup); reproducing them on a correction row risks a 23505
 *   collision with the very row being corrected. NULL is never equal to NULL under a unique
 *   index, so this structurally avoids all three without per-index special-casing.
 * - Sets metadata.corrects_feedback_id = rootIdOf(existingRow) and preserves
 *   metadata.original_created_at (falls back to existingRow.created_at on the first
 *   correction in a chain).
 * - Applies `changes` last (including changes.metadata, shallow-merged over the carried-
 *   forward metadata) and stamps a fresh `updated_at`.
 *
 * @param {object} existingRow the current feedback row (any row in a correction chain)
 * @param {object} [changes] fields to change on the correction (may include `metadata`)
 * @returns {object} an INSERT-ready payload for supabase.from('feedback').insert(...)
 */
export function buildFeedbackCorrection(existingRow, changes = {}) {
  if (!existingRow?.id) {
    throw new Error('buildFeedbackCorrection requires an existing feedback row with an id');
  }
  const rootId = rootIdOf(existingRow);
  const { id: _id, created_at, metadata: existingMetadata, ...rest } = existingRow;
  const { metadata: changedMetadata, ...changedRest } = changes;

  return {
    ...rest,
    ...changedRest,
    error_hash: changedRest.error_hash ?? null,
    updated_at: new Date().toISOString(),
    metadata: {
      ...(existingMetadata || {}),
      dedup_hash: undefined,
      original_created_at: existingMetadata?.original_created_at || created_at,
      ...(changedMetadata || {}),
      corrects_feedback_id: rootId,
    },
  };
}

/**
 * Resolve any id in a correction chain to its current (latest) row.
 *
 * Two round trips: (1) fetch the given row to find its root, (2) a root-scoped query for
 * every row claiming that root -- either the root itself (no corrects_feedback_id) or a
 * correction pointing at it -- ordered by created_at DESC, id DESC. The secondary `id DESC`
 * is a DETERMINISTIC tie-break, not a recency claim: two corrections can share a created_at
 * timestamp, and without a fixed secondary key the same query could return a different row on
 * repeated calls, silently breaking every idempotency guard built on top of "the latest row".
 *
 * FAIL-CLOSED CONTRACT: on any DB error this returns `{ error }` and resolves NOTHING. Every
 * caller MUST treat that as "cannot determine current state" -- refuse to write / surface an
 * error -- and must NEVER fall back to trusting the raw, possibly-stale root row as if it were
 * current (that would reintroduce the exact non-termination class this module exists to close).
 *
 * @param {object} supabase
 * @param {string} feedbackId any id in the chain (root or a correction)
 * @returns {Promise<{row: object, rootId: string} | {error: string}>}
 */
export async function fetchLatestFeedback(supabase, feedbackId) {
  const { data: base, error: baseErr } = await supabase
    .from('feedback')
    .select('*')
    .eq('id', feedbackId)
    .maybeSingle();
  if (baseErr) return { error: baseErr.message };
  if (!base) return { error: 'not_found' };

  const rootId = rootIdOf(base);
  const { data: latest, error: latestErr } = await supabase
    .from('feedback')
    .select('*')
    .or(`id.eq.${rootId},metadata->>corrects_feedback_id.eq.${rootId}`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) return { error: latestErr.message };

  return { row: latest || base, rootId };
}

export default { rootIdOf, buildFeedbackCorrection, fetchLatestFeedback };
